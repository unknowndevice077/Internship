# Individual reflection

**Name:** Fritz Rjhay L. Dela Cruz
**Track:** Full-Stack Development (FS-01)
**Dates:** 20 Oct – 20 Nov 2026

## What I owned

I built Vendora on my own, end to end: the database design, the Express API, the React front end, the payment split
with Stripe Connect, search with Elasticsearch, Redis for caching and sessions, the tests, the docs in this folder and
the deployment on Render, Vercel, MongoDB Atlas and Upstash.

## What I learned

This was my first time using both MongoDB and Stripe, so the first stretch was mostly getting used to how each of
them works. Neither was hard once it clicked. A collection is still a table, a document is still a row, and an API
call to Stripe is still an API call. It's the details that were different, and those took time.

- **MongoDB makes you decide what to copy.** With SQL I'd just join tables. In MongoDB I had to choose what to store
  inside a document and what to keep as a reference. An order keeps its own copy of each item's title, image and
  price, because the order has to show what the customer actually paid even if the seller changes the product later.
  The user, store and product stay as references that I load with `populate`.
- **Atomic updates instead of transactions.** I don't use multi-document transactions. Taking stock is a single
  update that only matches if there's enough left (`stock >= quantity`) and decrements it in the same step. If two
  people buy the last item at once, only one of those updates can succeed.
- **Analytics are aggregation pipelines.** The admin dashboard (sales per day, commission, top stores) is built with
  MongoDB's aggregation framework. It reads strangely at first, a list of stages instead of one query, but it's the
  same group-by and sum I'd write in SQL.
- **Stripe is mostly waiting for events.** The browser and Stripe's webhook can both tell me a payment went through,
  and either can arrive first. I made payment handling idempotent, meaning it's safe to run twice, so the order only
  gets confirmed and paid out once.
- **How a real marketplace splits a payment.** One charge for the customer, one order and one transfer per seller,
  with the commission and the coupon shared out fairly. Working through the rounding taught me more than any tutorial.
- **Search is its own system.** Keeping Elasticsearch in sync with MongoDB (stock after a sale, ratings after a review,
  products disappearing when a store is suspended) was harder than the search itself.
- **Tests that click through the app find bugs unit tests don't.** The Playwright tests found six real bugs, like a
  product losing its stock when you hid it.

## What was hard

**Getting Stripe Connect working for real.** Everything passed with mocked tests, but the first time I used real test
keys, creating a seller account failed. Stripe had changed its rules for new platforms, and my account was set up so
Stripe carried the risk, which doesn't work for sellers who only receive transfers. On top of that, my Stripe CLI was
logged into a different account than my API keys, so webhooks were going nowhere and I couldn't tell why. I worked
through the errors one by one, read Stripe's docs on the newer Accounts v2 API, moved my code to it, and fixed the
CLI. Then I ran a full test payment and watched the money reach the seller. Mocked tests prove the code is right, but
they can't prove the setup is right.

**Two people buying the last item.** My first version only took stock when the payment succeeded, so two people
could check out the last item at the same time and one of them would pay for something that was already gone. The app
refunded them automatically, but from the customer's side it just looked like their order got cancelled for no
reason. I changed checkout so it holds the stock for 15 minutes the moment you start paying. If you don't finish, a
background job gives the stock back. That job must only run once even with more than one server, so it takes a lock in
Redis first. I also had to handle a card that goes through just after the hold ran out. In that case the job finishes
the order instead of cancelling it.

**Refunds that take money back from the seller.** A refund isn't just "give the customer money back". The seller
already got their share, so a partial refund also has to reverse the right part of their transfer, minus the right
part of the commission. I tested it with a real test payment: $30.97 charged, $28.37 to the seller after a $2.60
commission, then a $12.99 refund that reversed $11.69 from the seller.

**Deploying on free plans.** Each service had its own surprise. The Atlas user I made could read and write but not
drop a database, so my seed script failed until I made it drop the collections one by one instead. A trailing slash in
the site URL I put on Render broke CORS, because the browser sends the address without one, so I made the API ignore
it. And the free API sleeps after 15 minutes, so I added a "waking up the server" note and a scheduled ping during the
day so reviewers don't stare at a blank page.

## What I would do differently

- **Set up the real Stripe account on day one.** Most of my Stripe trouble came from finding out the platform's rules
  near the end. With real test keys early, those rules would have shaped the design instead of forcing changes late.
- **Spend a day learning MongoDB's data modelling before writing models.** I worked out what to embed and what to
  reference while building, and it would have been quicker to know the patterns up front.
- **Start with TypeScript.** I wrote the front end in JavaScript and converted it later. The conversion caught a few
  mistakes, so the types would have saved time from the start.
- **Write the end-to-end tests earlier.** They found bugs my API tests missed, and some of those had been there for a
  while.
- **Deploy the core version first.** I added a lot beyond the brief. It made the project stronger, but there should
  always have been something live to show.
