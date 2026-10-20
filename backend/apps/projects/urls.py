from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("projects", views.ProjectViewSet, basename="project")
router.register("statuses", views.StatusViewSet, basename="status")
router.register("boards", views.BoardViewSet, basename="board")
router.register("sprints", views.SprintViewSet, basename="sprint")
router.register("issues", views.IssueViewSet, basename="issue")

urlpatterns = router.urls
