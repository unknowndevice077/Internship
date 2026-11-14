# Walkthrough

A 3 minute narrated recording of the main flows: [video/walkthrough.mp4](video/walkthrough.mp4)

Recorded on my local copy with the seeded demo data. The billing part at the end uses Stripe test mode, so the
upgrade is a real Stripe Checkout with the `4242` test card and the plan changes from Stripe's webhook, same as in
production.

## The demo workspace (0:00 - 1:45)

- **0:05** Landing page, then **Try the demo**, which fills in the Acme Corp owner account.
- **0:15** Home: open issues, what got done this week, a created vs completed chart, the active sprints and the
  latest activity, all for the whole workspace.
- **0:22** `Ctrl+K` opens the command palette. Typing "web board" jumps straight to the Website board.
- **0:28** Creating a bug. Issue keys (WEB-12 and so on) are numbered per project and can't collide even when two
  people create issues at the same time.
- **0:40** Drag and drop between columns. The new position is saved, so it stays after a reload.
- **0:45** The issue drawer: status, type, priority, assignee, sprint, story points, description, files and comments.
  I set the points and leave a comment.
- **0:55** History: every change is recorded, and the same events go to the workspace audit log.
- **1:03** Backlog, where sprints get planned and started.
- **1:10** Reports: burndown for the running sprint and per-sprint reports. CSV reports are built in the background.
- **1:15** Workflow settings: custom statuses per project, and transition rules that limit which moves are allowed.
- **1:20** Workspace settings: members and roles (viewer, member, admin, owner), and webhooks that send signed events
  to other systems with retries.
- **1:35** Light, dark, or match the system. The choice is saved per browser.

## Billing (1:45 - 2:43)

- **1:55** Initech is a different company on the same server, on the Free plan. Its limits (projects, members,
  storage) are enforced by the API, not only hidden in the UI.
- **2:00** Upgrade to Pro opens Stripe Checkout. Test card `4242 4242 4242 4242`.
- **2:30** Back in the app. The plan only changes when Stripe's signed webhook arrives, then the higher limits apply
  straight away.

## Doing the same thing yourself

1. Press **Try the demo** on the landing page, or sign in as `owner@acme-corp.test` / `demo-pass-123`.
2. Open a board, drag an issue, open it and comment. Try `Ctrl+K` and `?` for shortcuts.
3. Sign out, sign in as `owner@initech.test` (same password) and upgrade from **Billing** with the test card.
   If someone already upgraded Initech, make a new account, it starts on Free.

The live API sleeps on Render's free plan, so outside 8am to 8pm Philippine time the first request can take
about 30 seconds.

## Things worth noticing

- Every workspace is isolated. Each request carries the workspace and every query is filtered by it, and there are
  tests that try to read or write across workspaces.
- Plan limits are checked on the server and return a clear `402 plan_limit` error.
- Stripe events are verified, stored and processed once, and events for other apps on the same Stripe account are
  ignored instead of failing.
- Light and dark mode everywhere, checked at phone, tablet, laptop and desktop widths.
