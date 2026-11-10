from django.contrib import admin

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["id", "kind", "workspace", "state", "created_at"]
    list_filter = ["kind", "state"]
