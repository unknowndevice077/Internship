from django.urls import path

from . import views

urlpatterns = [
    path("billing/", views.BillingView.as_view(), name="billing"),
    path("billing/checkout/", views.CheckoutView.as_view(), name="billing-checkout"),
    path("billing/portal/", views.PortalView.as_view(), name="billing-portal"),
    path("billing/webhook/", views.StripeWebhookView.as_view(), name="stripe-webhook"),
]
