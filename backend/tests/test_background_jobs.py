import json

import pytest
import responses
from django.core import mail

from apps.notifications.models import Notification
from apps.reports.models import Report
from apps.webhooks.models import WebhookDelivery, WebhookEndpoint
from apps.webhooks.signing import sign, verify
from tests.factories import IssueFactory

pytestmark = pytest.mark.django_db

HOOK_URL = "https://hooks.example.com/sprintboard"


@pytest.fixture
def endpoint(project):
    return WebhookEndpoint.objects.create(workspace=project.workspace, url=HOOK_URL)


@pytest.fixture
def commit(django_capture_on_commit_callbacks):
    # run on_commit callbacks (and so the celery tasks) while the test transaction is still open
    return lambda: django_capture_on_commit_callbacks(execute=True)


@responses.activate
def test_issue_change_is_delivered_as_signed_webhook(api, owner, project, endpoint, commit):
    responses.post(HOOK_URL, status=200)
    with commit():
        api.as_member(owner).post("/api/issues/", {"project": project.id, "title": "Ship it"})

    call = responses.calls[0].request
    body = json.loads(call.body)
    assert call.headers["X-Sprintboard-Event"] == "issue.created"
    assert verify(endpoint.secret, call.body, call.headers["X-Sprintboard-Signature"])
    assert body["issue"]["key"] == "WEB-1"
    assert body["actor"]["email"] == owner.user.email

    delivery = WebhookDelivery.objects.get()
    assert delivery.state == "success" and delivery.response_code == 200


@responses.activate
def test_failed_delivery_is_retried_then_marked_failed(api, owner, project, endpoint, commit):
    responses.post(HOOK_URL, status=500)
    with commit():
        api.as_member(owner).post("/api/issues/", {"project": project.id, "title": "x"})
    delivery = WebhookDelivery.objects.get()
    assert delivery.attempts == 5
    assert delivery.state == "failed"
    assert delivery.last_error == "HTTP 500"
    assert len(responses.calls) == 5


@responses.activate
def test_endpoint_event_filter(api, owner, project, endpoint, commit):
    endpoint.events = ["comment.commented"]
    endpoint.save()
    responses.post(HOOK_URL, status=204)
    with commit():
        issue_id = api.as_member(owner).post("/api/issues/", {"project": project.id, "title": "x"}).data["id"]
    with commit():
        api.post("/api/comments/", {"issue": issue_id, "body": "hello"})
    assert [d.event for d in WebhookDelivery.objects.all()] == ["comment.commented"]


def test_webhooks_never_cross_tenants(api, owner, project, endpoint, commit):
    other = IssueFactory()
    WebhookEndpoint.objects.create(workspace=other.workspace, url="https://other.example.com/hook")
    with responses.RequestsMock() as rsps:
        rsps.post(HOOK_URL, status=200)
        with commit():
            api.as_member(owner).post("/api/issues/", {"project": project.id, "title": "x"})
    assert WebhookDelivery.objects.filter(workspace=other.workspace).count() == 0


def test_private_webhook_urls_rejected(api, owner, settings):
    settings.WEBHOOK_ALLOW_PRIVATE_URLS = False
    res = api.as_member(owner).post("/api/webhooks/", {"url": "http://127.0.0.1:6379/"})
    assert res.status_code == 400


def test_secret_shown_only_on_create(api, owner, settings):
    settings.WEBHOOK_ALLOW_PRIVATE_URLS = True
    api.as_member(owner)
    created = api.post("/api/webhooks/", {"url": HOOK_URL, "events": ["issue.created"]}).data
    assert len(created["secret"]) == 48
    listed = api.get("/api/webhooks/").data[0]
    assert listed["secret"].endswith("…")


def test_members_cannot_manage_webhooks(api, owner, member_of):
    api.as_member(member_of(owner.workspace, "member"))
    assert api.get("/api/webhooks/").status_code == 403


def test_signature_helpers():
    body = b'{"a":1}'
    assert verify("s3cret", body, sign("s3cret", body))
    assert not verify("s3cret", body, sign("other", body))


def test_assignment_and_mentions_create_notifications(api, owner, project, member_of, commit):
    dev = member_of(owner.workspace)
    qa = member_of(owner.workspace)
    api.as_member(owner)
    with commit():
        issue_id = api.post("/api/issues/", {"project": project.id, "title": "Fix login", "assignee": dev.user.id}).data["id"]
    with commit():
        api.post("/api/comments/", {"issue": issue_id, "body": f"@{qa.user.email} can you verify?"})

    assert Notification.objects.get(recipient=dev.user, verb="assigned").text.startswith(owner.user.full_name or owner.user.email)
    assert Notification.objects.filter(recipient=qa.user, verb="mentioned").count() == 1
    assert Notification.objects.filter(recipient=dev.user, verb="commented").count() == 1
    assert not Notification.objects.filter(recipient=owner.user).exists()
    assert {m.to[0] for m in mail.outbox} == {dev.user.email, qa.user.email}


def test_notifications_api(api, owner, project, member_of, commit):
    dev = member_of(owner.workspace)
    with commit():
        api.as_member(owner).post("/api/issues/", {"project": project.id, "title": "x", "assignee": dev.user.id})
    api.as_member(dev)
    assert api.get("/api/notifications/unread-count/").data == {"count": 1}
    note = api.get("/api/notifications/").data["results"][0]
    assert note["issue_key"] == "WEB-1"
    api.post(f"/api/notifications/{note['id']}/read/")
    assert api.get("/api/notifications/unread-count/").data == {"count": 0}


def test_completing_sprint_builds_report(api, owner, project, commit):
    done = project.statuses.get(category="done")
    api.as_member(owner)
    sprint_id = api.post("/api/sprints/", {"project": project.id, "name": "Sprint 1"}).data["id"]
    IssueFactory(project=project, sprint_id=sprint_id, status=done, story_points=5)
    IssueFactory(project=project, sprint_id=sprint_id, story_points=3)
    api.post(f"/api/sprints/{sprint_id}/start/")
    with commit():
        api.post(f"/api/sprints/{sprint_id}/complete/")

    report = Report.objects.get(sprint_id=sprint_id)
    assert report.state == "ready"
    assert report.data["committed_points"] == 8
    assert report.data["completed_points"] == 5
    assert report.data["completion_rate"] == 62.5
    csv_text = b"".join(api.get(f"/api/reports/{report.id}/download/").streaming_content).decode()
    assert csv_text.splitlines()[0] == "Key,Title,Type,Status,Done,Points,Assignee"


def test_weekly_summary_emails_admins(owner, project):
    from apps.reports.tasks import send_weekly_summaries

    IssueFactory(project=project)
    send_weekly_summaries()
    report = Report.objects.get(kind="weekly", workspace=owner.workspace)
    assert report.data["projects"][0]["created"] == 1
    assert mail.outbox[0].to == [owner.user.email]
