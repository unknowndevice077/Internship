from django.contrib.auth import get_user_model

from apps.activity.models import AuditLog, Comment
from apps.activity.serializers import mentioned_emails
from apps.projects.models import Issue

from .models import Notification

User = get_user_model()


def _name(user):
    return (user.full_name or user.email) if user else "Someone"


def _members(workspace, user_ids):
    return User.objects.filter(pk__in=user_ids, memberships__workspace=workspace)


def notifications_for(entry):
    """Turn one audit entry into the notifications it should produce."""
    issue = Issue.objects.filter(pk=entry.issue_id).select_related("project").first() if entry.issue_id else None
    if issue is None:
        return []

    actor = entry.actor
    who = _name(actor)
    out = []

    def add(user_ids, verb, text):
        for user in _members(entry.workspace, set(user_ids) - {getattr(actor, "id", None), None}):
            out.append(Notification(
                workspace=entry.workspace, recipient=user, actor=actor, verb=verb, issue=issue, text=text[:300]
            ))

    label = f"{issue.key} {issue.title}"
    if entry.action == AuditLog.Action.CREATED and entry.entity_type == "issue" and issue.assignee_id:
        add([issue.assignee_id], Notification.Verb.ASSIGNED, f"{who} assigned you {label}")

    elif entry.action == AuditLog.Action.UPDATED and "assignee" in entry.changes:
        new = entry.changes["assignee"][1]
        add([new], Notification.Verb.ASSIGNED, f"{who} assigned you {label}")

    elif entry.action == AuditLog.Action.MOVED:
        to = entry.changes.get("status", [None, "?"])[1]
        add([issue.reporter_id, issue.assignee_id], Notification.Verb.STATUS_CHANGED, f"{who} moved {issue.key} to {to}")

    elif entry.action == AuditLog.Action.COMMENTED:
        comment = Comment.objects.filter(pk=entry.entity_id).first()
        mentioned = set(
            _members(entry.workspace, User.objects.filter(email__in=mentioned_emails(comment.body if comment else "")))
            .values_list("id", flat=True)
        )
        add(mentioned, Notification.Verb.MENTIONED, f"{who} mentioned you on {label}")
        watchers = {issue.reporter_id, issue.assignee_id} - mentioned
        add(watchers, Notification.Verb.COMMENTED, f"{who} commented on {label}")

    return out
