from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("webhooks", views.WebhookEndpointViewSet, basename="webhook")

urlpatterns = router.urls
