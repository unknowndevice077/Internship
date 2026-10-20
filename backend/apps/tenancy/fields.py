from django.contrib.auth import get_user_model
from rest_framework import serializers


def current_workspace(field):
    request = field.context.get("request")
    return getattr(request, "workspace", None)


class WorkspaceRelatedField(serializers.PrimaryKeyRelatedField):
    # only accepts ids from the current workspace, so you can't attach another tenant's objects
    def get_queryset(self):
        return super().get_queryset().filter(workspace=current_workspace(self))


class MemberField(serializers.PrimaryKeyRelatedField):
    def __init__(self, **kwargs):
        kwargs.setdefault("queryset", get_user_model().objects.all())
        super().__init__(**kwargs)

    def get_queryset(self):
        return super().get_queryset().filter(memberships__workspace=current_workspace(self))
