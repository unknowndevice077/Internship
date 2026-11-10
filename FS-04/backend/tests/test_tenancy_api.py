import pytest

from tests.factories import IssueFactory, MembershipFactory, ProjectFactory

pytestmark = pytest.mark.django_db


def test_missing_workspace_header_is_rejected(api, owner):
    api.force_authenticate(owner.user)
    assert api.get("/api/projects/").status_code == 400


def test_cannot_use_workspace_you_are_not_a_member_of(api, owner):
    outsider = MembershipFactory()
    api.force_authenticate(outsider.user)
    res = api.get("/api/projects/", HTTP_X_WORKSPACE=owner.workspace.slug)
    assert res.status_code == 404


def test_list_only_shows_current_workspace_data(api, owner, project):
    IssueFactory.create_batch(2, project=project)
    IssueFactory.create_batch(5, project=ProjectFactory())
    res = api.as_member(owner).get("/api/issues/")
    assert res.data["count"] == 2


def test_other_tenants_issue_is_not_found(api, owner):
    foreign = IssueFactory()
    api.as_member(owner)
    assert api.get(f"/api/issues/{foreign.id}/").status_code == 404
    assert api.patch(f"/api/issues/{foreign.id}/", {"title": "pwned"}).status_code == 404
    foreign.refresh_from_db()
    assert foreign.title != "pwned"


def test_cannot_create_issue_in_other_tenants_project(api, owner):
    foreign_project = ProjectFactory()
    res = api.as_member(owner).post("/api/issues/", {"project": foreign_project.id, "title": "x"})
    assert res.status_code == 400
    assert "project" in res.data


def test_cannot_assign_issue_to_non_member(api, owner, project):
    stranger = MembershipFactory().user
    res = api.as_member(owner).post("/api/issues/", {"project": project.id, "title": "x", "assignee": stranger.id})
    assert res.status_code == 400
    assert "assignee" in res.data


@pytest.mark.parametrize(
    "role,method,url,expected",
    [
        ("viewer", "get", "/api/projects/", 200),
        ("viewer", "post", "/api/issues/", 403),
        ("member", "post", "/api/issues/", 201),
        ("member", "post", "/api/projects/", 403),
        ("admin", "post", "/api/projects/", 201),
        ("member", "post", "/api/members/", 403),
        ("admin", "post", "/api/members/", 201),
    ],
)
def test_role_permissions(api, owner, project, member_of, role, method, url, expected):
    payloads = {
        "/api/issues/": {"project": project.id, "title": "Fix login"},
        "/api/projects/": {"name": "Mobile", "key": "MOB"},
        "/api/members/": {"email": "someone@acme.io"},
    }
    api.as_member(member_of(owner.workspace, role))
    res = getattr(api, method)(url, payloads.get(url))
    assert res.status_code == expected, res.data


def test_only_admin_can_delete_issues(api, owner, project, member_of):
    issue = IssueFactory(project=project)
    api.as_member(member_of(owner.workspace, "member"))
    assert api.delete(f"/api/issues/{issue.id}/").status_code == 403
    api.as_member(member_of(owner.workspace, "admin"))
    assert api.delete(f"/api/issues/{issue.id}/").status_code == 204


def test_admin_cannot_promote_to_owner(api, owner, member_of):
    admin = member_of(owner.workspace, "admin")
    target = member_of(owner.workspace, "member")
    res = api.as_member(admin).patch(f"/api/members/{target.id}/", {"role": "owner"})
    assert res.status_code == 403


def test_last_owner_cannot_be_removed_or_demoted(api, owner):
    api.as_member(owner)
    assert api.patch(f"/api/members/{owner.id}/", {"role": "admin"}).status_code == 400
    assert api.delete(f"/api/members/{owner.id}/").status_code == 400
