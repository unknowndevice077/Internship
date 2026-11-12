# Vendora

A multi-vendor marketplace I built for my Nexvia internship (project FS-01). Think a small Amazon: lots of sellers each run their own store, a customer can fill one cart from several of them and pay once, and the platform splits that payment so every seller gets their share minus a commission.

The hardest part was the money side. One checkout has to become one order per seller, coupons have to be split fairly between them, and payment confirmation has to be safe to run twice (Stripe's webhook and the browser can both confirm the same payment). Most of my time went into getting that right and testing it.

**Built with:** React (Vite, TypeScript), Node.js + Express, MongoDB, Elasticsearch, Redis, Stripe Connect (test mode), AWS S3

![The shop home page](docs/screenshots/home.png)

| Product page                                  | Cart                               |
| --------------------------------------------- | ---------------------------------- |
| ![Product page](docs/screenshots/product.png) | ![Cart](docs/screenshots/cart.png) |

| Seller hub                                     | Admin analytics                                |
| ---------------------------------------------- | ---------------------------------------------- |
| ![Seller hub](docs/screenshots/seller-hub.png) | ![Admin analytics](docs/screenshots/admin.png) |

There's a dark mode too ([screenshot](docs/screenshots/home-dark.png)), and an [order page](docs/screenshots/order.png) with a status timeline. The screenshots come from `node client/scripts/screenshots.js`, so they're easy to redo after a UI change.

## Features

**Customers** can search with typo tolerance and live suggestions, filter by category, price, rating and stock, save products for later, see what they recently viewed, add items from different stores to one cart, apply coupons, check out, follow each order's status, download a PDF invoice, cancel before it ships, and leave reviews (marked "verified purchase" once the order is delivered). They get emails when an order is placed and when it ships, and can reset a forgotten password.

**Vendors** sign up, open a store, and wait for an admin to approve it. After that they connect a Stripe Express account for payouts, set their shipping rate, list products with up to 6 images, run their own coupons, and move orders through `placed → packed → shipped → delivered`. They can refund single items, filter their orders and export them to CSV. Each order shows exactly what they'll be paid.

**Admins** approve or suspend stores, set commission per store (10% by default), manage users and platform coupons, watch vendor payouts (and retry failed ones), and get an analytics page with GMV, commission, refunds, average order value, daily sales and top sellers.

Some details under the hood:

- Logins use JWTs, but every token is tied to a session in Redis, so logging out (or an admin disabling someone) kills it immediately instead of waiting for it to expire.
- The cart lives in Redis. Prices are always re-read from the database, so a stale cart can't check out at an old price.
- Product pages are cached in Redis for 5 minutes and cleared on edit.
- Search runs on Elasticsearch when it's available and falls back to MongoDB text search when it isn't, so the app still works without it.
- Payments use Stripe's "separate charges and transfers": the customer is charged once, then each vendor gets a transfer for their order. If a transfer fails it's retried automatically with backoff. Without a Stripe key there's a mock provider, so the whole flow works offline.
- Stock is held for 15 minutes from checkout, so nobody pays for something that sold out while they were typing their card number. A small job runner (with a Redis lock so only one server runs it) releases holds that expire.
- Refunding part of an order also takes back the vendor's share of that part from their payout, with a Stripe transfer reversal.
- The UI has small animations where they help (the product photo flies to the cart, numbers count up on the dashboards, sections fade in as you scroll), and all of it switches off for people who set "reduce motion".
- The front end is TypeScript (strict), has a dark mode, and works with a keyboard and screen reader (labelled fields, a proper combobox for search suggestions, skip link, focus rings).

## Architecture

```mermaid
flowchart LR
    W[React app] -- REST + JWT --> R[Express API]
    W -- Stripe.js --> S[(Stripe)]
    R --> M[(MongoDB)]
    R --> RD[(Redis<br/>sessions, carts, cache)]
    R --> ES[(Elasticsearch<br/>product index)]
    R --> S3[(AWS S3<br/>product images)]
    R -- charge, transfers, refunds --> S
    S -- webhooks --> R
```

MongoDB is the source of truth. Elasticsearch holds a copy of each product for search, Redis holds sessions, carts and cached product pages, and S3 holds product images. The front end and the API are deployed separately. The database schema, the roles and the checkout sequence diagram are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deliverables

| What the brief asks for | Where it is |
| --- | --- |
| Working demo | Run it locally with the steps below, no accounts needed. Deploy steps are in [docs/DEPLOY.md](docs/DEPLOY.md) |
| README and setup instructions | This file |
| Architecture diagram, data and API docs | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API.md](docs/API.md), Swagger UI at `/api/docs` |
| Test results and performance numbers | [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md): 94 API tests, 32 browser tests, latency with and without Elasticsearch |
| Screenshots | [docs/screenshots](docs/screenshots) |
| Final presentation | [docs/PRESENTATION.md](docs/PRESENTATION.md) |
| Reflection | [docs/REFLECTION.md](docs/REFLECTION.md) |

## Trying it

Payments run in Stripe **test mode**, so nothing is really charged. Pay with card `4242 4242 4242 4242`, any future
date and any CVC. The password for every demo account is `demo-pass-123`, and the login page has one-click buttons
for each.

The live API is on Render's free plan, so the first request after a quiet spell can take about 30 seconds to wake it.

1. **As a customer** (`customer@vendora.test`): search (typos work, try "lipstik"), add items from two different
   stores, apply coupon `WELCOME10`, and pay with the test card. You get one order per store, each with its own
   tracking and PDF invoice.
