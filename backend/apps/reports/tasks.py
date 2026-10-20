import logging

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.utils import timezone

from apps.tenancy.models import Membership, Role, Workspace

from .builders import BUILDERS
from .models import Report

log = logging.getLogger(__name__)


@shared_task
def build_report(report_id):
    report = Report.objects.select_related("sprint", "workspace").get(pk=report_id)
    try:
        data, csv_text = BUILDERS[report.kind](report)
        report.data = data
        report.file.save(f"{report.kind}-{report.pk}.csv", ContentFile(csv_text.encode()), save=False)
        report.state = Report.State.READY
    except Exception as exc:
        log.exception("report %s failed", report_id)
        report.state = Report.State.FAILED
        report.error = str(exc)[:500]
    report.finished_at = timezone.now()
    report.save()
    return report.state


@shared_task
def send_weekly_summaries():
    for workspace in Workspace.objects.all():
        report = Report.objects.create(workspace=workspace, kind=Report.Kind.WEEKLY)
        if build_report(report.id) != Report.State.READY:
            continue
        report.refresh_from_db()
        lines = [f"{p['key']}: {p['created']} created, {p['completed']} completed, {p['open']} open"
                 for p in report.data["projects"]]
        admins = Membership.objects.filter(workspace=workspace, role__in=[Role.OWNER, Role.ADMIN]).select_related("user")
        send_mail(
            subject=f"[{workspace.name}] Weekly summary",
            message="Last 7 days\n\n" + ("\n".join(lines) or "No projects yet."),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[m.user.email for m in admins],
            fail_silently=True,
        )
