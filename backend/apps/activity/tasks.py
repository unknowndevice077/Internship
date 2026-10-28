from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.services import notifications_for
from apps.notifications.tasks import email_notifications
from apps.webhooks.tasks import fan_out_event

from .models import AuditLog


def webhook_payload(entry):
    payload = {
        "event": f"{entry.entity_type}.{entry.action}",
        "workspace": entry.workspace.slug,
        "occurred_at": entry.created_at.isoformat(),
        "actor": {"id": entry.actor_id, "email": entry.actor.email} if entry.actor else None,
        "entity": {"type": entry.entity_type, "id": entry.entity_id, "label": entry.entity_label},
        "changes": entry.changes,
    }
    if entry.issue_id and entry.issue:
        issue = entry.issue
        payload["issue"] = {
            "id": issue.id,
            "key": issue.key,
            "title": issue.title,
            "status": issue.status.name,
            "assignee": issue.assignee.email if issue.assignee else None,
        }
    return payload


# single entry point for notifications and webhooks
@shared_task
def handle_audit_entry(entry_id):
    entry = (
        AuditLog.objects.select_related("workspace", "actor", "issue__project", "issue__status", "issue__assignee")
        .filter(pk=entry_id)
        .first()
    )
    if entry is None:
        return

    notes = Notification.objects.bulk_create(notifications_for(entry))
    if notes:
        email_notifications.delay([n.id for n in notes])

    payload = webhook_payload(entry)
    fan_out_event.delay(entry.workspace_id, payload["event"], payload)


@shared_task
def prune_old_records():
    now = timezone.now()
    AuditLog.objects.filter(created_at__lt=now - timedelta(days=settings.AUDIT_RETENTION_DAYS)).delete()
    Notification.objects.filter(created_at__lt=now - timedelta(days=settings.NOTIFICATION_RETENTION_DAYS)).delete()
    # drops expired refresh tokens from the blacklist tables
    call_command("flushexpiredtokens")


@shared_task
def heartbeat():
    # lets the health check tell whether a worker is alive without pinging it
    cache.set("worker:heartbeat", timezone.now().timestamp(), 300)
