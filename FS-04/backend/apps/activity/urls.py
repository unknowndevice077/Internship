from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("comments", views.CommentViewSet, basename="comment")
router.register("attachments", views.AttachmentViewSet, basename="attachment")
router.register("audit-log", views.AuditLogViewSet, basename="audit-log")

urlpatterns = router.urls
