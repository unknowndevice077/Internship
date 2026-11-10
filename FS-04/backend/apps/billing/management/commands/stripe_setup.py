import stripe
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.billing.plans import PAID_PLANS


class Command(BaseCommand):
    help = "Create the Sprintboard products and monthly prices in your Stripe account (safe to re-run)."

    def handle(self, *args, **options):
        key = settings.STRIPE_SECRET_KEY
        if not key:
            raise CommandError("Set STRIPE_SECRET_KEY first.")
        if not key.startswith("sk_test_"):
            raise CommandError("Refusing to run against a live key. Use a test-mode key (sk_test_...).")

        for plan in PAID_PLANS.values():
            existing = stripe.Price.list(lookup_keys=[plan.lookup_key], limit=1, api_key=key)
            if existing.data:
                self.stdout.write(f"{plan.name}: price {existing.data[0].id} already exists")
                continue
            product = stripe.Product.create(name=f"Sprintboard {plan.name}", metadata={"plan": plan.code}, api_key=key)
            price = stripe.Price.create(
                product=product.id,
                currency="usd",
                unit_amount=plan.price_usd * 100,
                recurring={"interval": "month"},
                lookup_key=plan.lookup_key,
                api_key=key,
            )
            self.stdout.write(self.style.SUCCESS(f"{plan.name}: created price {price.id}"))
