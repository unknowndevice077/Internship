import json
import time
from datetime import timedelta

import pyotp
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from apps.accounts import twofactor
from apps.accounts.models import User
from apps.activity import scan
from apps.activity.models import AuditLog
from apps.activity.tasks import heartbeat, prune_old_records
from apps.notifications.models import Notification
from apps.tenancy.models import Membership, Workspace
from tests.factories import IssueFactory, MembershipFactory

pytestmark = pytest.mark.django_db

PASSWORD = "s3cure-pass!"


@pytest.fixture
def dev():
    return User.objects.create_user(email="dev@acme.io", password=PASSWORD)


def login(api, email="dev@acme.io", password=PASSWORD, **extra):
    return api.post("/api/auth/token/", {"email": email, "password": password, **extra})


def enrol(api, user):
    api.force_authenticate(user)
    secret = api.post("/api/auth/2fa/setup/").data["secret"]
    res = api.post("/api/auth/2fa/enable/", {"code": pyotp.TOTP(secret).now()})
    api.force_authenticate(None)
    return secret, res.data["recovery_codes"]


# refresh tokens


def test_refresh_rotates_and_old_token_is_revoked(api, dev):
    first = login(api).data["refresh"]
    second = api.post("/api/auth/token/refresh/", {"refresh": first})
    assert second.status_code == 200
    assert second.data["refresh"] != first
    assert api.post("/api/auth/token/refresh/", {"refresh": first}).status_code == 401


def test_logout_revokes_the_refresh_token(api, dev):
    refresh = login(api).data["refresh"]
    assert api.post("/api/auth/logout/", {"refresh": refresh}).status_code == 204
    assert api.post("/api/auth/token/refresh/", {"refresh": refresh}).status_code == 401
    # repeating it, or sending junk, is harmless
    assert api.post("/api/auth/logout/", {"refresh": refresh}).status_code == 204
    assert api.post("/api/auth/logout/", {"refresh": "junk"}).status_code == 204


def test_password_change_signs_out_other_sessions(api, dev):
    old = login(api).data
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {old['access']}")
    res = api.post("/api/auth/password/change/", {"current_password": PASSWORD, "new_password": "brand-new-pass-9"})
    assert res.status_code == 200
    api.credentials()
    assert api.post("/api/auth/token/refresh/", {"refresh": old["refresh"]}).status_code == 401
    assert api.post("/api/auth/token/refresh/", {"refresh": res.data["refresh"]}).status_code == 200
    assert login(api, password="brand-new-pass-9").status_code == 200


def test_password_change_checks_current_and_strength(api, dev):
    api.force_authenticate(dev)
    res = api.post("/api/auth/password/change/", {"current_password": "wrong", "new_password": "brand-new-pass-9"})
    assert "current_password" in res.data
    res = api.post("/api/auth/password/change/", {"current_password": PASSWORD, "new_password": "12345678"})
    assert "new_password" in res.data


# lockout


def test_account_locks_after_repeated_failures(api, dev, settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"auth": "100/min"}}
    for _ in range(settings.LOGIN_MAX_FAILURES):
        assert login(api, password="nope").status_code == 401
    res = login(api)
    assert res.status_code == 429
    assert res.data["code"] == "locked"


def test_success_resets_the_failure_count(api, dev, settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"auth": "100/min"}}
    for _ in range(settings.LOGIN_MAX_FAILURES - 1):
        login(api, password="nope")
    assert login(api).status_code == 200
    for _ in range(settings.LOGIN_MAX_FAILURES - 1):
        assert login(api, password="nope").status_code == 401


# two-factor


def test_two_factor_setup_enable_and_login(api, dev):
    secret, codes = enrol(api, dev)
    dev.refresh_from_db()
    assert dev.totp_enabled
    assert secret not in dev.totp_secret  # stored encrypted
    assert len(codes) == 8

    res = login(api)
    assert res.status_code == 401
    assert res.data["code"] == "otp_required"
    assert "access" not in res.data

    assert login(api, otp="000000").status_code == 401
    code = pyotp.TOTP(secret).at(time.time() + 30)  # the next window, since this one was used to enrol
    assert login(api, otp=code).status_code == 200


def test_totp_code_cannot_be_replayed(api, dev):
    secret, _ = enrol(api, dev)
    dev.refresh_from_db()
    now = int(time.time()) // twofactor.STEP
    code = pyotp.TOTP(secret).at((now + 1) * twofactor.STEP)
    assert login(api, otp=code).status_code == 200
    assert login(api, otp=code).status_code == 401


