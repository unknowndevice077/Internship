from django.contrib import admin

from .models import StripeEvent, Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ["workspace", "plan", "status", "current_period_end", "cancel_at_period_end"]
    list_filter = ["plan", "status"]
    search_fields = ["stripe_customer_id", "stripe_subscription_id", "workspace__slug"]


@admin.register(StripeEvent)
class StripeEventAdmin(admin.ModelAdmin):
    list_display = ["received_at", "type", "event_id"]
