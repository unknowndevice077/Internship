import django_filters
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.tenancy.models import Role
from apps.tenancy.views import TenantViewSet

from . import ranking
from .models import Board, Issue, Project, Sprint, Status
from .serializers import (
    BoardIssueSerializer,
    BoardSerializer,
    IssueMoveSerializer,
    IssueSerializer,
    ProjectSerializer,
    SprintCompleteSerializer,
    SprintSerializer,
    StatusSerializer,
)


class ProjectViewSet(TenantViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    write_role = Role.ADMIN

    def get_queryset(self):
        return super().get_queryset().annotate(issue_count=Count("issues")).order_by("name")

    @action(detail=True, methods=["get"], url_path="board")
    def board(self, request, pk=None):
        project = self.get_object()
        issues = (
            Issue.objects.for_workspace(request.workspace)
            .filter(project=project)
            .select_related("project", "assignee")
        )
        sprint = request.query_params.get("sprint")
        if sprint == "active":
            issues = issues.filter(sprint__state=Sprint.State.ACTIVE)
        elif sprint:
            issues = issues.filter(sprint_id=sprint)

        by_status = {}
        for issue in issues:
            by_status.setdefault(issue.status_id, []).append(issue)
        columns = [
            {**StatusSerializer(s, context={"request": request}).data,
             "issues": BoardIssueSerializer(by_status.get(s.id, []), many=True).data}
            for s in project.statuses.all()
        ]
        return Response({"project": ProjectSerializer(project, context={"request": request}).data, "columns": columns})


class StatusViewSet(TenantViewSet):
    queryset = Status.objects.all()
    serializer_class = StatusSerializer
    write_role = Role.ADMIN
    filterset_fields = ["project"]
    pagination_class = None

    def perform_destroy(self, instance):
        if instance.issues.exists():
            raise exceptions.ValidationError({"detail": "Move the issues out of this status first."})
        instance.delete()


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
            # unfinished work goes to the chosen sprint, or back to the backlog
            sprint.issues.exclude(status__category=Status.Category.DONE).update(sprint=move_to)
            sprint.state = Sprint.State.CLOSED
            sprint.end_date = sprint.end_date or timezone.localdate()
            sprint.save()
        return Response(self.get_serializer(sprint).data)


class IssueFilter(django_filters.FilterSet):
    backlog = django_filters.BooleanFilter(field_name="sprint", lookup_expr="isnull")
    q = django_filters.CharFilter(field_name="title", lookup_expr="icontains")

    class Meta:
        model = Issue
        fields = ["project", "status", "sprint", "assignee", "type", "priority"]


class IssueViewSet(TenantViewSet):
    queryset = Issue.objects.all()
    serializer_class = IssueSerializer
    filterset_class = IssueFilter
    action_roles = {"destroy": Role.ADMIN}

    def get_queryset(self):
        return super().get_queryset().select_related("project", "assignee", "reporter")

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.workspace, reporter=self.request.user)

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        issue = self.get_object()
        body = IssueMoveSerializer(data=request.data, context={"request": request, "issue": issue})
        body.is_valid(raise_exception=True)
        data = body.validated_data
        ranking.move_issue(issue, data["status"], data.get("before"), data.get("after"))
        return Response(self.get_serializer(issue).data)