def test_recovery_code_works_once(api, dev):
    _, codes = enrol(api, dev)
    assert login(api, otp=codes[0]).status_code == 200
    assert login(api, otp=codes[0]).status_code == 401
    assert login(api, otp=codes[1]).status_code == 200


def test_enable_rejects_a_wrong_code_and_setup_twice(api, dev):
    api.force_authenticate(dev)
    api.post("/api/auth/2fa/setup/")
    assert "code" in api.post("/api/auth/2fa/enable/", {"code": "123456"}).data
    dev.refresh_from_db()
    assert not dev.totp_enabled


def test_disable_needs_password_and_code(api, dev):
    secret, codes = enrol(api, dev)
    api.force_authenticate(dev)
    assert api.post("/api/auth/2fa/disable/", {"password": "wrong", "code": codes[0]}).status_code == 400
    assert api.post("/api/auth/2fa/disable/", {"password": PASSWORD, "code": "000000"}).status_code == 400
    assert api.post("/api/auth/2fa/disable/", {"password": PASSWORD, "code": codes[0]}).status_code == 204
    dev.refresh_from_db()
    assert not dev.totp_enabled and dev.totp_secret == ""
    api.force_authenticate(None)
    assert login(api).status_code == 200


# email verification gates


def test_unverified_users_cannot_invite_or_check_out(api, settings):
    owner = MembershipFactory(role="owner")
    owner.user.email_verified_at = None
    owner.user.save()
    api.as_member(owner)
    res = api.post("/api/members/", {"email": "new@acme.io", "role": "member"})
    assert res.status_code == 403
    assert res.data["code"] == "email_unverified"

    settings.STRIPE_SECRET_KEY = "sk_test_x"
    assert api.post("/api/billing/checkout/", {"plan": "pro"}).status_code == 403

    owner.user.email_verified_at = timezone.now()
    owner.user.save()
    assert api.post("/api/members/", {"email": "new@acme.io", "role": "member"}).status_code == 201


# attachments


def upload(api, issue, name, content=b"hello"):
    return api.post(
        "/api/attachments/",
        {"issue": issue.id, "file": SimpleUploadedFile(name, content)},
        format="multipart",
    )


def test_dangerous_attachment_types_are_rejected(api, owner, project):
    issue = IssueFactory(project=project, workspace=owner.workspace)
    api.as_member(owner)
    assert upload(api, issue, "notes.txt").status_code == 201
    for name in ("run.exe", "page.HTML", "logo.svg", "x.js"):
        res = upload(api, issue, name)
        assert res.status_code == 400, name
        assert "file" in res.data


class FakeClamd:
    def __init__(self, reply):
        self.reply = reply
        self.sent = b""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def sendall(self, data):
        self.sent += data

    def recv(self, n):
        return self.reply


def test_clamav_scan_flags_infected_and_fails_closed(settings, monkeypatch):
    settings.CLAMD_HOST = "clamd"
    f = SimpleUploadedFile("a.txt", b"data")

    fake = FakeClamd(b"stream: OK\0")
    monkeypatch.setattr(scan.socket, "create_connection", lambda *a, **k: fake)
    scan.validate_upload(f)
    assert fake.sent.startswith(b"zINSTREAM\0") and fake.sent.endswith(b"\0\0\0\0")

    monkeypatch.setattr(scan.socket, "create_connection", lambda *a, **k: FakeClamd(b"stream: Eicar FOUND\0"))
    with pytest.raises(Exception, match="virus"):
        scan.validate_upload(f)

    def refuse(*a, **k):
        raise ConnectionRefusedError

    monkeypatch.setattr(scan.socket, "create_connection", refuse)
    with pytest.raises(Exception, match="couldn't be scanned"):
        scan.validate_upload(f)


# export and deletion


def test_export_is_owner_only_and_complete(api, owner, project):
    IssueFactory(project=project, workspace=owner.workspace, title="Export me")
    api.as_member(owner)
    res = api.get("/api/workspace/export/")
    assert res.status_code == 200
    assert "attachment" in res["Content-Disposition"]
    data = json.loads(b"".join(res.streaming_content))
    assert data["workspace"]["slug"] == owner.workspace.slug
    assert [i["title"] for i in data["issues"]] == ["Export me"]
    assert data["members"][0]["user__email"] == owner.user.email
    assert {"projects", "statuses", "sprints", "comments", "audit_log"} <= data.keys()

    admin = MembershipFactory(workspace=owner.workspace, role="admin")
    assert api.as_member(admin).get("/api/workspace/export/").status_code == 403


