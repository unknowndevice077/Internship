import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import RestrictedError

from apps.projects.models import Issue, Project, Sprint
from tests.factories import IssueFactory, ProjectFactory, WorkspaceFactory

pytestmark = pytest.mark.django_db


def test_new_project_gets_default_workflow_and_board():
    project = ProjectFactory(key="web")
    assert project.key == "WEB"
    assert list(project.statuses.values_list("name", flat=True)) == ["To Do", "In Progress", "In Review", "Done"]
    assert project.boards.count() == 1


def test_issue_numbers_are_sequential_per_project():
    a, b = ProjectFactory(), ProjectFactory()
    issues_a = [IssueFactory(project=a) for _ in range(3)]
    issue_b = IssueFactory(project=b)
    assert [i.number for i in issues_a] == [1, 2, 3]
    assert issue_b.number == 1
    assert issues_a[2].key == f"{a.key}-3"


def test_new_issues_append_to_bottom_of_column():
    project = ProjectFactory()
    first, second = IssueFactory(project=project), IssueFactory(project=project)
    assert second.rank > first.rank


def test_for_workspace_never_leaks_other_tenants():
    ws1, ws2 = WorkspaceFactory(), WorkspaceFactory()
    IssueFactory.create_batch(3, project=ProjectFactory(workspace=ws1))
    IssueFactory.create_batch(2, project=ProjectFactory(workspace=ws2))
    assert Issue.objects.for_workspace(ws1).count() == 3
    assert Issue.objects.for_workspace(ws2).count() == 2
    assert not Issue.objects.for_workspace(ws1).filter(workspace=ws2).exists()


def test_issue_cannot_use_status_from_another_project():
    p1, p2 = ProjectFactory(), ProjectFactory()
    with pytest.raises(ValidationError):
        Issue.objects.create(project=p1, status=p2.statuses.first(), title="x")


def test_issue_cannot_point_at_project_in_other_workspace():
    project = ProjectFactory()
    with pytest.raises(ValidationError):
        Issue.objects.create(project=project, workspace=WorkspaceFactory(), status=project.statuses.first(), title="x")


def test_project_keys_unique_per_workspace_only():
    ws1, ws2 = WorkspaceFactory(), WorkspaceFactory()
    Project.objects.create(workspace=ws1, name="A", key="APP")
    Project.objects.create(workspace=ws2, name="A", key="APP")
    with pytest.raises(IntegrityError):
        Project.objects.create(workspace=ws1, name="B", key="APP")


def test_only_one_active_sprint_per_project():
    project = ProjectFactory()
    Sprint.objects.create(workspace=project.workspace, project=project, name="S1", state="active")
    with pytest.raises(IntegrityError):
        Sprint.objects.create(workspace=project.workspace, project=project, name="S2", state="active")


def test_deleting_a_workspace_removes_all_its_data():
    issue = IssueFactory()
    other = IssueFactory()
    issue.workspace.delete()
    assert not Issue.objects.filter(pk=issue.pk).exists()
    assert Issue.objects.filter(pk=other.pk).exists()


def test_status_with_issues_cannot_be_deleted_directly():
    issue = IssueFactory()
    with pytest.raises(RestrictedError):
        issue.status.delete()
