# Handoff

Where the project stands and how to pick it up.

## Status

| Brief step | Status |
| --- | --- |
| 1. Roles, schema, API list | Done: [ARCHITECTURE.md](ARCHITECTURE.md), [API.md](API.md) |
| 2. JWT auth and role-based access | Done |
| 3. Vendor onboarding, product CRUD, S3 upload | Done. Tested with local storage. S3 path covered by code, not yet run against a real bucket |
| 4. Elasticsearch search, filters, sorting | Done, verified on Elasticsearch 8.15 |
| 5. Cart, checkout, order lifecycle, Redis | Done, verified on Redis 7 |
| 6. Stripe Connect split payments | Done. Verified with SDK-level tests, mock mode, and a real Stripe test mode run (charge, vendor transfer, partial refund) |
| 7. Reviews, coupons, PDF invoices, admin analytics, separate deploys | Done. Web on Vercel, API on Render with MongoDB Atlas and Upstash Redis |

Also done beyond the brief: stock held during checkout, automatic retries for failed vendor payouts, partial refunds, per-store shipping, order and account emails, password reset and email verification, wishlist and recently viewed, vendor order filters and CSV export, partial-word search without Elasticsearch, Swagger docs, structured logs with request ids, optional Sentry, a TypeScript front end, dark mode, keyboard and screen reader support, and a phone layout for the filters.

Verified: 94 API tests (97% line, 81% branch coverage), 32 browser end-to-end tests covering every flow, strict type check, clean lint and formatting, plus a crawl of every page and button on the live site and a layout check in light and dark mode. Details are in [TEST_RESULTS.md](TEST_RESULTS.md).

Live: https://vendora-kappa-nine.vercel.app. A narrated walkthrough is in [WALKTHROUGH.md](WALKTHROUGH.md), and the reflection is in [REFLECTION.md](REFLECTION.md).

## Getting started

```bash
git clone https://github.com/unknowndevice077/vendora.git
cd vendora
docker compose up -d mongo redis elasticsearch
cd server && cp .env.example .env && npm install && npm run seed && npm run dev
# second terminal
cd client && npm install && npm run dev
```

Open http://localhost:5173 and use the demo login buttons (password `demo-pass-123`). With no Docker, run `npm run dev:memory` in `server/` instead of the compose and seed steps.

## Environment variables

**server/.env**

| Variable | Required in prod | Notes |
| --- | --- | --- |
| `MONGO_URI` | yes | MongoDB Atlas connection string |
| `JWT_SECRET` | yes | long random string. The server refuses to start in production without one |
| `CLIENT_URL` | yes | front-end origin(s) for CORS, comma separated |
| `REDIS_URL` | yes | e.g. Upstash `rediss://...`. Empty uses an in-memory mock (dev only) |
| `ELASTICSEARCH_URL` | recommended | Elastic Cloud or Bonsai url (include credentials). Empty uses MongoDB search. Use an 8.x cluster to match the pinned client |
| `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | yes | empty saves images to `./uploads`, which is lost on Render redeploys |
| `S3_PUBLIC_URL` | no | CloudFront domain, if used |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | yes | `sk_test_...` and `whsec_...`. Empty uses mock payments |
| `COMMISSION_RATE` | no | default 0.10 |
| `SMTP_URL`, `MAIL_FROM` | recommended | e.g. Resend or Brevo SMTP. Empty logs emails instead of sending them, so password reset won't work for real users |
| `SENTRY_DSN` | no | turns on error tracking |
| `LOG_LEVEL` | no | default `info` |

**client/.env.local** (or Vercel project settings)

| Variable | Notes |
| --- | --- |
| `VITE_API_URL` | deployed API url, e.g. `https://vendora-api.onrender.com`. Empty in dev |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` |
| `VITE_SENTRY_DSN` | optional, browser error tracking |

## What the live site runs without

Everything in the brief is deployed, but three services are switched off on the free hosting. Each one has a working fallback, and turning it on is only environment variables:

1. **Elasticsearch:** the live API uses the MongoDB search fallback (`/api/health` shows `search: mongo-fallback`). Point `ELASTICSEARCH_URL` at an Elastic Cloud deployment and call `POST /api/admin/search/reindex` once.
2. **S3:** product photos come from the seed data's image URLs, and an image a vendor uploads is saved on the API's disk, which Render wipes on redeploy. Set `S3_BUCKET` and the AWS keys, and allow public read on `vendors/*`.
3. **SMTP:** emails are written to the server log instead of sent. Set `SMTP_URL` and `MAIL_FROM` (a free Resend or Brevo account works).

The free Render API also sleeps after 15 minutes idle. A scheduled ping in the Internship repo keeps it awake from 8am to 8pm Philippine time.

## Good next features

- Shipping rates by weight and destination
- A returns flow (customer requests, vendor approves) on top of the existing partial refunds
- Move the background jobs to a separate worker (BullMQ) if traffic grows
- Search autocomplete with an Elasticsearch completion suggester
- Two-factor login for vendors and admins

## Gotchas

- `@elastic/elasticsearch` is pinned to 8.x. The 9.x client rejects 8.x servers.
- Search results can lag a write by about a second (index refresh). Product pages read from MongoDB and are always current.
- If Elasticsearch was down while products changed, run `POST /api/admin/search/reindex` as an admin.
- The jobs runner (stock holds, payout retries) lives in the API process and uses a Redis lock, so it's safe with more than one instance.
- Stock is taken at checkout, not at payment. An unpaid checkout holds stock for 15 minutes.
- `ioredis-mock` is a dev dependency and only loads when `REDIS_URL` is empty, so production must set `REDIS_URL`.
