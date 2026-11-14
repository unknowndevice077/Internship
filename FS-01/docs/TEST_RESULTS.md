# Test and performance results

## Latest full run, 14 Nov 2026

| Suite | Result |
| --- | --- |
| API tests (`cd server && npm test`) | 94 passed |
| Browser end-to-end tests (`cd client && npm run test:e2e`) | 32 passed |
| Live site crawl (customer, seller and admin, every non-destructive button) | 43 pages, 139 clicks, 0 errors |
| Layout check (every page at 375, 768, 1024, 1280 and 1440 px wide, light and dark) | no overflow, no clipped text, contrast OK |
| Real Stripe test mode, local | charge, transfer to the seller after commission, partial refund with transfer reversal |

All of this was run again after the calm slate redesign, with the same results.

Fixed along the way: the shop filter box was too narrow (the price inputs pushed out sideways and "In stock only"
wrapped one word per line), tables squeezed order numbers onto three lines on phones, the empty rating stars were too
faint in light mode, and dashboard numbers could flash negative for one frame while counting up.

The numbers below are from the 28 Oct run.

Measured on 28 Oct 2026, Windows 11, Node 22.14.

## Summary

| Suite | Command | Result |
| --- | --- | --- |
| API tests | `cd server && npm test` | 94 passed |
| Browser end-to-end tests | `cd client && npm run test:e2e` | 32 passed |
| Type check (client) | `cd client && npm run typecheck` | 0 errors, `strict` on |
| Lint | `npm run lint` in each package | 0 errors, 0 warnings |
| Formatting | `npm run format:check` in each package | clean |

All of these run in GitHub Actions on every push.

## End-to-end tests (Playwright)

`cd client && npm run test:e2e` starts its own seeded API (in-memory MongoDB) and Vite server, then drives Chrome through the app the way a user would.

| File | Flow |
| --- | --- |
| `browse.spec.js` | shop listing and facets, category, price and rating filters, in-stock filter, sorting, header search, paging, product gallery, store page, guest "add to cart" redirect and return, role-based redirects, 404 page, wrong password |
| `customer.spec.js` | sign up, add from two stores, change quantity, remove, bad and good coupons, checkout splits into two orders, cart empties, order timeline, invoice download, cancel restocks, out-of-stock rejection, logout |
| `extras.spec.js` | email verification banner, save and unsave products, recently viewed, shipping and the free-shipping hint in the cart, forgot and reset password pages, search suggestions from the keyboard, partial-word search, dark mode toggle that survives a reload, filters folding away at phone width, skip link, vendor order filters, CSV download and shipping settings, admin payouts page, OpenAPI spec |
| `marketplace.spec.js` | the full loop in order: vendor signs up and opens a store, can't list before approval, connects payouts, admin sets 15% commission and approves, vendor lists a product with an image upload, edits it, hides and re-shows it, creates a store coupon, customer buys 2 with the coupon ($45.00), vendor sees the $38.25 payout and ships placed → packed → shipped → delivered, customer leaves a verified review, admin sees analytics, rejects a 95% coupon, suspends and re-approves the store (product disappears and comes back), disables the customer (they're logged out and can't sign back in) |

### Bugs the end-to-end tests caught (all fixed, with regression tests)

| Bug | Impact | Fix |
| --- | --- | --- |
| Toggling a product hidden/live reset its stock to 0 and wiped its images, tags and description | vendors would lose product data from a single click | update schemas no longer apply create defaults, Mongoose handles defaults on create |
| Toggling a coupon on/off reset its minimum order and usage limit | coupons silently lost their limits | same fix |
| The auth rate limit covered `/auth/me`, which runs on every page load | users got logged out after about 50 page loads in 15 minutes | the limit now only covers login and register |
| Any error from `/auth/me` (500, network) logged the user out | flaky connections would sign people out | only a 401 clears the session |
| Disabling a user didn't end their existing sessions | a banned user stayed logged in for up to 7 days | sessions are tracked per user and removed on disable |
| "1 items" on the shop page | wording | singular/plural |

## API tests

`cd server && npm run test:coverage`

```
Test Files  9 passed (9)
     Tests  94 passed (94)
```

