from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("reports", views.ReportViewSet, basename="report")

urlpatterns = router.urls
