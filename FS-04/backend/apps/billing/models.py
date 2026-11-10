from django.db import models


class Subscription(models.Model):
    workspace = models.OneToOneField("tenancy.Workspace", on_delete=models.CASCADE, related_name="subscription")
    stripe_customer_id = models.CharField(max_length=64, blank=True, db_index=True)
    stripe_subscription_id = models.CharField(max_length=64, blank=True, db_index=True)
    plan = models.CharField(max_length=20, default="free")
    status = models.CharField(max_length=30, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.workspace} {self.plan} ({self.status or 'none'})"


class StripeEvent(models.Model):
    # Stripe retries deliveries, the unique id makes handling idempotent
    event_id = models.CharField(max_length=64, unique=True)
    type = models.CharField(max_length=80)
    received_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.type} {self.event_id}"
