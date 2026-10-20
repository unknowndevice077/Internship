from django.db import transaction
from django.db.models import OuterRef, Subquery
from rest_framework import exceptions, generics, mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from apps.activity import audit
from apps.activity.models import AuditLog

from .models import Membership, Role, Workspace
from .permissions import WorkspaceRolePermission
from .serializers import (
    MemberInviteSerializer,
    MembershipSerializer,
    WorkspaceCreateSerializer,
    WorkspaceSerializer,
)


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [WorkspaceRolePermission]
    read_role = Role.VIEWER
    write_role = Role.MEMBER
    action_roles = {}
    audited = True

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        return self.queryset.for_workspace(self.request.workspace)

    def perform_create(self, serializer, **extra):
        instance = serializer.save(workspace=self.request.workspace, **extra)
        if self.audited:
            audit.record(self.request.user, AuditLog.Action.CREATED, instance)
        return instance

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        instance = serializer.save()
        changes = audit.diff(before, audit.snapshot(instance))
        if self.audited and changes:
            audit.record(self.request.user, AuditLog.Action.UPDATED, instance, changes)
        return instance

    def perform_destroy(self, instance):
        if self.audited:
            audit.record(self.request.user, AuditLog.Action.DELETED, instance)
        instance.delete()


class MyWorkspacesView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        return WorkspaceCreateSerializer if self.request.method == "POST" else WorkspaceSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Workspace.objects.none()
        my_role = Membership.objects.filter(workspace=OuterRef("pk"), user=self.request.user).values("role")[:1]
        return (
            Workspace.objects.filter(memberships__user=self.request.user)
            .annotate(my_role=Subquery(my_role))
            .order_by("name")
        )


class CurrentWorkspaceView(generics.RetrieveUpdateAPIView):
    permission_classes = [WorkspaceRolePermission]
    serializer_class = WorkspaceSerializer
    write_role = Role.ADMIN

    def get_object(self):
        return self.request.workspace


class MembershipViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [WorkspaceRolePermission]
    read_role = Role.VIEWER
    write_role = Role.ADMIN
    pagination_class = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Membership.objects.none()
        return Membership.objects.filter(workspace=self.request.workspace).select_related("user").order_by("joined_at")

    def get_serializer_class(self):
        return MemberInviteSerializer if self.action == "create" else MembershipSerializer

    def perform_create(self, serializer):
        from apps.billing import limits

        limits.check(self.request.workspace, "members")
        membership = serializer.save()
        audit.record(self.request.user, AuditLog.Action.CREATED, membership)

    def perform_update(self, serializer):
        new_role = serializer.validated_data.get("role", serializer.instance.role)
        target = serializer.instance
        if Role.OWNER in (new_role, target.role) and self.request.membership.role != Role.OWNER:
            raise exceptions.PermissionDenied("Only owners can grant or change the owner role.")
        if target.role == Role.OWNER and new_role != Role.OWNER:
            self._ensure_another_owner(target)
        before = target.role
        serializer.save()
        if before != target.role:
            audit.record(self.request.user, AuditLog.Action.UPDATED, target, {"role": [before, target.role]})

    @transaction.atomic
    def perform_destroy(self, instance):
        if instance.role == Role.OWNER:
            if self.request.membership.role != Role.OWNER:
                raise exceptions.PermissionDenied("Only owners can remove an owner.")
            self._ensure_another_owner(instance)
        audit.record(self.request.user, AuditLog.Action.DELETED, instance)
        instance.delete()

    def _ensure_another_owner(self, membership):
        others = Membership.objects.filter(workspace=membership.workspace, role=Role.OWNER).exclude(pk=membership.pk)
        if not others.exists():
            raise exceptions.ValidationError({"detail": "A workspace needs at least one owner."})
