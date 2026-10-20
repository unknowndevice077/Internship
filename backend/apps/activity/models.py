import os

from django.conf import settings
from django.db import models

from apps.tenancy.managers import TenantModel


class Comment(TenantModel):
    issue = models.ForeignKey("projects.Issue", on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"Comment on {self.issue_id}"


def attachment_path(instance, filename):
    return f"attachments/{instance.workspace_id}/{instance.issue_id}/{filename}"


class Attachment(TenantModel):
    issue = models.ForeignKey("projects.Issue", on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=attachment_path, max_length=255)
    name = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=120, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        storage, path = self.file.storage, self.file.name
        super().delete(*args, **kwargs)
        if path and storage.exists(path):
            storage.delete(path)

    @property
    def extension(self):
        return os.path.splitext(self.name)[1].lower()


class AuditLog(TenantModel):
    class Action(models.TextChoices):
        CREATED = "created"
        UPDATED = "updated"
        DELETED = "deleted"
        MOVED = "moved"
        COMMENTED = "commented"
        ATTACHED = "attached"

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=20, choices=Action.choices)
    entity_type = models.CharField(max_length=40)
    entity_id = models.PositiveBigIntegerField()
    entity_label = models.CharField(max_length=255, blank=True)
    # {"field": [old, new]} for updates
    changes = models.JSONField(default=dict, blank=True)
    # lets the issue activity feed include comment/attachment entries
    issue = models.ForeignKey("projects.Issue", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["workspace", "entity_type", "entity_id"])]

    def __str__(self):
        return f"{self.actor} {self.action} {self.entity_type} {self.entity_label}"
