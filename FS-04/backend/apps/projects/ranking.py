from django.db import transaction

from .models import Issue

STEP = 1024.0
MIN_GAP = 1e-6


def rebalance(project, status):
    issues = list(Issue.objects.filter(project=project, status=status).order_by("rank", "id"))
    for i, issue in enumerate(issues, start=1):
        issue.rank = i * STEP
    Issue.objects.bulk_update(issues, ["rank"])


def rank_between(before, after):
    if before and after:
        return (before.rank + after.rank) / 2
    if before:
        return before.rank + STEP
    if after:
        return after.rank / 2
    return STEP


@transaction.atomic
def move_issue(issue, status, before=None, after=None):
    # before = card above the drop position, after = card below
    if before is None and after is None:
        column = Issue.objects.filter(project=issue.project, status=status).exclude(pk=issue.pk)
        before = column.order_by("-rank").first()

    if before and after and after.rank - before.rank < MIN_GAP:
        # gap too small for another midpoint, respace the column
        rebalance(issue.project, status)
        before.refresh_from_db(fields=["rank"])
        after.refresh_from_db(fields=["rank"])

    issue.status = status
    issue.rank = rank_between(before, after)
    issue.save(update_fields=["status", "rank", "updated_at"])
    return issue
