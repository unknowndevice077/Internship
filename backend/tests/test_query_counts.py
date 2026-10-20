import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.activity.models import AuditLog, Comment
from tests.factories import IssueFactory, MembershipFactory, ProjectFactory

pytestmark = pytest.mark.django_db


def count_queries(api, url):
    with CaptureQueriesContext(connection) as ctx:
        res = api.get(url)
    assert res.status_code == 200, res.data
    return len(ctx.captured_queries)


def grow(project, members, n):
    ws = project.workspace
    for i in range(n):
        user = members[i % len(members)].user
        issue = IssueFactory(project=project, assignee=user, reporter=members[0].user)
        first = project.issues.order_by("id").first()
        Comment.objects.create(workspace=ws, issue=first, author=user, body="x")
        AuditLog.objects.create(workspace=ws, actor=user, action="created", entity_type="issue", entity_id=issue.id)


# each endpoint should cost the same number of queries no matter how much data there is (no N+1)
@pytest.mark.parametrize(
    "url",
    [
        "/api/issues/",
        "/api/projects/{project}/board/",
        "/api/projects/",
        "/api/members/",
        "/api/comments/?issue={issue}",
        "/api/audit-log/",
        "/api/workspaces/",
    ],
)
def test_query_count_is_constant(api, owner, url):
    project = ProjectFactory(workspace=owner.workspace)
    members = [owner] + [MembershipFactory(workspace=owner.workspace) for _ in range(3)]
    api.as_member(owner)

    grow(project, members, 3)
    first_issue = project.issues.first()
    small = count_queries(api, url.format(project=project.id, issue=first_issue.id))

    grow(project, members, 30)
    ProjectFactory.create_batch(2, workspace=owner.workspace)
    MembershipFactory(user=owner.user)
    large = count_queries(api, url.format(project=project.id, issue=first_issue.id))

    assert large == small, f"{url}: {small} queries with little data, {large} with more"
