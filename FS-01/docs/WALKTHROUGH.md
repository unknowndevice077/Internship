# Walkthrough

A 3 minute recording of the main flows: [video/walkthrough.mp4](video/walkthrough.mp4)

I recorded it on my local copy with Stripe in test mode, so the payment in the middle is a real Stripe test payment
with the `4242` card, not a mock. Captions in the video say what's going on, the notes below are the same thing in
writing with timestamps.

## The shopper (0:00 - 1:40)

- **0:05** The shop. Everything here comes from one of six seller stores.
- **0:10** Filters. The biggest categories show first, the rest are behind "Show all" so price and rating don't get
  pushed off the screen. Every filter goes into the URL, so a filtered page can be bookmarked or sent to someone.
- **0:25** Search suggestions while typing. Search goes through Elasticsearch when it's running and falls back to
  MongoDB when it isn't, so it never just breaks.
- **0:30** Dark mode. It follows the system the first time and remembers what you pick after that.
- **0:35** Signing in with the demo buttons on the login page (they fill in the seeded accounts).
- **0:45** Product page: gallery, stock, reviews and which store sells it. Adding to cart has a small animation that
  flies the product photo into the cart icon.
- **1:00** The cart has a Red Lipstick from Glow Beauty Co and an iPhone X from Gadget Hub. It's one cart, but
  grouped by store, because each store has its own shipping rate and free-shipping limit.
- **1:05** Checkout. `WELCOME10` is a marketplace coupon, checked on the server and split fairly between the stores.
- **1:15** Stripe Payment Element with the test card.
- **1:25** Paid. One payment became two orders, one per store. Each order has a status timeline and a PDF invoice.

## The seller (1:40 - 2:30)

- **1:45** Seller hub for Glow Beauty Co: revenue, what the store gets after commission, and orders waiting to ship.
- **1:55** The order from the shopper part. I move it to packed, then shipped, then delivered. The customer sees each
  step on their order page and gets an email when it ships.
- **2:10** Order filters by status and date, and a CSV export.
- **2:15** Products (add, edit, images, hide without deleting), store coupons, and Payouts. Payouts go out through
  Stripe Connect as a transfer to the store's own Stripe account.

## The admin (2:30 - 3:00)

- **2:35** Marketplace analytics: sales, commission earned, top stores and best sellers.
- **2:40** Vendors: approving new stores and setting a commission rate per store.
- **2:45** Payouts: every transfer to a seller. Failed ones retry by themselves.
- **2:50** Users, including suspending an account.

## Doing the same thing yourself

Same steps work on the live site or locally (see "Running it" in the README). The password for every demo account is
`demo-pass-123`.

1. Shop as `customer@vendora.test`, add something from two different stores, use `WELCOME10` and pay with
   `4242 4242 4242 4242`, any future date, any CVC.
2. Sign in as `vendor@vendora.test` and ship that order from **Orders**.
3. Sign in as `admin@vendora.test` and look at **Analytics** and **Payouts**.

The live API sleeps on Render's free plan, so the first page can take up to a minute. There's a "waking up the
server" note at the top while that happens.

## Things worth noticing

- One checkout, many sellers: the order split, per-store shipping and the coupon split all happen on the server.
- Paying is safe to confirm twice. The browser and Stripe's webhook can both report the same payment and it's only
  processed once.
- Seller payouts are Stripe Connect transfers, and a refund takes the seller's share back with a transfer reversal.
- Light and dark mode on every page, and every page is checked at phone, tablet, laptop and desktop widths.
