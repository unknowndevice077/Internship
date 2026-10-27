# API reference

Base URL: `/api`. Send `Authorization: Bearer <token>` on authenticated routes. Errors look like `{ "error": "message", "details": {...} }`.

Roles: **C** customer, **V** vendor, **A** admin, **any** any logged-in user, **public** no login needed.

## Auth

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | `{ name, email, password, role: "customer" \| "vendor" }` → `{ token, user, vendor }` |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user, vendor }` |
| POST | `/auth/logout` | any | deletes the Redis session |
| GET | `/auth/me` | any | current user and vendor profile |
| PATCH | `/auth/me` | any | `{ name?, address? }` |

## Vendors

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/vendors/onboard` | V | `{ storeName, description?, logoUrl? }`, store starts as `pending` |
| GET / PATCH | `/vendors/me` | V | read or edit own store |
| POST | `/vendors/me/payouts` | V | creates a Stripe Express account if needed, returns the onboarding `url` |
| GET | `/vendors/me/payouts` | V | refreshes `payoutsEnabled` from Stripe |
| GET | `/vendors/me/stats` | V | sales totals, orders by status, low stock |
| GET | `/vendors/:slug` | public | storefront for approved stores |

## Products and search

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/products` | public | search, see query params below |
| GET | `/products/mine` | V | own products, including hidden ones |
| GET | `/products/:id` | public | cached in Redis for 5 minutes |
| POST | `/products/images` | V | multipart, field `images`, up to 6 jpg/png/webp files of 5 MB each → `{ urls }` |
| POST | `/products` | V (approved) | `{ title, description, category, brand?, price, stock, images[], tags[] }` |
| PATCH | `/products/:id` | V (owner) | any product field |
| DELETE | `/products/:id` | V (owner) | soft delete |

Search parameters for `GET /products`:

| Param | Example | Notes |
| --- | --- | --- |
| `q` | `wireless earbuds` | full-text over title, brand, tags and description, fuzzy on Elasticsearch |
| `category`, `brand`, `vendor` | `laptops` | exact match |
| `minPrice`, `maxPrice` | `100` | |
| `minRating` | `4` | |
| `inStock` | `true` | |
| `sort` | `price_asc`, `price_desc`, `rating`, `newest` | default is relevance with `q`, newest without |
| `page`, `limit` | `2`, `24` | `limit` max 60 |

Response: `{ engine, total, page, limit, items[], facets: { categories[], brands[] } }`.

## Reviews

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/products/:id/reviews` | public | latest 50 |
| POST | `/products/:id/reviews` | C | `{ rating, title?, body? }`, posting again updates your review |
| DELETE | `/products/:id/reviews/:reviewId` | author or A | |

## Cart (customers)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/cart` | `{ items[], subtotal, count }`, each item has `available` |
| POST | `/cart/items` | `{ productId, quantity }`, adds to the current quantity |
| PUT | `/cart/items/:productId` | `{ quantity }`, sets it exactly, 0 removes |
| DELETE | `/cart/items/:productId` | |
| DELETE | `/cart` | empty the cart |

## Orders

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/orders/checkout` | C | `{ shippingAddress, couponCode? }` → `{ paymentGroup, amount, provider, clientSecret, orders[] }` |
| POST | `/orders/confirm/:paymentGroup` | C | after Stripe confirms the payment (or right away in mock mode), safe to repeat |
| GET | `/orders` | any | customers see their own, vendors their store's, admins all. `?status=` filter |
| GET | `/orders/:id` | owner, store or A | |
| PATCH | `/orders/:id/status` | V | `{ status: "packed" \| "shipped" \| "delivered" \| "cancelled" }` |
| POST | `/orders/:id/cancel` | C | only while `placed` |
| GET | `/orders/:id/invoice` | owner, store or A | `application/pdf` |

## Coupons

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/coupons/validate` | C | `{ code }` → `{ code, discount, total }` for the current cart |
| GET | `/coupons` | V, A | vendors see their store's coupons, admins see all |
| POST | `/coupons` | V, A | `{ code, type: "percent" \| "fixed", value, minOrder?, maxUses?, expiresAt? }` |
| PATCH / DELETE | `/coupons/:id` | V, A | |

## Admin

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/analytics?days=30` | totals, daily series, top vendors and products, orders by status |
| GET | `/admin/vendors?status=pending` | |
| PATCH | `/admin/vendors/:id` | `{ status?, commissionRate? }`, a status change re-syncs the store's products in search |
| GET | `/admin/users?role=customer` | |
| PATCH | `/admin/users/:id` | `{ isActive }` |
| POST | `/admin/search/reindex` | rebuilds the Elasticsearch index from MongoDB |

## Other

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | status of Mongo and Redis, which search engine and payment provider are active |
| POST | `/webhooks/stripe` | Stripe signature checked. Handles `payment_intent.succeeded` and `account.updated` |
