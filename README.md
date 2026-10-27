# Vendora

A multi-vendor marketplace in the style of Amazon. Many vendors sell, customers buy from several stores in one checkout, and the platform splits each payment between the vendors and keeps a commission.

**Stack:** React (Vite) · Node.js/Express · MongoDB · Elasticsearch · Redis · Stripe Connect (test mode) · AWS S3

## Features

| Area | What it does |
| --- | --- |
| Roles | `customer`, `vendor`, `admin`, with JWT auth and role checks on every route. Sessions live in Redis, so logging out revokes the token right away |
| Vendor onboarding | Vendors create a store, an admin approves it, then the vendor connects a Stripe Express account to get paid |
| Products | Full CRUD, up to 6 images per product uploaded to S3 (or `./uploads` locally), soft delete |
| Search | Elasticsearch full-text search with fuzzy matching, filters (category, brand, price, rating, stock), sorting and facet counts. Falls back to MongoDB text search when no ES is configured |
| Cart | Stored in Redis hashes with a 30-day TTL. Prices are always read from the database |
| Checkout | One payment covers the whole cart, split into one order per vendor |
| Order lifecycle | `placed → packed → shipped → delivered`. Customers can cancel before packing, vendors before shipping, and cancelling refunds and restocks |
| Split payments | Stripe Connect "separate charges and transfers". Each vendor gets a transfer for their order total minus commission (10% default, can be set per vendor) |
| Reviews | One per customer per product, "verified purchase" badge once the order is delivered, keeps the product rating up to date |
| Coupons | Percent or fixed, minimum order, usage limit, expiry. Platform-wide (admin) or for one store (vendor) |
| Invoices | PDF invoice per order, generated on request with PDFKit |
| Admin analytics | GMV, commission, payouts, AOV, daily sales chart, top vendors and products, orders by status |

## Running it locally

You need Node 20+ and either Docker or nothing else at all (see the in-memory option).

### Option A: with Docker (full stack: Mongo, Redis, Elasticsearch)

```bash
docker compose up -d mongo redis elasticsearch

cd server
cp .env.example .env
npm install
npm run seed       # demo data from DummyJSON, also builds the search index
npm run dev        # API on http://localhost:4000

cd ../client
cp .env.example .env.local
npm install
npm run dev        # web on http://localhost:5173
```

### Option B: no Docker

```bash
cd server && npm install && npm run dev:memory
```

This starts a throwaway in-memory MongoDB, seeds it and runs the API. With `REDIS_URL` and `ELASTICSEARCH_URL` left empty, Redis is replaced by an in-memory mock and search uses MongoDB. Then start the client as above.

### Demo accounts

All passwords are `demo-pass-123`. The login page also has one-click buttons for these.

| Role | Email |
| --- | --- |
| Customer | customer@vendora.test |
| Vendor (Glow Beauty Co) | vendor@vendora.test |
| Admin | admin@vendora.test |

Coupons from the seed: `WELCOME10` (10% off over $20), `FLAT5` ($5 off over $30), `GLOW15` (15% off Glow Beauty Co only).

### Turning on real Stripe test mode

Without a Stripe key the API uses a mock payment provider, so the full flow works offline. To use Stripe Connect:

1. Put your `sk_test_...` key in `server/.env` as `STRIPE_SECRET_KEY` and the `pk_test_...` key in `client/.env.local` as `VITE_STRIPE_PUBLISHABLE_KEY`.
2. Forward webhooks: `stripe listen --forward-to localhost:4000/api/webhooks/stripe`, and copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.
3. Log in as a vendor, open **Payouts** and finish Stripe's Express onboarding.
4. Pay with card `4242 4242 4242 4242`, any future date and any CVC.

### S3 uploads

Set `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The bucket needs public read on the `vendors/` prefix (or put CloudFront in front of it and set `S3_PUBLIC_URL`).

## Tests

```bash
cd server
npm test               # 43 API tests against an in-memory MongoDB
npm run test:coverage
```

Stripe and Elasticsearch are mocked at the SDK level in `tests/integrations.test.js`, so the real code paths for both are covered without network access. Results are in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Deployment

The front end and back end deploy separately:

- **API:** Render, using [render.yaml](render.yaml). It needs MongoDB Atlas, a Redis instance (Upstash or Render Redis), Elastic Cloud (or Bonsai) and an S3 bucket.
- **Web:** Vercel with `client/` as the root directory. Set `VITE_API_URL` to the API url. [client/vercel.json](client/vercel.json) handles the SPA routes.
- After deploying, add `https://<api>/api/webhooks/stripe` as a webhook endpoint in the Stripe dashboard for `payment_intent.succeeded` and `account.updated`.

`docker compose --profile full up --build` runs the whole thing in containers (web on :8090, API on :4000).

## Project layout

```
server/
  src/
    models/       Mongoose schemas
    routes/       Express routers, one per resource
    lib/          search, payments, cart, orders, coupons, storage, invoice
    middleware/   auth (JWT + Redis session) and error handling
  scripts/        seed and in-memory dev runner
  tests/
client/
  src/
    pages/        storefront, checkout, vendor hub, admin
    context/      auth and cart state
    api/          fetch wrapper
docs/             architecture, API reference, test results
```

## Docs

- [Architecture and database schema](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Test and performance results](docs/TEST_RESULTS.md)
