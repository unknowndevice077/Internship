from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.tenancy.permissions import WorkspaceRolePermission
from apps.tenancy.serializers import MemberUserSerializer

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = MemberUserSerializer(read_only=True)
    issue_key = serializers.CharField(source="issue.key", read_only=True, default=None)
    project = serializers.IntegerField(source="issue.project_id", read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ["id", "verb", "text", "actor", "issue", "issue_key", "project", "read_at", "created_at"]


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [WorkspaceRolePermission]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        qs = Notification.objects.filter(recipient=self.request.user, workspace=self.request.workspace)
        if self.request.query_params.get("unread") == "true":
            qs = qs.filter(read_at__isnull=True)
        return qs.select_related("actor", "issue__project")

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        note = self.get_object()
        if note.read_at is None:
            note.read_at = timezone.now()
            note.save(update_fields=["read_at"])
        return Response(self.get_serializer(note).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        updated = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"updated": updated})
