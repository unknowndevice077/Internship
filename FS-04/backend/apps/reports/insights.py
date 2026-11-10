from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.activity.models import AuditLog
from apps.projects.models import Issue, Sprint, Status

DONE = Status.Category.DONE
TREND_DAYS = 14


def burndown(sprint):
    """Points left at the end of each day of the sprint, next to the ideal straight line."""
    today = timezone.localdate()
    start = sprint.start_date or today
    end = max(sprint.end_date or start + timedelta(days=13), start)
    issues = list(sprint.issues.values_list("story_points", "completed_at", "status__category"))
    total = sum(points or 0 for points, _, _ in issues)
    length = (end - start).days

    days = []
    for offset in range(length + 1):
        day = start + timedelta(days=offset)
        burned = sum(
            points or 0
            for points, completed_at, category in issues
            if category == DONE and completed_at and timezone.localtime(completed_at).date() <= day
        )
        days.append(
            {
                "date": day.isoformat(),
                "ideal": round(total - total * offset / length, 1) if length else 0,
                # nothing to plot for days that haven't happened yet
                "remaining": total - burned if day <= today else None,
            }
        )
    return {
        "sprint": {"id": sprint.id, "name": sprint.name, "state": sprint.state},
        "total_points": total,
        "total_issues": len(issues),
        "days": days,
    }


def overview(workspace, user):
    issues = Issue.objects.filter(workspace=workspace)
    now = timezone.now()
    week_ago = now - timedelta(days=7)

    totals = issues.aggregate(
        open=Count("id", filter=~Q(status__category=DONE)),
        in_progress=Count("id", filter=Q(status__category=Status.Category.IN_PROGRESS)),
        done_this_week=Count("id", filter=Q(completed_at__gte=week_ago)),
        created_this_week=Count("id", filter=Q(created_at__gte=week_ago)),
        mine=Count("id", filter=Q(assignee=user) & ~Q(status__category=DONE)),
    )

    first_day = timezone.localdate() - timedelta(days=TREND_DAYS - 1)
    created = _per_day(issues.filter(created_at__date__gte=first_day), "created_at")
    completed = _per_day(issues.filter(completed_at__date__gte=first_day), "completed_at")
    trend = []
    for offset in range(TREND_DAYS):
        day = first_day + timedelta(days=offset)
        trend.append({"date": day.isoformat(), "created": created.get(day, 0), "completed": completed.get(day, 0)})

    sprints = (
        Sprint.objects.filter(workspace=workspace, state=Sprint.State.ACTIVE)
        .select_related("project")
        .annotate(
            issues_total=Count("issues"),
            issues_done=Count("issues", filter=Q(issues__status__category=DONE)),
            points_total=Coalesce(Sum("issues__story_points"), 0),
            points_done=Coalesce(Sum("issues__story_points", filter=Q(issues__status__category=DONE)), 0),
        )
        .order_by("end_date", "id")[:6]
    )

    my_work = (
        issues.filter(assignee=user)
        .exclude(status__category=DONE)
        .select_related("project", "status")
        .order_by("-updated_at")[:6]
    )

    activity = (
        AuditLog.objects.filter(workspace=workspace, issue__isnull=False)
        .select_related("actor", "issue__project")
        .order_by("-created_at")[:8]
    )

    return {
        "totals": totals,
        "by_category": {
            row["status__category"]: row["n"] for row in issues.values("status__category").annotate(n=Count("id"))
        },
        "by_priority": {
            row["priority"]: row["n"]
            for row in issues.exclude(status__category=DONE).values("priority").annotate(n=Count("id"))
        },
        "trend": trend,
        "sprints": [
            {
                "id": s.id,
                "name": s.name,
                "project": s.project_id,
                "project_key": s.project.key,
                "project_name": s.project.name,
                "end_date": s.end_date.isoformat() if s.end_date else None,
                "days_left": (s.end_date - timezone.localdate()).days if s.end_date else None,
                "issues_total": s.issues_total,
                "issues_done": s.issues_done,
                "points_total": s.points_total,
                "points_done": s.points_done,
            }
            for s in sprints
        ],
        "my_work": [
            {
                "id": i.id,
                "key": i.key,
                "title": i.title,
                "project": i.project_id,
                "status": i.status.name,
                "category": i.status.category,
                "priority": i.priority,
                "type": i.type,
            }
            for i in my_work
        ],
        "activity": [
            {
                "id": a.id,
                "actor": (a.actor.full_name or a.actor.email) if a.actor else "Someone",
                "action": a.action,
                "entity": a.entity_type,
                "issue": a.issue_id,
                "issue_key": a.issue.key,
                "issue_title": a.issue.title,
                "project": a.issue.project_id,
                "changes": a.changes,
                "created_at": a.created_at.isoformat(),
            }
            for a in activity
        ],
    }


def _per_day(queryset, field):
    rows = queryset.annotate(day=TruncDate(field)).values("day").annotate(n=Count("id"))
    return {row["day"]: row["n"] for row in rows}
