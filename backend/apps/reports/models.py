from django.conf import settings
from django.db import models

from apps.tenancy.managers import TenantModel


def report_path(instance, filename):
    return f"reports/{instance.workspace_id}/{filename}"


class Report(TenantModel):
    class Kind(models.TextChoices):
        SPRINT = "sprint", "Sprint report"
        WEEKLY = "weekly", "Weekly summary"

    class State(models.TextChoices):
        PENDING = "pending"
        READY = "ready"
        FAILED = "failed"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    project = models.ForeignKey("projects.Project", null=True, blank=True, on_delete=models.CASCADE, related_name="reports")
    sprint = models.ForeignKey("projects.Sprint", null=True, blank=True, on_delete=models.CASCADE, related_name="reports")
    state = models.CharField(max_length=10, choices=State.choices, default=State.PENDING)
    data = models.JSONField(default=dict, blank=True)
    file = models.FileField(upload_to=report_path, blank=True)
    error = models.CharField(max_length=500, blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.get_kind_display()} #{self.pk}"
