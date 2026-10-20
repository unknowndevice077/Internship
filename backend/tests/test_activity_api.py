import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.activity.models import Attachment, AuditLog
from apps.projects.models import Transition
from tests.factories import IssueFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def statuses(project):
    return {s.name: s for s in project.statuses.all()}


def test_open_workflow_allows_any_move(api, owner, project):
    s = statuses(project)
    issue = IssueFactory(project=project, status=s["To Do"])
    res = api.as_member(owner).post(f"/api/issues/{issue.id}/move/", {"status": s["Done"].id})
    assert res.status_code == 200


def test_custom_workflow_blocks_disallowed_moves(api, owner, project):
    s = statuses(project)
    api.as_member(owner)
    api.post("/api/transitions/", {"project": project.id, "from_status": s["To Do"].id, "to_status": s["In Progress"].id})
    issue = IssueFactory(project=project, status=s["To Do"])

    res = api.post(f"/api/issues/{issue.id}/move/", {"status": s["Done"].id})
    assert res.status_code == 400
    assert "workflow" in str(res.data["status"])
    assert api.patch(f"/api/issues/{issue.id}/", {"status": s["Done"].id}).status_code == 400
    assert api.post(f"/api/issues/{issue.id}/move/", {"status": s["In Progress"].id}).status_code == 200


def test_board_exposes_transitions(api, owner, project):
    s = statuses(project)
    Transition.objects.create(workspace=project.workspace, project=project, from_status=s["To Do"], to_status=s["Done"])
    res = api.as_member(owner).get(f"/api/projects/{project.id}/board/")
    assert res.data["transitions"] == [(s["To Do"].id, s["Done"].id)]


def test_transition_statuses_must_belong_to_project(api, owner, project):
    other = IssueFactory().project
    res = api.as_member(owner).post("/api/transitions/", {
        "project": project.id, "from_status": project.statuses.first().id, "to_status": other.statuses.first().id,
    })
    assert res.status_code == 400


def test_members_cannot_edit_workflow(api, owner, project, member_of):
    s = statuses(project)
    api.as_member(member_of(owner.workspace, "member"))
    res = api.post("/api/transitions/", {"project": project.id, "from_status": s["To Do"].id, "to_status": s["Done"].id})
    assert res.status_code == 403


def test_comment_flow_and_ownership(api, owner, project, member_of):
    issue = IssueFactory(project=project)
    alice, bob = member_of(owner.workspace), member_of(owner.workspace)

    comment = api.as_member(alice).post("/api/comments/", {"issue": issue.id, "body": "Looks good"}).data
    assert comment["author"]["id"] == alice.user.id
    assert api.get(f"/api/comments/?issue={issue.id}").data[0]["body"] == "Looks good"

    api.as_member(bob)
    assert api.patch(f"/api/comments/{comment['id']}/", {"body": "edited"}).status_code == 403
    assert api.delete(f"/api/comments/{comment['id']}/").status_code == 403
    api.as_member(owner)
    assert api.delete(f"/api/comments/{comment['id']}/").status_code == 204


def test_viewer_cannot_comment(api, owner, project, member_of):
    issue = IssueFactory(project=project)
    res = api.as_member(member_of(owner.workspace, "viewer")).post("/api/comments/", {"issue": issue.id, "body": "hi"})
    assert res.status_code == 403


def test_attachment_upload_download_and_isolation(api, owner, project, member_of):
    issue = IssueFactory(project=project)
    api.as_member(owner)
    upload = SimpleUploadedFile("spec.txt", b"hello world", content_type="text/plain")
    res = api.post("/api/attachments/", {"issue": issue.id, "file": upload}, format="multipart")
    assert res.status_code == 201, res.data
    assert res.data["name"] == "spec.txt" and res.data["size"] == 11

    download = api.get(res.data["download_url"])
    assert b"".join(download.streaming_content) == b"hello world"

    outsider = member_of(IssueFactory().workspace)
    api.as_member(outsider)
    assert api.get(res.data["download_url"]).status_code == 404


def test_attachment_size_limit(api, owner, project, settings):
    settings.MAX_ATTACHMENT_MB = 0
    issue = IssueFactory(project=project)
    upload = SimpleUploadedFile("big.bin", b"x" * 10)
    res = api.as_member(owner).post("/api/attachments/", {"issue": issue.id, "file": upload}, format="multipart")
    assert res.status_code == 400
    assert not Attachment.objects.exists()


def test_audit_log_records_changes(api, owner, project):
    api.as_member(owner)
    issue_id = api.post("/api/issues/", {"project": project.id, "title": "Old title"}).data["id"]
    api.patch(f"/api/issues/{issue_id}/", {"title": "New title", "priority": "high"})
    done = project.statuses.get(name="Done")
    api.post(f"/api/issues/{issue_id}/move/", {"status": done.id})
    api.post("/api/comments/", {"issue": issue_id, "body": "Shipped"})

    entries = AuditLog.objects.filter(issue_id=issue_id).order_by("id")
    assert [e.action for e in entries] == ["created", "updated", "moved", "commented"]
    assert entries[1].changes == {"title": ["Old title", "New title"], "priority": ["medium", "high"]}
    assert entries[2].changes == {"status": ["To Do", "Done"]}
    assert all(e.actor_id == owner.user.id for e in entries)


def test_issue_history_visible_to_members_full_log_admin_only(api, owner, project, member_of):
    issue = IssueFactory(project=project)
    api.as_member(owner).post("/api/comments/", {"issue": issue.id, "body": "x"})
    api.as_member(member_of(owner.workspace, "member"))
    assert api.get(f"/api/audit-log/?issue={issue.id}").status_code == 200
    assert api.get("/api/audit-log/").status_code == 403


def test_audit_log_is_tenant_scoped(api, owner, project):
    IssueFactory(project=project)
    other = IssueFactory()
    AuditLog.objects.create(workspace=other.workspace, action="created", entity_type="issue", entity_id=other.id)
    res = api.as_member(owner).get("/api/audit-log/")
    assert all(e["entity_id"] != other.id for e in res.data["results"])
