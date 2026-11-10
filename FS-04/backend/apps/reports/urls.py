from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("reports", views.ReportViewSet, basename="report")

urlpatterns = [path("overview/", views.OverviewView.as_view(), name="overview"), *router.urls]
