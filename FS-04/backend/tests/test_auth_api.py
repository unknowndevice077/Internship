import pytest

from apps.accounts.models import User
from apps.tenancy.models import Membership

pytestmark = pytest.mark.django_db


def test_register_creates_user_workspace_and_owner_membership(api):
    res = api.post(
        "/api/auth/register/",
        {
            "email": "Ana@Acme.io",
            "password": "s3cure-pass!",
            "full_name": "Ana",
            "workspace_name": "Acme Inc",
        },
    )
    assert res.status_code == 201, res.data
    assert res.data["access"] and res.data["refresh"]
    assert res.data["user"]["workspaces"] == [{"slug": "acme-inc", "name": "Acme Inc", "plan": "free", "role": "owner"}]
    assert User.objects.get().email == "ana@acme.io"


def test_register_requires_workspace_name_for_new_users(api):
    res = api.post("/api/auth/register/", {"email": "a@b.io", "password": "s3cure-pass!"})
    assert res.status_code == 400
    assert "workspace_name" in res.data


def test_invited_user_can_claim_account(api, owner):
    api.as_member(owner).post("/api/members/", {"email": "new@acme.io", "role": "member"})
    api.force_authenticate(None)
    api.credentials()
    res = api.post("/api/auth/register/", {"email": "new@acme.io", "password": "s3cure-pass!"})
    assert res.status_code == 201, res.data
    assert [w["slug"] for w in res.data["user"]["workspaces"]] == [owner.workspace.slug]


def test_login_with_email_returns_tokens(api):
    User.objects.create_user(email="dev@acme.io", password="s3cure-pass!")
    res = api.post("/api/auth/token/", {"email": "dev@acme.io", "password": "s3cure-pass!"})
    assert res.status_code == 200
    me = api.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    assert me.data["email"] == "dev@acme.io"


def test_workspace_slugs_are_unique(api):
    user = User.objects.create_user(email="dev@acme.io", password="x")
    api.force_authenticate(user)
    first = api.post("/api/workspaces/", {"name": "Acme"}).data["slug"]
    second = api.post("/api/workspaces/", {"name": "Acme"}).data["slug"]
    assert (first, second) == ("acme", "acme-2")
    assert Membership.objects.filter(user=user, role="owner").count() == 2