2. **As the seller** (`vendor@vendora.test`, Glow Beauty Co): open **Orders**, move your order to packed, shipped and
   delivered, or refund one item. **Payouts** shows what the store was paid after commission.
3. **As the admin** (`admin@vendora.test`): **Analytics** shows sales, commission and top sellers, and **Payouts**
   shows every transfer to the stores. Approve the pending store under **Vendors**.
4. Back as the customer, review the delivered product. It's marked "verified purchase".

To see the payment split in Stripe itself, the test-mode dashboard shows one charge for the customer and a separate
transfer to the store's connected account, minus the 10% commission.

## Running it

You need Node 20+. Docker is optional.

**Quickest (no Docker):**

```bash
cd server
npm install
npm run dev:memory
```

That starts an in-memory MongoDB, seeds it with demo data and runs the API on port 4000. Redis gets swapped for an in-memory mock and search uses MongoDB. Then in another terminal:

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173.

**Full stack with Docker** (real Mongo, Redis and Elasticsearch):

```bash
docker compose up -d mongo redis elasticsearch
cd server
cp .env.example .env
npm install
npm run seed
npm run dev
```

Then start the client the same way (`cp .env.example .env.local` first). `docker compose --profile full up --build` runs everything in containers instead (web on :8090, API on :4000).

The seed loads 194 products from a saved [DummyJSON](https://dummyjson.com) snapshot, spread across 5 stores, plus about 70 past orders so the charts aren't empty. `npm run seed -- --fresh` pulls the products live instead.

### Demo logins

Password for all of them: `demo-pass-123`. The login page also has quick-login buttons.

- Customer: `customer@vendora.test`
- Vendor (Glow Beauty Co): `vendor@vendora.test`
- Admin: `admin@vendora.test`

Coupons to try: `WELCOME10` (10% off over $20), `FLAT5` ($5 off over $30), `GLOW15` (15% off, Glow Beauty Co only).

### Using real Stripe test mode

1. In the Stripe dashboard (test mode) go to **Settings → Connect → Platform profile** and acknowledge **Refunds and chargebacks liability**. Vendor accounts are created with the Accounts v2 API as "recipients" (they only get transfers), and those need the platform to cover losses.
2. Put your `sk_test_...` key in `server/.env` as `STRIPE_SECRET_KEY`, and the `pk_test_...` key in `client/.env.local` as `VITE_STRIPE_PUBLISHABLE_KEY`.
3. Run `stripe listen --events payment_intent.succeeded,account.updated --forward-to localhost:4000/api/webhooks/stripe` and copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`. The CLI has to be on the same Stripe account as the secret key (`stripe login`, or set `STRIPE_API_KEY` to the same key), otherwise the webhooks never arrive.
4. Log in as a vendor, go to **Payouts** and finish Stripe's onboarding. Until a vendor finishes it, transfers to them fail and wait in the retry queue.
5. Pay with `4242 4242 4242 4242`, any future date, any CVC.

### Using S3 for images

Set `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The bucket needs public read on `vendors/` (or put CloudFront in front and set `S3_PUBLIC_URL`). Without these, uploads go to `server/uploads/`.

## Tests

```bash
cd server
npm test              # API tests on an in-memory MongoDB
npm run test:coverage

cd ../client
npm run test:e2e      # Playwright, starts its own API and web server
```

The API tests cover auth, products, search, checkout and commission math, shipping, stock holds, payout retries, refunds, coupons, the order lifecycle, emails, reviews and admin. Stripe and Elasticsearch are mocked at the SDK level, so the tests check the exact calls the API makes to them. The Playwright tests click through the app in Chrome, including one long test that walks a new seller from sign-up to their first delivered order and payout.

Both suites, plus lint, format and type checks, run on every push in GitHub Actions. The end-to-end tests caught a handful of real bugs along the way. Those, and the performance numbers, are in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Deploying

The front end and back end deploy separately:

- **API → Render** using [render.yaml](render.yaml). It needs MongoDB Atlas, a Redis instance (Upstash works), Elastic Cloud or Bonsai (optional) and an S3 bucket.
- **Web → Vercel** with `client/` as the root directory and `VITE_API_URL` set to the API's URL. [client/vercel.json](client/vercel.json) handles client-side routes.
- In the Stripe dashboard, add `https://<your-api>/api/webhooks/stripe` as a webhook for `payment_intent.succeeded` and `account.updated`.

## Where things are

```
server/src/
  models/       Mongoose schemas
  routes/       one router per resource
  lib/          orders, payments, search, cart, coupons, storage, invoices
  middleware/   auth and error handling
server/scripts/ seed and the in-memory dev runner
client/src/
  pages/        storefront, checkout, vendor hub, admin
  components/   layout, search box, shared UI
  context/      auth and cart state
client/e2e/     Playwright tests
docs/           architecture, API reference, test results, handoff notes
```

More detail: [architecture and schema](docs/ARCHITECTURE.md) · [API reference](docs/API.md) · [test results](docs/TEST_RESULTS.md) · [handoff notes](docs/HANDOFF.md). With the API running, Swagger UI is at http://localhost:4000/api/docs.

### Emails and error tracking

Set `SMTP_URL` (any SMTP provider, e.g. `smtp://user:pass@smtp.resend.com:587`) and `MAIL_FROM` to send real emails. Without them, emails are written to the server log, which is handy for grabbing a password reset link locally. Set `SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (web) to turn on Sentry.

## What I'd add next

- Shipping rates by weight and destination instead of a flat rate per store
- A returns flow where the customer asks and the vendor approves
- Moving the background jobs to their own worker if traffic grows
