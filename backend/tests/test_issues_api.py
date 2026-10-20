import pytest

from apps.projects.models import Issue, Sprint
from tests.factories import IssueFactory

pytestmark = pytest.mark.django_db


def test_create_issue_defaults_to_first_status_and_sets_reporter(api, owner, project):
    res = api.as_member(owner).post(
        "/api/issues/", {"project": project.id, "title": "Login button broken", "type": "bug"}
    )
    assert res.status_code == 201, res.data
    assert res.data["key"] == "WEB-1"
    assert res.data["status"] == project.statuses.first().id
    assert res.data["reporter"]["id"] == owner.user.id


def test_issue_filters(api, owner, project):
    todo, doing = project.statuses.all()[:2]
    IssueFactory(project=project, status=todo, title="Write docs")
    IssueFactory(project=project, status=doing, title="Fix login")
    api.as_member(owner)
    assert api.get(f"/api/issues/?status={doing.id}").data["count"] == 1
    assert api.get("/api/issues/?q=login").data["results"][0]["title"] == "Fix login"
    assert api.get("/api/issues/?backlog=true").data["count"] == 2


def test_move_issue_between_neighbours(api, owner, project):
    todo, doing = project.statuses.all()[:2]
    a, b = IssueFactory(project=project, status=doing), IssueFactory(project=project, status=doing)
    moving = IssueFactory(project=project, status=todo)
    res = api.as_member(owner).post(
        f"/api/issues/{moving.id}/move/", {"status": doing.id, "before": a.id, "after": b.id}
    )
    assert res.status_code == 200, res.data
    order = list(Issue.objects.filter(status=doing).values_list("id", flat=True))
    assert order == [a.id, moving.id, b.id]


def test_move_to_top_of_column(api, owner, project):
    doing = project.statuses.all()[1]
    first = IssueFactory(project=project, status=doing)
    moving = IssueFactory(project=project)
    api.as_member(owner).post(f"/api/issues/{moving.id}/move/", {"status": doing.id, "after": first.id})
    assert list(Issue.objects.filter(status=doing).values_list("id", flat=True)) == [moving.id, first.id]


def test_repeated_moves_into_same_gap_trigger_rebalance(api, owner, project):
    doing = project.statuses.all()[1]
    a, b = IssueFactory(project=project, status=doing), IssueFactory(project=project, status=doing)
    api.as_member(owner)
    after = b
    for _ in range(60):
        moving = IssueFactory(project=project)
        api.post(f"/api/issues/{moving.id}/move/", {"status": doing.id, "before": a.id, "after": after.id})
        after = moving
    ranks = list(Issue.objects.filter(status=doing).values_list("rank", flat=True))
    assert ranks == sorted(ranks)
    assert len(set(ranks)) == len(ranks)


def test_board_groups_issues_by_column(api, owner, project):
    todo, doing = project.statuses.all()[:2]
    IssueFactory.create_batch(2, project=project, status=todo)
    IssueFactory(project=project, status=doing)
    res = api.as_member(owner).get(f"/api/projects/{project.id}/board/")
    assert [len(c["issues"]) for c in res.data["columns"]] == [2, 1, 0, 0]


def test_sprint_lifecycle_moves_unfinished_work_to_backlog(api, owner, project):
    done = project.statuses.get(category="done")
    api.as_member(owner)
    sprint_id = api.post("/api/sprints/", {"project": project.id, "name": "Sprint 1"}).data["id"]
    finished = IssueFactory(project=project, status=done, sprint_id=sprint_id)
    unfinished = IssueFactory(project=project, sprint_id=sprint_id)

    assert api.post(f"/api/sprints/{sprint_id}/start/").data["state"] == "active"
    other = api.post("/api/sprints/", {"project": project.id, "name": "Sprint 2"}).data["id"]
    assert api.post(f"/api/sprints/{other}/start/").status_code == 400

    assert api.post(f"/api/sprints/{sprint_id}/complete/").data["state"] == "closed"
    finished.refresh_from_db()
    unfinished.refresh_from_db()
    assert finished.sprint_id == sprint_id
    assert unfinished.sprint_id is None


def test_cannot_add_issue_to_closed_sprint(api, owner, project):
    sprint = Sprint.objects.create(workspace=project.workspace, project=project, name="Old", state="closed")
    res = api.as_member(owner).post("/api/issues/", {"project": project.id, "title": "x", "sprint": sprint.id})
    assert res.status_code == 400


def test_project_key_validation(api, owner, project):
    api.as_member(owner)
    assert api.post("/api/projects/", {"name": "Dup", "key": "web"}).status_code == 400
    assert api.post("/api/projects/", {"name": "Bad", "key": "1AB"}).status_code == 400
