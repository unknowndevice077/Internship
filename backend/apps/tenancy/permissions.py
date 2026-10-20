from rest_framework import exceptions
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Membership, Role


def resolve_membership(request):
    slug = request.headers.get("X-Workspace")
    if not slug:
        raise exceptions.ValidationError({"detail": "X-Workspace header is required."})
    membership = Membership.objects.select_related("workspace").filter(user=request.user, workspace__slug=slug).first()
    # 404 instead of 403 so we don't reveal which workspace slugs exist
    if membership is None:
        raise exceptions.NotFound("Workspace not found.")
    return membership


def required_role(view, request):
    action_roles = getattr(view, "action_roles", {})
    action = getattr(view, "action", None)
    if action in action_roles:
        return action_roles[action]
    if request.method in SAFE_METHODS:
        return getattr(view, "read_role", Role.VIEWER)
    return getattr(view, "write_role", Role.MEMBER)


class WorkspaceRolePermission(BasePermission):
    # sets request.workspace / request.membership for the rest of the request
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        membership = resolve_membership(request)
        request.workspace = membership.workspace
        request.membership = membership
        return membership.has_role(required_role(view, request))
