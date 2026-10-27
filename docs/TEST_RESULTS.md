# Test and performance results

Measured on 27 Oct 2026, Windows 11, Node 22.14.

## Automated tests

`cd server && npm run test:coverage`

```
Test Files  6 passed (6)
     Tests  43 passed (43)
```

| File | What it covers |
| --- | --- |
| `auth.test.js` | register, login, duplicate email, no admin signup, logout revokes the token, role guards |
| `vendor-products.test.js` | onboarding and approval, mock payouts, product ownership, validation, image upload, Redis product cache, Mongo search filters and sorting, hiding unapproved stores |
| `checkout.test.js` | cart add/update/remove, stock limit, multi-vendor checkout and commission split, confirming twice, platform and store coupons, expired coupons, lifecycle order, other vendors blocked, cancel restocks, PDF invoice |
| `reviews-admin.test.js` | rating average, verified purchase, review upsert, analytics totals, coupon limits |
| `integrations.test.js` | Stripe Connect onboarding, PaymentIntent amount and transfer group, webhook-driven split transfers with per-vendor commission, refunds, `account.updated`, bad signatures, Elasticsearch indexing, query building, stock sync after purchase, suspended store removal, bulk reindex |
| `vendor-admin-flows.test.js` | vendor stats, storefront visibility, vendor data isolation, coupon preview, admin vendor and user management, health check, profile address |

Stripe and Elasticsearch are mocked at the SDK level, so the tests check the exact requests the API sends to them without needing network access or accounts.

### Coverage

| | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| All files | 88.4% | 70.5% | 92.3% | 94.0% |

`npm audit --omit=dev`: 0 vulnerabilities.

## Against the real services

`docker compose up -d mongo redis elasticsearch` (MongoDB 7, Redis 7, Elasticsearch 8.15.3), then `npm run seed`: 194 products, 6 stores, 70 orders, 194 documents indexed.

| Check | Result |
| --- | --- |
| `/api/health` | mongo up, redis up, search `elasticsearch` |
| Typo search `q=iphon`, `q=lipstik` | finds the iPhones and Red Lipstick (fuzzy matching) |
| `category=laptops&sort=price_desc` | MacBook Pro $1999.99 first |
| `minRating=4.5&maxPrice=20` | 12 results, all within the filters |
| Purchase → search stock | stock in Elasticsearch matches MongoDB (89) about a second after payment (the index refresh interval) |
| New review → search rating | `ratingAvg` updates in the index |
| Suspend a store → search | its products drop out of results, and come back when re-approved |
| Logout → `/auth/me` | 401, the Redis session is gone |

Testing against the real index found two bugs the mocks couldn't: `@elastic/elasticsearch` 9.x refuses to talk to an 8.x server (the client is now pinned to 8.x), and stock changes after a purchase weren't pushed to the index (fixed, with a test).

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

[autocannon](https://github.com/mcollina/autocannon), 20 connections for 8 seconds, 194 seeded products, everything on one laptop.

**Real services** (MongoDB, Redis and Elasticsearch in Docker, ES heap 512 MB):

| Endpoint | p50 | p97.5 | avg | req/s |
| --- | --- | --- | --- | --- |
| `GET /products/:id` (Redis cache hit) | 10 ms | 20 ms | 10.9 ms | ~1,760 |
| `GET /products?category=smartphones&sort=price_asc` | 35 ms | 62 ms | 37.9 ms | ~520 |
| `GET /products?q=lipstick` | 42 ms | 92 ms | 46.5 ms | ~425 |
| `GET /products?q=wireles earbuds&minRating=3` (typo + filter) | 56 ms | 110 ms | 59.6 ms | ~330 |

**No Docker** (`npm run dev:memory`: in-memory MongoDB, mock Redis, Mongo search fallback):

| Endpoint | p50 | p97.5 | avg | req/s |
| --- | --- | --- | --- | --- |
| `GET /products/:id` (cache hit) | 6 ms | 40 ms | 8.3 ms | ~2,260 |
| `GET /products?category=smartphones&sort=price_asc` | 51 ms | 94 ms | 55 ms | ~360 |
| `GET /products?q=lipstick` | 40 ms | 55 ms | 41 ms | ~480 |

With Elasticsearch, filtered browsing has about 30% lower p50 latency and handles about 45% more requests per second, because results and facets come back in one query instead of four. Text search speed is about the same at this catalogue size, but Elasticsearch adds fuzzy and partial matching and its cost grows much more slowly with catalogue size. The cache-hit route is a little slower on real Redis than on the in-process mock because of the network hop to the container.

## Known limits

- The Mongo fallback search doesn't do fuzzy or partial-word matching (`phone` doesn't match `iPhone`). Elasticsearch does.
- Search results can lag a write by up to a second (Elasticsearch refresh interval). Product pages read from MongoDB, so they're always current.
- Not run with live Stripe test keys or a real S3 bucket. Both are covered by SDK-level tests, and the README lists the steps to turn them on.
- Stock is checked at checkout and taken at payment. If an item sells out in between, that vendor's order is cancelled and refunded automatically, but the customer sees it as cancelled rather than getting a warning first.
- Failed Stripe transfers are logged and the order keeps going. There is no retry queue yet.
