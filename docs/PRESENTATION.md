# Final presentation (10 minutes)

Slide-by-slide outline with timings. Screenshots are in `docs/screenshots/`, and the demo video is
`docs/demo/sprintboard-demo.mp4` (1:26).

## 1. Title (0:00–0:20)
Sprintboard: a multi-tenant project management platform. Name, track (Full-Stack, FS-04), dates.

## 2. Problem (0:20–1:20)
- Teams need Jira-style boards and sprints, but a SaaS serving many companies has to guarantee that one company
  never sees another's data.
- It also needs the "boring" SaaS parts: roles, billing and plan limits, integrations (webhooks),
  notifications, reports, deployability.
- Goal: build the whole product end to end, not just a Kanban demo.

## 3. Solution overview (1:20–2:00)
Screenshot `03-board.png`. One-line list of features: workspaces + roles, Kanban drag and drop, sprints, custom
workflows, comments/attachments/audit log, webhooks + notifications + reports on Celery, Stripe Billing, Docker +
CI/CD.

## 4. Architecture (2:00–3:00)
System diagram from `ARCHITECTURE.md`. React SPA, nginx, Django REST, Postgres, Redis + Celery worker/beat,
Stripe. Point out that writes go through the audit log, and one Celery task turns each entry into notifications and
webhooks.

## 5. Design decision: tenant isolation (3:00–4:00)
- Options: database per tenant, schema per tenant, shared schema with `workspace_id`. Chose shared schema: simplest
  ops and one migration path.
- How leaks are prevented: the permission class resolves the workspace from `X-Workspace` and returns 404 for
  non-members, the base viewset always filters, related-object fields only accept ids from the current workspace,
  and files are served through the API.
- Proof: 16 tenancy tests, including trying to attach another tenant's project/user.

## 6. Live demo or video (4:00–6:30)
Play `sprintboard-demo.mp4` or demo live with `owner@acme-corp.test`:
log in, drag cards, open an issue and @mention, history tab, add a workflow rule and show the blocked columns,
complete a sprint and show the report, webhook deliveries, billing page, Swagger.

## 7. Challenges (6:30–8:00)
- **Ordering cards without rewriting the column**: float ranks at the midpoint of the neighbours, with a respace
  when the gap gets too small (tested with 60 moves into the same gap).
- **Doing side effects only after commit**: webhooks/emails queued with `transaction.on_commit` so a failed request
  never notifies anyone. Testing this needed eager Celery plus `django_capture_on_commit_callbacks`.
- **Webhook safety**: HMAC signatures, retries with backoff, and blocking private IPs (SSRF).
- **Stripe as the source of truth**: only signed webhooks change the plan, and event ids are stored so redelivered
  events are processed once.
- **A real bug found by seeding**: deleting a workspace failed because of `PROTECT` on the issue status. Switched
  to `RESTRICT`.

## 8. Results (8:00–9:00)
- 89 backend tests, 92% coverage; 6 frontend tests; lint + migrations check + typecheck in CI.
- Query counts are constant per endpoint (no N+1); the board with 400 issues loads in 6 queries.
- Board endpoint 75 ms → 27 ms p50 after dropping per-card serializers.
- Load test through nginx + gunicorn: 64 → 112 req/s with 20 concurrent users, 0 errors.

## 9. Next steps (9:00–9:40)
- Real-time board updates (WebSockets / Django Channels)
- Postgres row-level security as a second isolation layer
- Full-text search, board caching for very large projects
- Import from Jira CSV exports, SSO (SAML/OIDC), per-seat billing

## 10. Thanks / Q&A (9:40–10:00)
Repo link, demo credentials.

## Likely questions
- *Why not schema-per-tenant?* More operational work (migrations × tenants, connection routing). Shared schema
  plus central enforcement and tests is enough at this scale. RLS would be the next hardening step.
- *What happens if Stripe is down?* Checkout fails with a clear error; existing plans keep working because limits
  are read from our database.
- *What if a webhook endpoint is slow?* 5 s timeout, runs in the worker so the API never waits, retried with backoff.
- *How do you know there are no N+1 queries?* `test_query_counts.py` fails if the count grows with the data.
