from django.conf import settings
from rest_framework.exceptions import PermissionDenied


def require_verified_email(user):
    if settings.REQUIRE_VERIFIED_EMAIL and not user.email_verified:
        raise PermissionDenied({"detail": "Confirm your email address first.", "code": "email_unverified"})
