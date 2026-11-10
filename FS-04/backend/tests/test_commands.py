import pytest
from django.core.management import call_command

from apps.activity.models import Comment
from apps.projects.models import Issue, Project
from apps.tenancy.models import Membership, Workspace

pytestmark = pytest.mark.django_db


def test_seed_creates_demo_workspaces():
    call_command("seed", issues=8, users=3, verbosity=0)
    assert set(Workspace.objects.values_list("plan", flat=True)) == {"free", "pro", "business"}
    web = Project.objects.get(workspace__slug="acme-corp", key="WEB")
    assert web.issues.count() == 8
    assert list(web.issues.order_by("number").values_list("number", flat=True)) == list(range(1, 9))
    assert web.issue_counter == 8
    assert Comment.objects.exists()
    assert Membership.objects.filter(workspace__slug="acme-corp", role="owner").count() == 1


def test_seed_numbering_continues_after_seed():
    call_command("seed", issues=5, users=2, verbosity=0)
    web = Project.objects.get(workspace__slug="acme-corp", key="WEB")
    issue = Issue.objects.create(project=web, status=web.statuses.first(), title="New")
    assert issue.number == 6


def test_seed_reset_rebuilds(capsys):
    call_command("seed", issues=3, users=2, verbosity=0)
    call_command("seed", issues=4, users=2, reset=True)
    assert Project.objects.get(workspace__slug="acme-corp", key="WEB").issues.count() == 4


def test_bench_runs_against_seed(capsys):
    call_command("seed", issues=5, users=2, verbosity=0)
    call_command("bench", runs=2)
    out = capsys.readouterr().out
    assert "| GET board (all issues) |" in out
    assert "| POST move issue |" in out