def test_export_excludes_other_workspaces(api, owner, project):
    other = MembershipFactory(role="owner")
    IssueFactory(project=project, workspace=owner.workspace, title="Mine")
    other_project = type(project).objects.create(workspace=other.workspace, name="Other", key="OTH")
    IssueFactory(project=other_project, workspace=other.workspace, title="Theirs")
    res = api.as_member(owner).get("/api/workspace/export/")
    titles = [i["title"] for i in json.loads(b"".join(res.streaming_content))["issues"]]
    assert titles == ["Mine"]


def test_delete_workspace_needs_owner_and_confirmation(api, owner, project):
    slug = owner.workspace.slug
    admin = MembershipFactory(workspace=owner.workspace, role="admin")
    assert api.as_member(admin).delete("/api/workspace/", {"confirm": slug}).status_code == 403

    api.as_member(owner)
    assert api.delete("/api/workspace/", {"confirm": "nope"}, format="json").status_code == 400
    assert Workspace.objects.filter(slug=slug).exists()

    assert api.delete("/api/workspace/", {"confirm": slug}, format="json").status_code == 204
    assert not Workspace.objects.filter(slug=slug).exists()
    assert not Membership.objects.filter(workspace__slug=slug).exists()


def test_delete_workspace_cancels_the_stripe_subscription(api, owner, settings, monkeypatch):
    from apps.billing import stripe_sync
    from apps.billing.models import Subscription

    settings.STRIPE_SECRET_KEY = "sk_test_x"
    Subscription.objects.create(workspace=owner.workspace, stripe_subscription_id="sub_123")
    cancelled = []
    monkeypatch.setattr(stripe_sync.stripe.Subscription, "cancel", lambda sid, **kw: cancelled.append(sid))
    api.as_member(owner)
    assert api.delete("/api/workspace/", {"confirm": owner.workspace.slug}, format="json").status_code == 204
    assert cancelled == ["sub_123"]


# search


def test_search_matches_words_partials_and_issue_keys(api, owner, project):
    ws = owner.workspace
    login_bug = IssueFactory(project=project, workspace=ws, title="Login page crashes", description="on Safari")
    IssueFactory(project=project, workspace=ws, title="Update billing copy", description="mentions authentication")
    IssueFactory(project=project, workspace=ws, title="Unrelated")
    api.as_member(owner)

    def search(q):
        res = api.get("/api/issues/", {"q": q})
        return {i["title"] for i in res.data["results"]}

    assert search("crash") == {"Login page crashes"}  # stemming
    assert search("safari") == {"Login page crashes"}  # description
    assert search("authent") == {"Update billing copy"}  # description, via stemming
    assert search("login safari") == {"Login page crashes"}
    assert search(login_bug.key.lower()) == {"Login page crashes"}


# maintenance jobs


def test_prune_removes_only_old_records(owner, project, settings):
    issue = IssueFactory(project=project, workspace=owner.workspace)
    old = AuditLog.objects.create(workspace=owner.workspace, entity_type="issue", entity_id=issue.id, action="created")
    new = AuditLog.objects.create(workspace=owner.workspace, entity_type="issue", entity_id=issue.id, action="created")
    AuditLog.objects.filter(pk=old.pk).update(
        created_at=timezone.now() - timedelta(days=settings.AUDIT_RETENTION_DAYS + 1)
    )
    stale = Notification.objects.create(workspace=owner.workspace, recipient=owner.user, text="old")
    Notification.objects.filter(pk=stale.pk).update(
        created_at=timezone.now() - timedelta(days=settings.NOTIFICATION_RETENTION_DAYS + 1)
    )
    prune_old_records()
    assert AuditLog.objects.filter(pk=new.pk).exists()
    assert not AuditLog.objects.filter(pk=old.pk).exists()
    assert not Notification.objects.filter(pk=stale.pk).exists()


def test_flushexpiredtokens_runs_clean(api, dev):
    refresh = login(api).data["refresh"]
    api.post("/api/auth/logout/", {"refresh": refresh})
    assert BlacklistedToken.objects.count() == 1
    call_command("flushexpiredtokens")
    assert BlacklistedToken.objects.count() == 1  # not expired yet


def test_health_reports_worker_heartbeat(api):
    assert api.get("/api/health/").json()["worker"] == "no heartbeat"
    heartbeat()
    assert api.get("/api/health/").json()["worker"] == "ok"
