from django.contrib import admin

from .models import Attachment, AuditLog, Comment


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "workspace", "actor", "action", "entity_type", "entity_label"]
    list_filter = ["workspace", "action", "entity_type"]
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


admin.site.register([Comment, Attachment])
