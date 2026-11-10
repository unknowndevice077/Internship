from django.conf import settings
from django.db import models

from apps.tenancy.managers import TenantModel


class Notification(TenantModel):
    class Verb(models.TextChoices):
        ASSIGNED = "assigned"
        COMMENTED = "commented"
        MENTIONED = "mentioned"
        STATUS_CHANGED = "status_changed"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    verb = models.CharField(max_length=20, choices=Verb.choices)
    issue = models.ForeignKey("projects.Issue", null=True, on_delete=models.CASCADE, related_name="+")
    text = models.CharField(max_length=300)
    read_at = models.DateTimeField(null=True, blank=True)
    emailed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["recipient", "workspace", "read_at"])]

    def __str__(self):
        return self.text
