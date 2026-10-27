import re

import pytest
from django.core import mail
from django.core.signing import TimestampSigner

from apps.accounts import tokens
from apps.accounts.models import User

pytestmark = pytest.mark.django_db


def link_params(body):
    return dict(re.findall(r"[?&](\w+)=([^&\s]+)", body))


@pytest.fixture
def dev():
    return User.objects.create_user(email="dev@acme.io", password="old-pass-123!")


def test_password_reset_flow(api, dev):
    res = api.post("/api/auth/password-reset/", {"email": "DEV@acme.io"})
    assert res.status_code == 204
    assert mail.outbox[0].to == ["dev@acme.io"]
    params = link_params(mail.outbox[0].body)

    res = api.post("/api/auth/password-reset/confirm/", {**params, "password": "new-pass-456!"})
    assert res.status_code == 204, res.data
    dev.refresh_from_db()
    assert dev.check_password("new-pass-456!")
    assert dev.email_verified

    # the token is tied to the old password hash, so it can't be replayed
    res = api.post("/api/auth/password-reset/confirm/", {**params, "password": "another-pass-789!"})
    assert res.status_code == 400


def test_password_reset_does_not_reveal_unknown_emails(api):
    res = api.post("/api/auth/password-reset/", {"email": "nobody@acme.io"})
    assert res.status_code == 204
    assert mail.outbox == []


def test_password_reset_rejects_bad_token_and_weak_password(api, dev):
    uid = link_params(tokens.reset_link(dev))["uid"]
    res = api.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": "nope", "password": "new-pass-456!"})
    assert "token" in res.data

    params = link_params(tokens.reset_link(dev))
    res = api.post("/api/auth/password-reset/confirm/", {**params, "password": "123"})
    assert res.status_code == 400
    assert "password" in res.data


def test_signup_sends_verification_email(api, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        res = api.post(
            "/api/auth/register/",
            {"email": "ana@acme.io", "password": "s3cure-pass!", "workspace_name": "Acme"},
        )
    assert res.data["user"]["email_verified"] is False
    token = link_params(mail.outbox[0].body)["token"]

    assert api.post("/api/auth/verify-email/", {"token": token}).status_code == 204
    assert User.objects.get(email="ana@acme.io").email_verified


def test_verify_rejects_tampered_or_stale_tokens(api, dev):
    assert api.post("/api/auth/verify-email/", {"token": "garbage"}).status_code == 400

    token = link_params(tokens.verify_link(dev))["token"]
    dev.email = "changed@acme.io"
    dev.save()
    assert api.post("/api/auth/verify-email/", {"token": token}).status_code == 400

    # signed with another salt, e.g. a token from somewhere else in the app
    other = TimestampSigner(salt="something-else").sign_object({"id": dev.pk, "email": dev.email})
    assert api.post("/api/auth/verify-email/", {"token": other}).status_code == 400


def test_resend_verification(api, dev):
    api.force_authenticate(dev)
    assert api.post("/api/auth/verify-email/resend/").status_code == 204
    assert len(mail.outbox) == 1

    dev.email_verified_at = dev.date_joined
    dev.save()
    api.post("/api/auth/verify-email/resend/")
    assert len(mail.outbox) == 1


def test_login_is_rate_limited(api, dev):
    for _ in range(10):
        assert api.post("/api/auth/token/", {"email": dev.email, "password": "wrong"}).status_code == 401
    res = api.post("/api/auth/token/", {"email": dev.email, "password": "old-pass-123!"})
    assert res.status_code == 429
