import secrets

from django.db import models

from apps.tenancy.managers import TenantModel

EVENTS = [
    "issue.created",
    "issue.updated",
    "issue.moved",
    "issue.deleted",
    "comment.commented",
    "attachment.attached",
    "sprint.created",
    "sprint.updated",
    "project.created",
    "membership.created",
]


def new_secret():
    return secrets.token_hex(24)


class WebhookEndpoint(TenantModel):
    url = models.URLField(max_length=500)
    description = models.CharField(max_length=200, blank=True)
    # empty list = every event
    events = models.JSONField(default=list, blank=True)
    secret = models.CharField(max_length=64, default=new_secret)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.url

    def wants(self, event):
        return not self.events or event in self.events


class WebhookDelivery(TenantModel):
    class State(models.TextChoices):
        PENDING = "pending"
        SUCCESS = "success"
        FAILED = "failed"

    endpoint = models.ForeignKey(WebhookEndpoint, on_delete=models.CASCADE, related_name="deliveries")
    event = models.CharField(max_length=60)
    payload = models.JSONField()
    state = models.CharField(max_length=10, choices=State.choices, default=State.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    response_code = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    last_error = models.CharField(max_length=500, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "webhook deliveries"

    def __str__(self):
        return f"{self.event} -> {self.endpoint_id} ({self.state})"
