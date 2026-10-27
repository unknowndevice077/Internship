from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

VERIFY_SALT = "accounts.verify-email"


def reset_link(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"


def user_from_reset(uid, token):
    User = get_user_model()
    try:
        user = User.objects.get(pk=urlsafe_base64_decode(uid).decode())
    except (ValueError, TypeError, OverflowError, User.DoesNotExist):
        return None
    # the token hashes the password and last_login, so it stops working once used
    return user if default_token_generator.check_token(user, token) else None


def verify_link(user):
    # signing the email too means changing the address invalidates old links
    token = signing.dumps({"id": user.pk, "email": user.email}, salt=VERIFY_SALT)
    return f"{settings.FRONTEND_URL}/verify-email?token={token}"


def user_from_verify(token):
    try:
        data = signing.loads(token, salt=VERIFY_SALT, max_age=settings.EMAIL_VERIFY_MAX_AGE)
    except signing.BadSignature:
        return None
    return get_user_model().objects.filter(pk=data["id"], email=data["email"]).first()
