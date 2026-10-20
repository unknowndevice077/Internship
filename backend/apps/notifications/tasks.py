from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from .models import Notification


@shared_task
def email_notifications(ids):
    pending = Notification.objects.filter(pk__in=ids, emailed=False).select_related("recipient", "issue", "workspace")
    for n in pending:
        if not n.recipient.is_active or not n.recipient.has_usable_password():
            continue
        link = f"{settings.FRONTEND_URL}/projects/{n.issue.project_id}/board" if n.issue else settings.FRONTEND_URL
        send_mail(
            subject=f"[{n.workspace.name}] {n.text}",
            message=f"{n.text}\n\nOpen Sprintboard: {link}\n",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[n.recipient.email],
            fail_silently=True,
        )
        n.emailed = True
        n.save(update_fields=["emailed"])
