import json

from django.core.serializers.json import DjangoJSONEncoder
from django.http import StreamingHttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.views import APIView

from apps.activity.models import Attachment, AuditLog, Comment
from apps.projects.models import Issue, Project, Sprint, Status, Transition

from .models import Role
from .permissions import WorkspaceRolePermission

SECTIONS = [
    ("projects", Project),
    ("statuses", Status),
    ("transitions", Transition),
    ("sprints", Sprint),
    ("issues", Issue),
    ("comments", Comment),
    # metadata only, the files themselves stay in storage
    ("attachments", Attachment),
    ("audit_log", AuditLog),
]


def dumps(value):
    return json.dumps(value, cls=DjangoJSONEncoder)


def stream(workspace):
    members = list(
        workspace.memberships.select_related("user").values("user__email", "user__full_name", "role", "joined_at")
    )
    yield "{"
    yield f'"exported_at": {dumps(timezone.now())}, '
    yield f'"workspace": {dumps({"name": workspace.name, "slug": workspace.slug, "plan": workspace.plan})}, '
    yield f'"members": {dumps(members)}'
    for name, model in SECTIONS:
        yield f', "{name}": ['
        first = True
        # rows are written as they are read, so a big workspace doesn't sit in memory
        for row in model.objects.all().for_workspace(workspace).values().iterator(chunk_size=500):
            yield ("" if first else ",") + dumps(row)
            first = False
        yield "]"
    yield "}"


class WorkspaceExportView(APIView):
    permission_classes = [WorkspaceRolePermission]
    read_role = Role.OWNER

    @extend_schema(responses={200: OpenApiResponse(description="JSON download of the whole workspace")})
    def get(self, request):
        response = StreamingHttpResponse(stream(request.workspace), content_type="application/json")
        response["Content-Disposition"] = f'attachment; filename="{request.workspace.slug}-export.json"'
        return response
