# Test and performance results

Measured on 27 Oct 2026, Windows 11, Node 22.14.

## Automated tests

`cd server && npm run test:coverage`

```
Test Files  6 passed (6)
     Tests  42 passed (42)
```

| File | What it covers |
| --- | --- |
| `auth.test.js` | register, login, duplicate email, no admin signup, logout revokes the token, role guards |
| `vendor-products.test.js` | onboarding and approval, mock payouts, product ownership, validation, image upload, Redis product cache, Mongo search filters and sorting, hiding unapproved stores |
| `checkout.test.js` | cart add/update/remove, stock limit, multi-vendor checkout and commission split, confirming twice, platform and store coupons, expired coupons, lifecycle order, other vendors blocked, cancel restocks, PDF invoice |
| `reviews-admin.test.js` | rating average, verified purchase, review upsert, analytics totals, coupon limits |
| `integrations.test.js` | Stripe Connect onboarding, PaymentIntent amount and transfer group, webhook-driven split transfers with per-vendor commission, refunds, `account.updated`, bad signatures, Elasticsearch indexing, query building, suspended store removal, bulk reindex |
| `vendor-admin-flows.test.js` | vendor stats, storefront visibility, vendor data isolation, coupon preview, admin vendor and user management, health check, profile address |

Stripe and Elasticsearch are mocked at the SDK level, so the tests check the exact requests the API sends to them without needing network access or accounts.

### Coverage

| | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| All files | 88.5% | 72.3% | 92.3% | 93.9% |

## Manual end-to-end check

Run against the seeded demo (`npm run dev:memory` plus the client):

1. Customer adds 2 × Samsung Galaxy Tab White ($349.99, Gadget Hub) and 1 × a $24.99 item from another store.
2. `WELCOME10` preview: subtotal $724.97, discount $72.50, total $652.47.
3. Checkout creates two orders sharing one payment group. The discount is split $70.00 / $2.50 by subtotal.
4. Commission at 10%: Gadget Hub order $629.98 → commission $63.00, payout $566.98. Other order $22.49 → $2.25 / $20.24.
5. Vendor moves the order placed → packed → shipped → delivered. The timeline shows each step with a date.
6. Customer's review on the delivered product is marked as a verified purchase.
7. Invoice PDF downloads (200, `application/pdf`).
8. The admin analytics page shows the new order in GMV and commission.

## Performance

[autocannon](https://github.com/mcollina/autocannon), 20 connections for 8 seconds, API and in-memory MongoDB on the same machine, 194 seeded products.

| Endpoint | p50 | p97.5 | avg | req/s |
| --- | --- | --- | --- | --- |
| `GET /products/:id` (Redis cache hit) | 6 ms | 40 ms | 8.3 ms | ~2,260 |
| `GET /products?category=smartphones&sort=price_asc` (Mongo fallback) | 51 ms | 94 ms | 55 ms | ~360 |
| `GET /products?q=lipstick` (Mongo text search) | 40 ms | 55 ms | 41 ms | ~480 |

Search on the fallback runs three queries per request (results, count and two facet aggregations), which is the main cost. Elasticsearch does the same in one request with aggregations. Elasticsearch numbers aren't included because Docker wasn't available on the test machine. Run `docker compose up -d elasticsearch`, `npm run seed` and the same autocannon command to add them.

## Known limits

- The Mongo fallback search doesn't do fuzzy or partial-word matching (`phone` doesn't match `iPhone`). Elasticsearch does.
- Stock is checked at checkout and taken at payment. If an item sells out in between, that vendor's order is cancelled and refunded automatically, but the customer sees it as cancelled rather than getting a warning first.
- Failed Stripe transfers are logged and the order keeps going. There is no retry queue yet.
