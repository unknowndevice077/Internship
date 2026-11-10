import hashlib
import hmac
import json
import time
from types import SimpleNamespace

import pytest
import stripe

from apps.billing.models import StripeEvent, Subscription
from tests.factories import MembershipFactory, ProjectFactory

pytestmark = pytest.mark.django_db

WEBHOOK_SECRET = "whsec_test_123"


@pytest.fixture(autouse=True)
def stripe_settings(settings):
    settings.STRIPE_SECRET_KEY = "sk_test_dummy"
    settings.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET


def signed_post(api, event):
    payload = json.dumps(event)
    ts = int(time.time())
    sig = hmac.new(WEBHOOK_SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return api.post(
        "/api/billing/webhook/", data=payload, content_type="application/json", HTTP_STRIPE_SIGNATURE=f"t={ts},v1={sig}"
    )


def subscription_event(
    workspace,
    status="active",
    lookup_key="sprintboard_pro_monthly",
    kind="customer.subscription.updated",
    event_id="evt_1",
):
    return {
        "id": event_id,
        "object": "event",
        "type": kind,
        "data": {
            "object": {
                "id": "sub_123",
                "object": "subscription",
                "customer": "cus_123",
                "status": status,
                "cancel_at_period_end": False,
                "metadata": {"workspace_id": str(workspace.id)},
                "items": {"data": [{"price": {"lookup_key": lookup_key}, "current_period_end": 1893456000}]},
            }
        },
    }


def test_free_plan_limits_projects(api, owner):
    api.as_member(owner)
    for i in range(3):
        assert api.post("/api/projects/", {"name": f"P{i}", "key": f"P{i}A"}).status_code == 201
    res = api.post("/api/projects/", {"name": "One more", "key": "MORE"})
    assert res.status_code == 402
    assert res.data["code"] == "plan_limit"
    assert "Free plan allows 3 projects" in res.data["detail"]


def test_free_plan_limits_members(api, owner):
    for _ in range(4):
        MembershipFactory(workspace=owner.workspace)
    res = api.as_member(owner).post("/api/members/", {"email": "sixth@acme.io"})
    assert res.status_code == 402


def test_billing_overview(api, owner):
    ProjectFactory(workspace=owner.workspace)
    res = api.as_member(owner).get("/api/billing/")
    assert res.data["plan"]["code"] == "free"
    assert res.data["usage"] == {"projects": 1, "members": 1, "storage_mb": 0}
    assert [p["code"] for p in res.data["plans"]] == ["free", "pro", "business"]


def test_only_owner_can_start_checkout(api, owner, member_of):
    api.as_member(member_of(owner.workspace, "admin"))
    assert api.post("/api/billing/checkout/", {"plan": "pro"}).status_code == 403


def test_checkout_creates_customer_and_session(api, owner, monkeypatch):
    calls = {}
    monkeypatch.setattr(
        stripe.Customer, "create", lambda **kw: calls.setdefault("customer", kw) and SimpleNamespace(id="cus_new")
    )
    monkeypatch.setattr(stripe.Price, "list", lambda **kw: SimpleNamespace(data=[SimpleNamespace(id="price_pro")]))

    def fake_session(**kw):
        calls["session"] = kw
        return SimpleNamespace(url="https://checkout.stripe.com/c/pay/cs_test_1")

    monkeypatch.setattr(stripe.checkout.Session, "create", fake_session)

    res = api.as_member(owner).post("/api/billing/checkout/", {"plan": "pro"})
    assert res.status_code == 200
    assert res.data["url"].startswith("https://checkout.stripe.com/")
    assert calls["session"]["customer"] == "cus_new"
    assert calls["session"]["line_items"] == [{"price": "price_pro", "quantity": 1}]
    assert calls["session"]["subscription_data"]["metadata"]["workspace_id"] == owner.workspace.id
    assert Subscription.objects.get(workspace=owner.workspace).stripe_customer_id == "cus_new"


def test_webhook_rejects_bad_signature(api):
    res = api.post(
        "/api/billing/webhook/", data="{}", content_type="application/json", HTTP_STRIPE_SIGNATURE="t=1,v1=bad"
    )
    assert res.status_code == 400


def test_subscription_webhook_upgrades_workspace(api, owner):
    res = signed_post(api, subscription_event(owner.workspace))
    assert res.status_code == 200
    owner.workspace.refresh_from_db()
    sub = Subscription.objects.get(workspace=owner.workspace)
    assert owner.workspace.plan == "pro"
    assert sub.status == "active" and sub.stripe_customer_id == "cus_123"
    assert sub.current_period_end.year == 2030


def test_webhook_events_are_processed_once(api, owner):
    event = subscription_event(owner.workspace)
    signed_post(api, event)
    owner.workspace.plan = "free"
    owner.workspace.save()
    res = signed_post(api, event)
    assert res.data == {"detail": "Already processed."}
    owner.workspace.refresh_from_db()
    assert owner.workspace.plan == "free"
    assert StripeEvent.objects.count() == 1


def test_cancelled_subscription_downgrades_to_free(api, owner):
    signed_post(api, subscription_event(owner.workspace, event_id="evt_up"))
    signed_post(
        api,
        subscription_event(
            owner.workspace, status="canceled", kind="customer.subscription.deleted", event_id="evt_down"
        ),
    )
    owner.workspace.refresh_from_db()
    assert owner.workspace.plan == "free"


def test_upgraded_workspace_gets_higher_limits(api, owner):
    signed_post(api, subscription_event(owner.workspace, lookup_key="sprintboard_business_monthly"))
    api.as_member(owner)
    for i in range(5):
        assert api.post("/api/projects/", {"name": f"P{i}", "key": f"Q{i}A"}).status_code == 201


def test_checkout_disabled_without_stripe_key(api, owner, settings):
    settings.STRIPE_SECRET_KEY = ""
    res = api.as_member(owner).post("/api/billing/checkout/", {"plan": "pro"})
    assert res.status_code == 503
