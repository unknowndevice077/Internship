# Final presentation outline (10 minutes)

1. **Problem (1 min)**: a marketplace has to let many independent sellers list products, let a customer buy from several of them in one checkout, and pay each seller their share automatically while the platform keeps a commission.
2. **Demo (3 min)**
   - Customer: search with filters → product page → add items from two stores → apply `WELCOME10` → pay with a test card
   - Vendor: new order appears → mark packed / shipped / delivered → payout amount on the order
   - Customer: timeline, invoice PDF, verified review
   - Admin: approve a new store, analytics dashboard
3. **Design (2 min)**: architecture diagram, one order per vendor plus a shared payment group, separate charges and transfers, where Redis and Elasticsearch fit in
4. **Challenges (2 min)**
   - Splitting one payment and one coupon fairly across vendors
   - Making payment completion idempotent when the webhook and client confirm race each other
   - Keeping the search index in sync with approvals, edits and ratings
   - Running everything offline for development and tests (fallbacks and SDK mocks)
5. **Results (1 min)**: 47 API tests, 21 browser tests, 94% line coverage, bugs the E2E tests caught, latency numbers from TEST_RESULTS.md
6. **Next steps (1 min)**: retry queue for failed transfers, shipping rates, vendor refunds for partial orders, search suggestions, email notifications
