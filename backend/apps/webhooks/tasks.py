import time

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.billing.plans import plan_for
from apps.tenancy.models import Workspace

from .models import WebhookDelivery, WebhookEndpoint
from .signing import UnsafeURL, check_url, encode, sign

MAX_ATTEMPTS = 5


@shared_task
def fan_out_event(workspace_id, event, payload):
    # endpoints stop firing if the workspace drops back to a plan without webhooks
    if not plan_for(Workspace.objects.get(pk=workspace_id)).webhooks:
        return
    endpoints = WebhookEndpoint.objects.filter(workspace_id=workspace_id, is_active=True)
    for endpoint in endpoints:
        if endpoint.wants(event):
            delivery = WebhookDelivery.objects.create(
                workspace_id=workspace_id, endpoint=endpoint, event=event, payload=payload
            )
            deliver_webhook.delay(delivery.id)


@shared_task
def deliver_webhook(delivery_id):
    delivery = WebhookDelivery.objects.select_related("endpoint").filter(pk=delivery_id).first()
    if delivery is None or delivery.state != WebhookDelivery.State.PENDING:
        return
    endpoint = delivery.endpoint
    body = encode(delivery.payload)
    delivery.attempts += 1

    started = time.monotonic()
    try:
        # re-check at send time too, DNS can change after the endpoint was saved
        check_url(endpoint.url)
        res = requests.post(
            endpoint.url,
            data=body,
            timeout=settings.WEBHOOK_TIMEOUT_SECONDS,
            allow_redirects=False,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Sprintboard-Webhooks/1.0",
                "X-Sprintboard-Event": delivery.event,
                "X-Sprintboard-Delivery": str(delivery.id),
                "X-Sprintboard-Signature": sign(endpoint.secret, body),
            },
        )
        delivery.response_code = res.status_code
        delivery.response_body = res.text[:2000]
        ok = 200 <= res.status_code < 300
        delivery.last_error = "" if ok else f"HTTP {res.status_code}"
    except UnsafeURL as exc:
        ok = False
        delivery.last_error = str(exc)
        delivery.attempts = MAX_ATTEMPTS  # not worth retrying
    except requests.RequestException as exc:
        ok = False
        delivery.last_error = str(exc)[:500]

    delivery.duration_ms = int((time.monotonic() - started) * 1000)
    if ok:
        delivery.state = WebhookDelivery.State.SUCCESS
        delivery.delivered_at = timezone.now()
    elif delivery.attempts >= MAX_ATTEMPTS:
        delivery.state = WebhookDelivery.State.FAILED
    delivery.save()

    if not ok and delivery.attempts < MAX_ATTEMPTS:
        # attempts are tracked on the row, so schedule the next one instead of celery's retry: 30s, 1m, 2m, 4m
        deliver_webhook.apply_async((delivery.id,), countdown=30 * 2 ** (delivery.attempts - 1))
