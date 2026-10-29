# Individual reflection

## What I owned

I built Vendora on my own, end to end: the database design, the Express API, the React front end, the payment split with Stripe Connect, search with Elasticsearch, the Redis caching and sessions, the tests and the deployment setup. I also wrote the docs in this folder.

## What I learned

- **Money code needs a different mindset.** In most features a bug means a wrong screen. In checkout it means someone gets paid twice or not at all. I learned to make payment handling idempotent (safe to run twice), because Stripe's webhook and the browser both confirm the same payment and either can arrive first.
- **How a real marketplace splits a payment.** One charge for the customer, one order and one transfer per seller, with the commission and the coupon shared out fairly. Working through the rounding and the edge cases taught me more than any tutorial.
- **Search is its own system.** Keeping Elasticsearch in sync with MongoDB (stock after a sale, ratings after a review, products disappearing when a store is suspended) was harder than the search itself.
- **Tests that click through the app find bugs unit tests don't.** The Playwright tests found six real bugs, like a product losing its stock when you hid it.
- **Third-party APIs change under you.** Halfway through, Stripe stopped letting new platforms create the old kind of seller account, so I had to move to their newer Accounts v2 API.

## What was hard and how I got past it

The hardest problem was stock. My first version only took stock when the payment succeeded, so two people could check out the last item at the same time and one of them would pay for something that was already gone. The app refunded them automatically, but from the customer's side it just looked like their order got cancelled for no reason. I changed checkout so it holds the stock for 15 minutes the moment you start paying. If you don't finish, a background job gives the stock back. The tricky part was making sure that job only runs once when there's more than one server, so I used a lock in Redis. I also had to handle the case where someone's card goes through just after their hold ran out. In that case the job finishes their order instead of cancelling it.

The other one was getting real Stripe working. Everything passed with my mocked tests, but the first time I used real test keys, creating a seller account failed. Stripe had changed its rules for new platforms, and my account was set up so Stripe carried the risk, which doesn't work for sellers who only receive transfers. On top of that, my Stripe CLI was logged into a different account than my API keys, so webhooks were going nowhere. I worked through the errors one by one, read Stripe's docs on the new Accounts v2 API, changed my code to use it, and fixed the CLI. After that I ran a full test payment and watched the money reach the seller. It taught me that mocked tests prove the code is right, but they can't prove the setup is right.

## What I would do differently

- **Set up the real Stripe account on day one.** Most of my Stripe trouble came from finding out about the platform's rules at the end. If I'd connected real test keys early, those rules would have shaped the design instead of forcing changes late.
- **Start with TypeScript.** I wrote the front end in JavaScript and converted it later. The conversion caught a few mistakes, which shows the types would have saved time from the start.
- **Write the end-to-end tests earlier.** They found bugs my API tests missed, and some of those had been there for a while.
- **Keep the scope smaller before adding extras.** I added a lot beyond the brief. It made the project stronger, but I should have deployed the core version first so there was always something live to show.
