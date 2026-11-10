from datetime import timedelta

import pytest
from django.utils import timezone

from apps.projects.models import Issue, Sprint, Status
from tests.factories import IssueFactory, MembershipFactory, ProjectFactory

pytestmark = pytest.mark.django_db


def statuses(project):
    todo = project.statuses.filter(category=Status.Category.TODO).first()
    done = project.statuses.filter(category=Status.Category.DONE).first()
    return todo, done


def test_completed_at_follows_the_status(api, owner, project):
    todo, done = statuses(project)
    issue = IssueFactory(project=project, status=todo)
    assert issue.completed_at is None

    api.as_member(owner)
    res = api.post(f"/api/issues/{issue.id}/move/", {"status": done.id})
    assert res.status_code == 200, res.data
    issue.refresh_from_db()
    assert issue.completed_at is not None

    # reopening clears it
    api.post(f"/api/issues/{issue.id}/move/", {"status": todo.id})
    issue.refresh_from_db()
    assert issue.completed_at is None


def test_completed_at_is_not_reset_by_later_edits(api, owner, project):
    _, done = statuses(project)
    issue = IssueFactory(project=project, status=done)
    stamp = timezone.now() - timedelta(days=3)
    Issue.objects.filter(pk=issue.pk).update(completed_at=stamp)

    res = api.as_member(owner).patch(f"/api/issues/{issue.id}/", {"title": "Renamed"})
    assert res.status_code == 200, res.data
    issue.refresh_from_db()
    assert issue.completed_at == stamp


def test_burndown_counts_points_left_per_day(api, owner, project):
    todo, done = statuses(project)
    today = timezone.localdate()
    sprint = Sprint.objects.create(
        workspace=owner.workspace,
        project=project,
        name="Sprint 1",
        state=Sprint.State.ACTIVE,
        start_date=today - timedelta(days=4),
        end_date=today + timedelta(days=5),
    )
    IssueFactory(project=project, sprint=sprint, status=todo, story_points=5)
    early = IssueFactory(project=project, sprint=sprint, status=done, story_points=3)
    late = IssueFactory(project=project, sprint=sprint, status=done, story_points=2)
    Issue.objects.filter(pk=early.pk).update(completed_at=timezone.now() - timedelta(days=3))
    Issue.objects.filter(pk=late.pk).update(completed_at=timezone.now())

    res = api.as_member(owner).get(f"/api/sprints/{sprint.id}/burndown/")
    assert res.status_code == 200, res.data
    days = res.data["days"]
    assert res.data["total_points"] == 10
    assert len(days) == 10
    assert days[0]["remaining"] == 10 and days[0]["ideal"] == 10
    assert days[2]["remaining"] == 7
    assert days[4]["remaining"] == 5
    # the future isn't drawn, the ideal line still ends at zero
    assert days[5]["remaining"] is None
    assert days[-1]["ideal"] == 0


def test_overview_totals_and_my_work(api, owner, project, member_of):
    todo, done = statuses(project)
    other = member_of(owner.workspace)
    mine = IssueFactory(project=project, status=todo, assignee=owner.user, title="Mine")
    IssueFactory(project=project, status=todo, assignee=other.user)
    IssueFactory(project=project, status=done, assignee=owner.user)

    res = api.as_member(owner).get("/api/overview/")
    assert res.status_code == 200, res.data
    assert res.data["totals"]["open"] == 2
    assert res.data["totals"]["mine"] == 1
    assert res.data["totals"]["done_this_week"] == 1
    assert [i["id"] for i in res.data["my_work"]] == [mine.id]
    assert len(res.data["trend"]) == 14
    assert res.data["trend"][-1] == {"date": timezone.localdate().isoformat(), "created": 3, "completed": 1}
    assert res.data["by_category"] == {"todo": 2, "done": 1}


def test_overview_never_leaks_another_workspace(api, owner, project):
    stranger = MembershipFactory(role="owner")
    theirs = ProjectFactory(workspace=stranger.workspace, key="OPS")
    IssueFactory(project=theirs, assignee=owner.user)
    Sprint.objects.create(workspace=stranger.workspace, project=theirs, name="Theirs", state=Sprint.State.ACTIVE)

    data = api.as_member(owner).get("/api/overview/").data
    assert data["totals"]["open"] == 0
    assert data["my_work"] == [] and data["sprints"] == [] and data["activity"] == []


def test_overview_needs_membership(api, owner):
    stranger = MembershipFactory()
    api.force_authenticate(stranger.user)
    api.credentials(HTTP_X_WORKSPACE=owner.workspace.slug)
    assert api.get("/api/overview/").status_code == 404
