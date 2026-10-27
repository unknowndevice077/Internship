from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from . import tokens


def _send(user, subject, body):
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email])


@shared_task
def send_verification_email(user_id):
    user = get_user_model().objects.filter(pk=user_id, email_verified_at__isnull=True).first()
    if user:
        _send(
            user,
            "Confirm your Sprintboard email",
            f"Confirm your email address to finish setting up your account:\n\n{tokens.verify_link(user)}\n\n"
            "The link is valid for 3 days.\n",
        )


@shared_task
def send_password_reset_email(user_id):
    user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
    if user and user.has_usable_password():
        _send(
            user,
            "Reset your Sprintboard password",
            f"Someone asked to reset the password for {user.email}. If that was you, open this link "
            f"within 2 hours:\n\n{tokens.reset_link(user)}\n\nOtherwise you can ignore this email.\n",
        )
