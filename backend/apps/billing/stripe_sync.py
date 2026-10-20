from datetime import datetime, timezone

import stripe
from django.conf import settings
from django.db import transaction

from .models import Subscription
from .plans import PAID_PLANS, plan_by_lookup_key

ACTIVE_STATUSES = {"active", "trialing", "past_due"}


def client_kwargs():
    return {"api_key": settings.STRIPE_SECRET_KEY}


def subscription_for(workspace):
    sub, _ = Subscription.objects.get_or_create(workspace=workspace)
    return sub


def ensure_customer(workspace, email):
    sub = subscription_for(workspace)
    if not sub.stripe_customer_id:
        customer = stripe.Customer.create(
            name=workspace.name, email=email, metadata={"workspace_id": workspace.id, "slug": workspace.slug},
            **client_kwargs(),
        )
        sub.stripe_customer_id = customer.id
        sub.save(update_fields=["stripe_customer_id", "updated_at"])
    return sub.stripe_customer_id


def price_id(plan_code):
    plan = PAID_PLANS[plan_code]
    prices = stripe.Price.list(lookup_keys=[plan.lookup_key], active=True, limit=1, **client_kwargs())
    if not prices.data:
        raise LookupError(f"No active Stripe price with lookup_key {plan.lookup_key}. Run manage.py stripe_setup.")
    return prices.data[0].id


def create_checkout(workspace, user, plan_code):
    customer = ensure_customer(workspace, user.email)
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer,
        line_items=[{"price": price_id(plan_code), "quantity": 1}],
        client_reference_id=str(workspace.id),
        metadata={"workspace_id": workspace.id},
        subscription_data={"metadata": {"workspace_id": workspace.id}},
        allow_promotion_codes=True,
        success_url=f"{settings.FRONTEND_URL}/billing?checkout=success",
        cancel_url=f"{settings.FRONTEND_URL}/billing?checkout=cancelled",
        **client_kwargs(),
    )
    return session.url


def create_portal(workspace):
    sub = subscription_for(workspace)
    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id, return_url=f"{settings.FRONTEND_URL}/billing", **client_kwargs()
    )
    return session.url


def _period_end(data):
    # newer API versions moved current_period_end onto the subscription items
    ts = data.get("current_period_end")
    if ts is None:
        items = (data.get("items") or {}).get("data") or []
        ts = items[0].get("current_period_end") if items else None
    return datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None


def _plan_code(data):
    items = (data.get("items") or {}).get("data") or []
    for item in items:
        plan = plan_by_lookup_key((item.get("price") or {}).get("lookup_key"))
        if plan:
            return plan.code
    return None


def as_dict(obj):
    # recent stripe-python versions return StripeObjects that aren't dict subclasses
    return obj.to_dict() if hasattr(obj, "to_dict") else obj


@transaction.atomic
def apply_subscription(data):
    """Mirror a Stripe subscription object onto our Subscription row and the workspace plan."""
    data = as_dict(data)
    sub = (
        Subscription.objects.select_for_update().select_related("workspace")
        .filter(stripe_customer_id=data["customer"]).first()
    )
    if sub is None:
        workspace_id = (data.get("metadata") or {}).get("workspace_id")
        if not workspace_id:
            return None
        sub, _ = Subscription.objects.select_for_update().get_or_create(workspace_id=workspace_id)
        sub.stripe_customer_id = data["customer"]

    status = data.get("status", "")
    plan = _plan_code(data) if status in ACTIVE_STATUSES else None
    sub.stripe_subscription_id = data["id"] if plan else ""
    sub.status = status
    sub.plan = plan or "free"
    sub.current_period_end = _period_end(data)
    sub.cancel_at_period_end = bool(data.get("cancel_at_period_end"))
    sub.save()

    workspace = sub.workspace
    if workspace.plan != sub.plan:
        workspace.plan = sub.plan
        workspace.save(update_fields=["plan"])
    return sub
