from django.db import transaction
from django.http import FileResponse
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import Project, Sprint
from apps.tenancy.fields import WorkspaceRelatedField
from apps.tenancy.models import Role
from apps.tenancy.permissions import WorkspaceRolePermission

from . import insights
from .models import Report
from .tasks import build_report


class ReportSerializer(serializers.ModelSerializer):
    project = WorkspaceRelatedField(queryset=Project.objects.all(), required=False, allow_null=True)
    sprint = WorkspaceRelatedField(queryset=Sprint.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Report
        fields = ["id", "kind", "project", "sprint", "state", "data", "error", "created_at", "finished_at"]
        read_only_fields = ["state", "data", "error", "created_at", "finished_at"]

    def validate(self, attrs):
        if attrs["kind"] == Report.Kind.SPRINT:
            sprint = attrs.get("sprint")
            if not sprint:
                raise serializers.ValidationError({"sprint": "Pick a sprint."})
            attrs["project"] = sprint.project
        return attrs


class ReportViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [WorkspaceRolePermission]
    serializer_class = ReportSerializer
    filterset_fields = ["project", "sprint", "kind", "state"]
    read_role = Role.VIEWER
    write_role = Role.MEMBER

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Report.objects.none()
        return Report.objects.for_workspace(self.request.workspace)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            report = serializer.save(workspace=request.workspace, requested_by=request.user)
            transaction.on_commit(lambda: build_report.delay(report.id))
        return Response(self.get_serializer(report).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        report = self.get_object()
        if report.state != Report.State.READY or not report.file:
            raise exceptions.NotFound("Report isn't ready yet.")
        return FileResponse(
            report.file.open("rb"), as_attachment=True, filename=f"{report.kind}-report-{report.pk}.csv"
        )


class OverviewView(APIView):
    """Numbers for the workspace home page: totals, a 14-day trend, active sprints, my work, recent activity."""

    permission_classes = [WorkspaceRolePermission]
    read_role = Role.VIEWER

    @extend_schema(responses={200: OpenApiResponse(description="Totals, trend, active sprints, my work, activity")})
    def get(self, request):
        return Response(insights.overview(request.workspace, request.user))
