import re

import django_filters
from django.contrib.postgres.search import SearchQuery, SearchVector
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.activity import audit
from apps.activity.models import AuditLog
from apps.billing import limits
from apps.reports import insights
from apps.reports.models import Report
from apps.reports.tasks import build_report
from apps.tenancy.models import Role
from apps.tenancy.views import TenantViewSet

from . import ranking
from .models import Board, Issue, Project, Sprint, Status, Transition, transition_allowed
from .serializers import (
    BoardSerializer,
    IssueMoveSerializer,
    IssueSerializer,
    ProjectSerializer,
    SprintCompleteSerializer,
    SprintSerializer,
    StatusSerializer,
    TransitionSerializer,
)

BOARD_FIELDS = (
    "id",
    "number",
    "title",
    "type",
    "priority",
    "status",
    "sprint",
    "story_points",
    "rank",
    "assignee",
    "assignee__email",
    "assignee__full_name",
)


def board_card(project, row):
    assignee = None
    if row["assignee"]:
        assignee = {"id": row["assignee"], "email": row["assignee__email"], "full_name": row["assignee__full_name"]}
    return {
        "id": row["id"],
        "key": f"{project.key}-{row['number']}",
        "title": row["title"],
        "type": row["type"],
        "priority": row["priority"],
        "status": row["status"],
        "sprint": row["sprint"],
        "assignee": assignee,
        "story_points": row["story_points"],
        "rank": row["rank"],
    }


