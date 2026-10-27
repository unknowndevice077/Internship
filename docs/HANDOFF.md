# Handoff

Where the project stands, how to pick it up, and what's left before the 20 Nov 2026 deadline.

## Status

| Brief step | Status |
| --- | --- |
| 1. Roles, schema, API list | Done: [ARCHITECTURE.md](ARCHITECTURE.md), [API.md](API.md) |
| 2. JWT auth and role-based access | Done |
| 3. Vendor onboarding, product CRUD, S3 upload | Done. Tested with local storage. S3 path covered by code, not yet run against a real bucket |
| 4. Elasticsearch search, filters, sorting | Done, verified on Elasticsearch 8.15 |
| 5. Cart, checkout, order lifecycle, Redis | Done, verified on Redis 7 |
| 6. Stripe Connect split payments | Done. Verified with SDK-level tests and mock mode. Not yet run with real test keys |
| 7. Reviews, coupons, PDF invoices, admin analytics, separate deploys | Done. Deploy config ready, not deployed yet |

Verified: 43 automated tests (94% line coverage), a fresh clone installs, tests, lints and builds, both Docker images build, and the full stack runs in containers. Details are in [TEST_RESULTS.md](TEST_RESULTS.md).

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

**client/.env.local** (or Vercel project settings)

| Variable | Notes |
| --- | --- |
| `VITE_API_URL` | deployed API url, e.g. `https://vendora-api.onrender.com`. Empty in dev |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` |

## Still to do

1. **Stripe test keys:** follow the README section. Do one purchase with card 4242 and check the transfers in the Stripe dashboard under Connect.
2. **S3 bucket:** create it, allow public read on `vendors/*`, and upload a product image from the vendor hub.
3. **Deploy:** the API on Render (`render.yaml`) with Atlas, Upstash and Elastic Cloud, and the web on Vercel (root `client/`). Then run `npm run seed` once against the production database, or `POST /api/admin/search/reindex` if you add data another way.
4. **Stripe webhook** in the dashboard pointing at `https://<api>/api/webhooks/stripe` for `payment_intent.succeeded` and `account.updated`.
5. **Demo recording**, using the demo script in [PRESENTATION.md](PRESENTATION.md).
6. **Slides** from the PRESENTATION.md outline.
7. **Reflection:** write [REFLECTION.md](REFLECTION.md).
8. Check that the first GitHub Actions run passes.

## Good next features

- Retry queue for failed Stripe transfers (they're logged today)
- Partial refunds per item, and returns
- Shipping rates per vendor
- Email notifications on status changes
- Search autocomplete with an Elasticsearch completion suggester

## Gotchas

- `@elastic/elasticsearch` is pinned to 8.x. The 9.x client rejects 8.x servers.
- Search results can lag a write by about a second (index refresh). Product pages read from MongoDB and are always current.
- If Elasticsearch was down while products changed, run `POST /api/admin/search/reindex` as an admin.
- `ioredis-mock` is a dev dependency and only loads when `REDIS_URL` is empty, so production must set `REDIS_URL`.
