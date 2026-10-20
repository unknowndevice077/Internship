from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["created_at", "recipient", "verb", "text", "read_at"]
    list_filter = ["verb", "workspace"]
