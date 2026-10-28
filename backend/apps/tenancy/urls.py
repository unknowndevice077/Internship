from django.urls import path
from rest_framework.routers import SimpleRouter

from . import export, views

router = SimpleRouter()
router.register("members", views.MembershipViewSet, basename="member")

urlpatterns = [
    path("workspaces/", views.MyWorkspacesView.as_view(), name="my-workspaces"),
    path("workspace/", views.CurrentWorkspaceView.as_view(), name="current-workspace"),
    path("workspace/export/", export.WorkspaceExportView.as_view(), name="workspace-export"),
    *router.urls,
]