class ProjectViewSet(TenantViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    write_role = Role.ADMIN

    def get_queryset(self):
        return super().get_queryset().annotate(issue_count=Count("issues")).order_by("name")

    def perform_create(self, serializer):
        limits.check(self.request.workspace, "projects")
        return super().perform_create(serializer)

    @action(detail=True, methods=["get"], url_path="board")
    def board(self, request, pk=None):
        project = self.get_object()
        issues = Issue.objects.for_workspace(request.workspace).filter(project=project)
        sprint = request.query_params.get("sprint")
        if sprint == "active":
            issues = issues.filter(sprint__state=Sprint.State.ACTIVE)
        elif sprint:
            issues = issues.filter(sprint_id=sprint)

        # .values() instead of a serializer, see docs/PERFORMANCE.md
        by_status = {}
        for row in issues.values(*BOARD_FIELDS):
            by_status.setdefault(row["status"], []).append(board_card(project, row))
        columns = [
            {
                "id": s.id,
                "project": project.id,
                "name": s.name,
                "category": s.category,
                "order": s.order,
                "issues": by_status.get(s.id, []),
            }
            for s in project.statuses.all()
        ]
        transitions = list(project.transitions.values_list("from_status_id", "to_status_id"))
        return Response(
            {
                "project": ProjectSerializer(project, context={"request": request}).data,
                "columns": columns,
                "transitions": transitions,
            }
        )


class StatusViewSet(TenantViewSet):
    queryset = Status.objects.all()
    serializer_class = StatusSerializer
    write_role = Role.ADMIN
    filterset_fields = ["project"]
    pagination_class = None

    def perform_destroy(self, instance):
        if instance.issues.exists():
            raise exceptions.ValidationError({"detail": "Move the issues out of this status first."})
        super().perform_destroy(instance)


class TransitionViewSet(TenantViewSet):
    queryset = Transition.objects.select_related("from_status", "to_status")
    serializer_class = TransitionSerializer
    write_role = Role.ADMIN
    filterset_fields = ["project"]
    pagination_class = None
    http_method_names = ["get", "post", "delete"]


class BoardViewSet(TenantViewSet):
    queryset = Board.objects.all()
    serializer_class = BoardSerializer
    write_role = Role.ADMIN
    filterset_fields = ["project"]
    pagination_class = None


class SprintViewSet(TenantViewSet):
    queryset = Sprint.objects.all()
    serializer_class = SprintSerializer
    filterset_fields = ["project", "state"]
    pagination_class = None

    def get_queryset(self):
        return super().get_queryset().order_by("-id")

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        sprint = self.get_object()
        if sprint.state != Sprint.State.PLANNED:
            raise exceptions.ValidationError({"detail": "Only planned sprints can be started."})
        if Sprint.objects.filter(project=sprint.project, state=Sprint.State.ACTIVE).exists():
            raise exceptions.ValidationError({"detail": "This project already has an active sprint."})
        sprint.state = Sprint.State.ACTIVE
        sprint.start_date = sprint.start_date or timezone.localdate()
        sprint.save()
        audit.record(request.user, AuditLog.Action.UPDATED, sprint, {"state": ["planned", "active"]})
        return Response(self.get_serializer(sprint).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        sprint = self.get_object()
        if sprint.state != Sprint.State.ACTIVE:
            raise exceptions.ValidationError({"detail": "Only the active sprint can be completed."})
        body = SprintCompleteSerializer(data=request.data, context={"request": request})
        body.is_valid(raise_exception=True)
        move_to = body.validated_data.get("move_to")
        if move_to and (move_to.project_id != sprint.project_id or move_to.state == Sprint.State.CLOSED):
            raise exceptions.ValidationError({"move_to": "Pick an open sprint in the same project."})

        with transaction.atomic():
            report = Report.objects.create(
                workspace=request.workspace,
                kind=Report.Kind.SPRINT,
                project=sprint.project,
                sprint=sprint,
                requested_by=request.user,
                data={"issue_ids": list(sprint.issues.values_list("id", flat=True))},
            )
            # unfinished work goes to the chosen sprint, or back to the backlog
            sprint.issues.exclude(status__category=Status.Category.DONE).update(sprint=move_to)
            sprint.state = Sprint.State.CLOSED
            sprint.end_date = sprint.end_date or timezone.localdate()
            sprint.save()
            audit.record(request.user, AuditLog.Action.UPDATED, sprint, {"state": ["active", "closed"]})
            transaction.on_commit(lambda: build_report.delay(report.id))
        return Response(self.get_serializer(sprint).data)

    @extend_schema(responses={200: OpenApiResponse(description="Points left per day and the ideal line")})
    @action(detail=True, methods=["get"])
    def burndown(self, request, pk=None):
        return Response(insights.burndown(self.get_object()))


KEY_RE = re.compile(r"^([A-Za-z][A-Za-z0-9]*)-(\d+)$")


class IssueFilter(django_filters.FilterSet):
    backlog = django_filters.BooleanFilter(field_name="sprint", lookup_expr="isnull")
    q = django_filters.CharFilter(method="search")

    def search(self, queryset, name, value):
        value = value.strip()
        # "WEB-12" jumps straight to the issue
        match = KEY_RE.match(value)
        if match:
            return queryset.filter(project__key__iexact=match.group(1), number=int(match.group(2)))
        vector = SearchVector("title", "description", config="english")
        query = SearchQuery(value, config="english", search_type="websearch")
        # the substring match keeps partial words working ("auth" finds "authentication")
        return queryset.annotate(search=vector).filter(Q(search=query) | Q(title__icontains=value))

    class Meta:
        model = Issue
        fields = ["project", "status", "sprint", "assignee", "type", "priority"]


class IssueViewSet(TenantViewSet):
    queryset = Issue.objects.all()
    serializer_class = IssueSerializer
    filterset_class = IssueFilter
    ordering_fields = ["rank", "number", "priority", "created_at", "updated_at"]
    action_roles = {"destroy": Role.ADMIN}

    def get_queryset(self):
        return super().get_queryset().select_related("project", "assignee", "reporter")

    def perform_create(self, serializer):
        return super().perform_create(serializer, reporter=self.request.user)

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        issue = self.get_object()
        body = IssueMoveSerializer(data=request.data, context={"request": request, "issue": issue})
        body.is_valid(raise_exception=True)
        data = body.validated_data
        old_status = issue.status
        if not transition_allowed(issue.project, old_status.id, data["status"].id):
            raise exceptions.ValidationError(
                {"status": f"The workflow doesn't allow moving from {old_status.name} to {data['status'].name}."}
            )
        ranking.move_issue(issue, data["status"], data.get("before"), data.get("after"))
        if old_status.id != data["status"].id:
            audit.record(request.user, AuditLog.Action.MOVED, issue, {"status": [old_status.name, data["status"].name]})
        return Response(self.get_serializer(issue).data)
