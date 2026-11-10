from django.contrib import admin

from .models import Board, Issue, Project, Sprint, Status


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["key", "name", "workspace"]
    list_filter = ["workspace"]


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ["__str__", "title", "status", "assignee", "workspace"]
    list_filter = ["workspace", "project", "type", "priority"]
    search_fields = ["title"]


admin.site.register([Status, Board, Sprint])