| File | What it covers |
| --- | --- |
| `auth.test.js` | register, login, duplicate email, no admin signup, logout revokes the token, role guards |
| `vendor-products.test.js` | onboarding and approval, mock payouts, product ownership, validation, image upload, Redis product cache, Mongo search filters and sorting, hiding unapproved stores |
| `checkout.test.js` | cart add/update/remove, stock limit, multi-vendor checkout and commission split, confirming twice, platform and store coupons, expired coupons, lifecycle order, other vendors blocked, cancel restocks, PDF invoice |
| `reviews-admin.test.js` | rating average, verified purchase, review upsert, analytics totals, coupon limits |
| `integrations.test.js` | Stripe Connect onboarding, PaymentIntent amount and transfer group, webhook-driven split transfers with per-vendor commission, refunds, `account.updated`, bad signatures, Elasticsearch indexing, query building, stock sync after purchase, suspended store removal, bulk reindex |
| `orders-payouts.test.js` | shipping fees and free-shipping limits, commission on goods only, stock held at checkout and released when the hold expires (mock and Stripe), re-checkout releasing your own hold, rollback when an item sells out mid-checkout, the jobs lock, failed transfers retried with backoff and given up after 6 tries, admin retry, partial refunds with coupon share and transfer reversal, over-refund checks, restock rules, cancel after a partial refund, order filters, CSV quoting and formula protection, order emails |
| `accounts.test.js` | email verification (single use), resend, password reset logging out every session, no account enumeration, wishlist and recently viewed, store approval email, partial-word search fallback, Swagger UI and spec, request ids |
| `edge-cases.test.js` | review deletion and rating recalculation, S3 upload with a mocked client, invoices with and without optional lines, error responses, coupon and store access rules, health check with Redis down, jobs timer |
| `vendor-admin-flows.test.js` | vendor stats, storefront visibility, vendor data isolation, coupon preview, admin vendor and user management, health check, profile address |

Stripe and Elasticsearch are mocked at the SDK level, so the tests check the exact requests the API sends to them without needing network access or accounts.

### Coverage

| | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| All files | 93.8% | 80.6% | 95.8% | 97.2% |

`npm audit --omit=dev`: 0 vulnerabilities in both packages. The full audit shows one moderate `uuid` advisory, which comes from a dev-only test tool and never ships.

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

## Browser tests against the real databases

`npm run test:e2e:services` runs all 32 browser tests against MongoDB 7, Redis 7 and Elasticsearch 8.15 from docker compose, instead of the in-memory stand-ins. All 32 pass. This run caught one bug the stand-ins couldn't: Elasticsearch makes new writes searchable about a second later, so a seller who saved a product and searched straight away didn't see it. Index writes now wait for that refresh.

A separate crawl signed in as the customer, the vendor and the admin, opened every page it could reach (42 pages) and clicked every button that doesn't delete or pay for something (128 clicks), watching for console errors, crashes and failed API calls. It found none. The delete, cancel, refund and payment buttons are covered by the browser tests and the real Stripe run below.

## Real Stripe test mode

Run on 12 November 2026 against the local stack (MongoDB, Redis, Elasticsearch in Docker) with real Stripe test keys and a vendor connected to a real Stripe test account:

| Check | Result |
| --- | --- |
| Checkout | a real PaymentIntent for $30.97 (2 × $12.99 lipstick + $4.99 shipping) |
| Pay with Stripe's test card | `succeeded` |
| Order after payment | `placed` |
| Vendor transfer | $28.37 to the vendor's connected account, which is the total minus the 10% commission on goods ($2.60) |
| Vendor refunds one item | $12.99 refunded to the card, and $11.69 (the vendor's share) reversed from their transfer |

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
- Not run against a real S3 bucket. That path is covered by SDK-level tests, and the README lists the steps to turn it on.
- Emails aren't sent anywhere until `SMTP_URL` is set. Without it they're written to the log.
- The background jobs run inside the API process. That's fine for one or a few instances (a Redis lock stops them doubling up), but a busy deployment would want a separate worker.
- Shipping is a flat rate per store, not by weight or destination.
