from django.http import FileResponse
from rest_framework import exceptions, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.billing import limits
from apps.tenancy.models import Role
from apps.tenancy.permissions import WorkspaceRolePermission
from apps.tenancy.views import TenantViewSet

from . import audit
from .models import Attachment, AuditLog, Comment
from .serializers import AttachmentSerializer, AuditLogSerializer, CommentSerializer


class OwnedByMixin:
    owner_field = "author"

    def check_owner(self, instance, allow_admin):
        if getattr(instance, f"{self.owner_field}_id") == self.request.user.id:
            return
        if allow_admin and self.request.membership.has_role(Role.ADMIN):
            return
        raise exceptions.PermissionDenied("You can only change your own items.")


class CommentViewSet(OwnedByMixin, TenantViewSet):
    queryset = Comment.objects.select_related("author")
    serializer_class = CommentSerializer
    filterset_fields = ["issue"]
    pagination_class = None
    audited = False

    def perform_create(self, serializer):
        comment = serializer.save(workspace=self.request.workspace, author=self.request.user)
        audit.record(self.request.user, AuditLog.Action.COMMENTED, comment, {"body": [None, comment.body[:200]]})
        return comment

    def perform_update(self, serializer):
        self.check_owner(serializer.instance, allow_admin=False)
        return serializer.save()

    def perform_destroy(self, instance):
        self.check_owner(instance, allow_admin=True)
        audit.record(self.request.user, AuditLog.Action.DELETED, instance)
        instance.delete()


class AttachmentViewSet(OwnedByMixin, TenantViewSet):
    queryset = Attachment.objects.select_related("uploaded_by")
    serializer_class = AttachmentSerializer
    filterset_fields = ["issue"]
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "delete"]
    owner_field = "uploaded_by"
    audited = False

    def perform_create(self, serializer):
        limits.check(self.request.workspace, "storage_mb", adding=serializer.validated_data["file"].size / 1024 / 1024)
        attachment = serializer.save(workspace=self.request.workspace, uploaded_by=self.request.user)
        audit.record(self.request.user, AuditLog.Action.ATTACHED, attachment)
        return attachment

    def perform_destroy(self, instance):
        self.check_owner(instance, allow_admin=True)
        audit.record(self.request.user, AuditLog.Action.DELETED, instance)
        instance.delete()

    # served through the API rather than /media so tenant checks apply
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        attachment = self.get_object()
        return FileResponse(attachment.file.open("rb"), as_attachment=True, filename=attachment.name)


class AuditLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [WorkspaceRolePermission]
    serializer_class = AuditLogSerializer
    filterset_fields = ["entity_type", "entity_id", "actor", "action", "issue"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AuditLog.objects.none()
        return AuditLog.objects.for_workspace(self.request.workspace).select_related("actor")

    @property
    def read_role(self):
        # full log is admin-only, a single issue's history is open to members
        return Role.VIEWER if self.request.query_params.get("issue") else Role.ADMIN
