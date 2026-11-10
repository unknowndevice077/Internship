# Stripe test mode setup

Sprintboard bills through Stripe Checkout and the customer portal. Everything below uses Stripe's test mode, so no
real money moves. Without a key the app runs on the Free plan and the Billing page says upgrades are off.

## What you need

- A Stripe account (free; test mode needs no business details)
- The [Stripe CLI](https://docs.stripe.com/stripe-cli) for forwarding webhooks to your machine
- Sprintboard running locally with the worker (see the README)

## 1. Get a test key

In the Stripe dashboard, switch on **Test mode** (top right), open **Developers > API keys** and copy the secret
key. It starts with `sk_test_`. Put it in `backend/.env`:

```
STRIPE_SECRET_KEY=sk_test_...
FRONTEND_URL=http://localhost:5173
```

`FRONTEND_URL` is where Stripe sends people back to after checkout, so set it to wherever the frontend is served
(`http://localhost:8088` for the Docker stack).

## 2. Create the plans

```bash
cd backend
python manage.py stripe_setup
```

This creates a product and monthly price for Pro ($29) and Business ($99), keyed by lookup keys the app finds
later. It's safe to run again and refuses anything but a `sk_test_` key.

## 3. Forward webhooks

The plan only changes when Stripe's webhook arrives, so this step is what makes upgrades work locally.

```bash
stripe login
stripe listen --forward-to localhost:8000/api/billing/webhook/
```

Leave it running. It prints a signing secret starting with `whsec_`; add it to `backend/.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Use port 8000 for `runserver`, or 8088 for the Docker stack (`localhost:8088/api/billing/webhook/`).

## 4. Save the customer portal settings

In the dashboard (test mode) open **Settings > Billing > Customer portal** and save the defaults once. Until then
"Manage billing" returns an error from Stripe.

## 5. Restart and try it

Restart Django and the Celery worker so they read the new variables, then:

1. Sign in as `owner@initech.test` / `demo-pass-123`. Initech is on the Free plan, which allows three projects.
2. Create a fourth project. The API answers 402 and the page offers an upgrade.
3. Open **Billing** and choose **Pro**. You land on Stripe Checkout.
4. Pay with `4242 4242 4242 4242`, any future expiry, any CVC and postal code.
5. After the redirect, the terminal running `stripe listen` shows `checkout.session.completed` and
   `customer.subscription.created` with `200` responses, and the Billing page shows Pro.
6. Use **Manage billing** to cancel. The webhook `customer.subscription.deleted` drops the workspace back to Free.

Only workspace owners with a confirmed email address can start checkout.

## Test cards

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0000 0000 0002` | declined |
| `4000 0025 0000 3155` | asks for 3D Secure authentication |

## How it works

- Checkout and the portal are Stripe-hosted pages. The API only creates the sessions and returns their URLs.
- Webhooks are verified with `STRIPE_WEBHOOK_SECRET`. Each event id is stored with a unique constraint, so a
  redelivered event is processed once.
- Handled events: `checkout.session.completed`, `customer.subscription.created`, `.updated` and `.deleted`.
- Plan limits (projects, members, storage, webhooks) are enforced by the API from the workspace's current plan.
- Deleting a workspace cancels its subscription in Stripe.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Billing page says upgrades are disabled | `STRIPE_SECRET_KEY` missing, or the API wasn't restarted |
| "No active Stripe price" on upgrade | `stripe_setup` hasn't been run for this Stripe account |
| Paid, but the plan stays Free | `stripe listen` isn't running, or `STRIPE_WEBHOOK_SECRET` doesn't match the one it printed |
| Webhook returns 400 | the signing secret changed after restarting `stripe listen`; copy the new one |
| 403 `email_unverified` on upgrade | confirm the email address from the link in the verification email |
| "Manage billing" fails | the customer portal settings haven't been saved (step 4) |
