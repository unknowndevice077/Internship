import csv
import io
from collections import defaultdict
from datetime import timedelta

from django.utils import timezone

from apps.projects.models import Issue, Project, Status


def sprint_report(report):
    sprint = report.sprint
    # issue ids are captured when the sprint closes, before unfinished work leaves the sprint
    ids = report.data.get("issue_ids") or list(sprint.issues.values_list("id", flat=True))
    issues = Issue.objects.filter(pk__in=ids).select_related("status", "assignee")

    people = defaultdict(lambda: {"issues": 0, "done": 0, "points": 0, "done_points": 0})
    by_type = defaultdict(int)
    rows = []
    for issue in issues:
        done = issue.status.category == Status.Category.DONE
        points = issue.story_points or 0
        person = people[issue.assignee.full_name or issue.assignee.email if issue.assignee else "Unassigned"]
        person["issues"] += 1
        person["points"] += points
        if done:
            person["done"] += 1
            person["done_points"] += points
        by_type[issue.type] += 1
        rows.append([issue.key, issue.title, issue.type, issue.status.name, "yes" if done else "no", points,
                     issue.assignee.email if issue.assignee else ""])

    committed_points = sum(p["points"] for p in people.values())
    completed_points = sum(p["done_points"] for p in people.values())
    data = {
        "sprint": {"id": sprint.id, "name": sprint.name, "goal": sprint.goal,
                   "start_date": str(sprint.start_date or ""), "end_date": str(sprint.end_date or "")},
        "committed_issues": len(rows),
        "completed_issues": sum(1 for r in rows if r[4] == "yes"),
        "committed_points": committed_points,
        "completed_points": completed_points,
        "completion_rate": round(completed_points / committed_points * 100, 1) if committed_points else None,
        "by_assignee": [{"name": k, **v} for k, v in sorted(people.items())],
        "by_type": dict(by_type),
        "issue_ids": ids,
    }
    return data, to_csv(["Key", "Title", "Type", "Status", "Done", "Points", "Assignee"], rows)


def weekly_report(report):
    since = timezone.now() - timedelta(days=7)
    projects = []
    rows = []
    for project in Project.objects.for_workspace(report.workspace).order_by("key"):
        issues = Issue.objects.filter(project=project)
        created = issues.filter(created_at__gte=since).count()
        completed = issues.filter(status__category=Status.Category.DONE, updated_at__gte=since).count()
        open_count = issues.exclude(status__category=Status.Category.DONE).count()
        projects.append({"key": project.key, "name": project.name, "created": created,
                         "completed": completed, "open": open_count})
        rows.append([project.key, project.name, created, completed, open_count])
    data = {"since": since.date().isoformat(), "until": timezone.now().date().isoformat(), "projects": projects}
    return data, to_csv(["Project", "Name", "Created", "Completed", "Open"], rows)


def to_csv(header, rows):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    return buf.getvalue()


BUILDERS = {"sprint": sprint_report, "weekly": weekly_report}
