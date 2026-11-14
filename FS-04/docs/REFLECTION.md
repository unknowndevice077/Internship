# Individual reflection

**Name:** Fritz Rjhay L. Dela Cruz
**Track:** Full-Stack Development (FS-04)
**Dates:** 20 Oct – 20 Nov 2026

## What I owned

All of Sprintboard, on my own: the data model and tenant isolation, the Django REST API and its role permissions, the
React front end (board, backlog, reports, settings), the background jobs with Celery, Stripe billing, the tests,
Docker, CI and the deployment on Render.

## What I learned

This was my first time using Stripe, and it took a while to get used to how it thinks. I expected to call an API and
get an answer back, like most services I've used. Stripe doesn't really work like that for subscriptions. You send the
customer to Checkout, and the real result comes later through webhooks, sometimes in a different order than you'd
expect, and sometimes more than once. Once that clicked, it was the same idea as any other event-driven system I'd
built: verify the message, store it, apply it once. But getting there took a few days of reading the docs and
watching events in the dashboard.

The rest of what I learned:

- **Multi-tenancy is mostly about discipline.** Every workspace shares the same tables, so one missed filter means one
  company can see another company's issues. I ended up putting the workspace check in one base view that everything
  inherits from, and writing tests that try to read and write across workspaces on purpose.
- **Background jobs need to run after the database commits.** If a job is queued inside a transaction, the worker can
  pick it up before the row it needs is saved. Queuing them with `on_commit` made me think about when code runs, not
  just what it does.
- **Counting queries catches slow pages early.** I added tests that fail if a page starts running more queries as data
  grows. They found an extra query per workspace on the workspace list that I would never have noticed by clicking.
- **Free hosting changes how the app has to work.** Render's free plan has no background worker and wipes files on
  every redeploy, so I had to run jobs inside the API and rebuild report files when they go missing.

## What was hardest and how I handled it

**Stripe billing.** Besides being new to me, the hard part was that the plan in my database has to match what Stripe
thinks, no matter what order the events arrive in. A `subscription.updated` can show up before `checkout.session.completed`,
and Stripe retries anything that fails. I store every event ID so a repeat does nothing, and each subscription event
carries the whole subscription, so I save its full state instead of applying a change on top of the last one. The
checkout event fetches the subscription fresh from Stripe for the same reason. Then there were the setup problems: my Stripe CLI was logged
into a different account than my keys, so no webhooks were arriving and I couldn't tell why. And when I deployed, I put
both of my internship apps on one Stripe sandbox, which meant Sprintboard started receiving Vendora's events and
crashing on them. I changed it to skip events for workspaces it doesn't know and answer Stripe with a 200, so Stripe
stops retrying.

**Drag and drop that stays in order.** Dragging a card is easy to show and hard to save. If every move renumbers the
whole column, two people dragging at once overwrite each other. I gave each card a decimal rank and put a dropped card
halfway between its new neighbours, so only that one card changes. After enough moves in the same spot the numbers get
too close together, so there's a rebalance step for that column. Getting dnd-kit, the optimistic update on screen and
the server's answer to agree took several tries.

**Keeping tenants apart in every corner.** The obvious endpoints were fine. The hard ones were the indirect paths: a
comment on an issue from another workspace, an attachment download link, an assignee who isn't a member, a webhook
pointed at a server inside our own network. Each one needed its own check and its own test.

## What I would do differently

- **Connect real Stripe test keys on the first day.** Mocks made everything look finished, and the account and CLI
  problems only showed up later.
- **Plan for the hosting I'll actually get.** I designed for a separate worker and a persistent disk, then had to
  adapt to the free plan at the end.
- **Write the tenant isolation tests before the features, not after.** They found real holes, and it would have been
  cheaper to have them from the start.

## What I'd build next

- Real-time board updates over websockets, so two people on the same board see each other's moves.
- Email notifications with a daily digest instead of only the bell.
- An import from Jira or Trello so a team could actually move over.
