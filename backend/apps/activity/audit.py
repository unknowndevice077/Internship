from django.db import models

from .models import AuditLog

SKIP_FIELDS = {"id", "workspace", "updated_at", "created_at", "rank", "issue_counter", "password", "last_login"}


def snapshot(instance):
    data = {}
    for field in instance._meta.concrete_fields:
        if field.name in SKIP_FIELDS:
            continue
        value = getattr(instance, field.attname)
        if isinstance(field, models.FileField):
            value = value.name if value else None
        elif hasattr(value, "isoformat"):
            value = value.isoformat()
        data[field.name] = value
    return data


def diff(before, after):
    return {k: [before.get(k), v] for k, v in after.items() if before.get(k) != v}


def issue_of(instance):
    from apps.projects.models import Issue

    if isinstance(instance, Issue):
        return instance
    return getattr(instance, "issue", None)


def record(user, action, instance, changes=None, workspace=None):
    issue = issue_of(instance)
    return AuditLog.objects.create(
        workspace=workspace or instance.workspace,
        actor=user if user and user.is_authenticated else None,
        action=action,
        entity_type=instance._meta.model_name,
        entity_id=instance.pk,
        entity_label=str(instance)[:255],
        changes=changes or {},
        issue=issue if issue and issue.pk else None,
    )
