import logging

import stripe
from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import exceptions, serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import require_verified_email
from apps.tenancy.models import Membership, Role
from apps.tenancy.permissions import WorkspaceRolePermission

from . import stripe_sync
from .limits import usage
from .models import StripeEvent, Subscription
from .plans import PAID_PLANS, PLANS, plan_for

log = logging.getLogger(__name__)


class BillingUnavailable(exceptions.APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Billing isn't configured on this server (STRIPE_SECRET_KEY is missing)."


def require_stripe():
    if not settings.STRIPE_SECRET_KEY:
        raise BillingUnavailable()


URL_RESPONSE = inline_serializer("RedirectUrl", {"url": serializers.URLField()})


class BillingView(APIView):
    permission_classes = [WorkspaceRolePermission]
    read_role = Role.ADMIN

    @extend_schema(responses={200: OpenApiResponse(description="Plan, subscription status, usage and plans")})
    def get(self, request):
        workspace = request.workspace
        sub = Subscription.objects.filter(workspace=workspace).first()
        return Response(
            {
                "plan": plan_for(workspace).as_dict(),
                "status": sub.status if sub else "",
                "current_period_end": sub.current_period_end if sub else None,
                "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
                "has_customer": bool(sub and sub.stripe_customer_id),
                "usage": usage(workspace),
                "plans": [p.as_dict() for p in PLANS.values()],
                "stripe_enabled": bool(settings.STRIPE_SECRET_KEY),
            }
        )


class CheckoutSerializer(serializers.Serializer):
    plan = serializers.ChoiceField(choices=list(PAID_PLANS))


class CheckoutView(APIView):
    permission_classes = [WorkspaceRolePermission]
    write_role = Role.OWNER

    @extend_schema(request=CheckoutSerializer, responses={200: URL_RESPONSE})
    def post(self, request):
        require_stripe()
        require_verified_email(request.user)
        body = CheckoutSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if request.workspace.plan != "free":
            raise exceptions.ValidationError(
                {"detail": "You already have a subscription. Use Manage billing to change plans."}
            )
        try:
            url = stripe_sync.create_checkout(request.workspace, request.user, body.validated_data["plan"])
        except (LookupError, stripe.StripeError) as exc:
            log.warning("checkout failed: %s", exc)
            raise exceptions.APIException(str(exc))
        return Response({"url": url})


class PortalView(APIView):
    permission_classes = [WorkspaceRolePermission]
    write_role = Role.OWNER

    @extend_schema(request=None, responses={200: URL_RESPONSE})
    def post(self, request):
        require_stripe()
        sub = Subscription.objects.filter(workspace=request.workspace).first()
        if not sub or not sub.stripe_customer_id:
            raise exceptions.ValidationError({"detail": "No billing account yet. Choose a plan first."})
        try:
            return Response({"url": stripe_sync.create_portal(request.workspace)})
        except stripe.StripeError as exc:
            raise exceptions.APIException(str(exc))


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        request=None,
        responses={200: OpenApiResponse(description="Event processed")},
        description="Stripe calls this. The Stripe-Signature header is verified with STRIPE_WEBHOOK_SECRET.",
    )
    def post(self, request):
        try:
            event = stripe.Webhook.construct_event(
                request.body, request.headers.get("Stripe-Signature"), settings.STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.SignatureVerificationError):
            return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                StripeEvent.objects.create(event_id=event["id"], type=event["type"])
                self.handle(event)
        except IntegrityError:
            return Response({"detail": "Already processed."})
        return Response({"received": True})

    def handle(self, event):
        obj = stripe_sync.as_dict(event["data"]["object"])
        kind = event["type"]
        if kind in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            stripe_sync.apply_subscription(obj)
        elif kind == "checkout.session.completed" and obj.get("subscription"):
            sub = stripe.Subscription.retrieve(obj["subscription"], **stripe_sync.client_kwargs())
            stripe_sync.apply_subscription(sub)
        elif kind == "invoice.payment_failed":
            self.payment_failed(obj)

    def payment_failed(self, invoice):
        sub = (
            Subscription.objects.filter(stripe_customer_id=invoice.get("customer")).select_related("workspace").first()
        )
        if not sub:
            return
        owners = Membership.objects.filter(workspace=sub.workspace, role=Role.OWNER).select_related("user")
        send_mail(
            subject=f"[{sub.workspace.name}] Payment failed",
            message="We couldn't charge your card for Sprintboard. Update your payment method from the Billing page.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[m.user.email for m in owners],
            fail_silently=True,
        )
