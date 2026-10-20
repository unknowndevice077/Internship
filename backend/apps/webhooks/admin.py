from django.contrib import admin

from .models import WebhookDelivery, WebhookEndpoint


@admin.register(WebhookEndpoint)
class WebhookEndpointAdmin(admin.ModelAdmin):
    list_display = ["url", "workspace", "is_active", "created_at"]
    list_filter = ["workspace", "is_active"]


@admin.register(WebhookDelivery)
class WebhookDeliveryAdmin(admin.ModelAdmin):
    list_display = ["event", "endpoint", "state", "attempts", "response_code", "created_at"]
    list_filter = ["state", "event"]
