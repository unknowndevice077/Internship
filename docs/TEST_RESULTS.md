# Test results

Last run 28 Oct 2026 (Windows 11, Python 3.11.9, Node 22, Postgres 16, Redis 7).

## Backend: 118 passed, 93% coverage

```
$ pytest --cov
...
118 passed in 28.20s
TOTAL   2468 statements   181 missed   93%
```

| Test file | Tests | What it covers |
|---|---:|---|
| `test_models.py` | 10 | default workflow, per-project numbering, ranks, unique constraints, one active sprint, workspace deletion cascade |
| `test_auth_api.py` | 5 | register, invited-user claim, login with email, unique slugs |
| `test_hardening.py` | 22 | refresh rotation and revocation, logout, password change, lockout, 2FA enrol/login/replay/recovery codes/disable, unverified-email gates, blocked attachment types and ClamAV scan, export and workspace deletion (with Stripe cancel), full-text search, pruning, worker heartbeat |
| `test_account_security.py` | 7 | password reset (no account enumeration, single-use token, weak password), email verification (tampered, stale and wrong-salt tokens), resend, login rate limit |
| `test_tenancy_api.py` | 16 | missing header, non-member gets 404, cross-tenant read/write/FK smuggling, role matrix, last-owner protection |
| `test_issues_api.py` | 9 | defaults, filters, move between neighbours, top of column, rank rebalancing, board, sprint lifecycle |
| `test_activity_api.py` | 12 | open vs custom workflow, transition validation, comments ownership, attachments up/download/isolation/size limit, audit diffs |
| `test_background_jobs.py` | 13 | signed webhook delivery, retries to failure, event filters, cross-tenant, SSRF guard, notifications, sprint report, weekly summary |
| `test_billing.py` | 11 | plan limits, Checkout session, signature check, subscription sync, idempotent events, downgrade |
| `test_query_counts.py` | 7 | constant query count on the main list endpoints as data grows |
| `test_commands.py` | 4 | seed data integrity, numbering after seed, reset, bench |
| `test_health.py` | 2 | health check ok / degraded |

Coverage by app:

| App | Statements | Coverage |
|---|---:|---:|
| accounts | 432 | 97% |
| tenancy | 289 | 94% |
| projects | 590 | 95% |
| activity | 280 | 94% |
| notifications | 119 | 92% |
| webhooks | 203 | 87% |
| reports | 167 | 88% |
| billing | 258 | 88% |

Migrations, admin, ASGI/WSGI and the `stripe_setup` command (which needs a real Stripe account) are excluded.

Lint: `ruff check` and `ruff format --check` pass. `makemigrations --check` reports no missing migrations.

## Frontend: 6 passed

```
$ npm test
 PASS src/components/kanban.test.ts (6 tests)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Covers finding a card's column, moving across columns and into an empty column, the neighbour ids sent to the move
API, and the workflow rule check used to block columns. `npm run typecheck` (strict TypeScript) and
`npm run build` both pass. Pages load on demand: the first load is about 241 kB of JavaScript (78 kB gzipped) split into app, React and query chunks.

## End-to-end: 39 passed (Playwright, Chromium)

`npm run e2e` starts the API and Vite, migrates and seeds the database, then drives the real UI. The suite passed
three full runs in a row (90/90) before being added to CI.

| Spec | Tests | Flows covered |
|---|---:|---|
| `security.spec.ts` | 6 | 2FA setup, sign-in with an authenticator code, recovery codes and turning it off; password change; account lockout; board filter, backlog search and keyboard shortcuts; workspace export and deletion; phone-width menu |
| `account.spec.ts` | 3 | forgot password, emailed reset link, weak password, reused link rejected, verify banner, resend, confirm link, bad link |
| `auth.spec.ts` | 5 | register, duplicate email, weak password, missing workspace name, wrong password, sign out, session after reload, page links |
| `board.spec.ts` | 6 | create project, key validation, auto key, Free plan project limit and billing link, default columns, issue keys, create/cancel modal, drag between and within columns with reload, every drawer field, close by Escape/backdrop/button, history |
| `activity.spec.ts` | 3 | add/delete comments, history entries, upload/download/remove attachment, size limit |
| `workflow.spec.ts` | 3 | add/rename/recategorise/reorder/delete statuses, delete blocked while issues exist, transition rules on drag and in the status picker |
| `sprints.spec.ts` | 3 | new sprint, plan issues, start, one active sprint rule, complete, unfinished work back to backlog, report numbers, CSV download, on-demand report, create issue inside a sprint |
| `members.spec.ts` | 5 | invite, claim invited account, viewer read-only UI, promote and remove, admin limits on owner role, workspace switching and isolation, member limit, duplicate invite |
| `integrations.spec.ts` | 5 | webhooks need a paid plan, add/ping/deliver/disable/delete endpoint, HMAC signature check, event filter, bell notifications for assignment and mention, mark read, billing page states |

## Stripe test mode

Run against a real Stripe test account with the Stripe CLI forwarding webhooks to the API:

| Step | Result |
|---|---|
| `stripe_setup` | Pro and Business prices created |
| `POST /api/billing/checkout/` as the Initech owner | 200, Stripe Checkout URL on `checkout.stripe.com` |
| Subscription created with Stripe's test payment method `pm_card_visa` | `customer.subscription.created` forwarded, webhook answered 200, workspace became Pro, limits read 25 projects |
| Subscription cancelled | `customer.subscription.deleted` forwarded, 200, workspace back on Free |

The card form on Stripe's hosted page wasn't driven by the script, so that part is checked by hand with `4242 4242 4242 4242`.

Also checked by hand: the full Docker stack (`docker compose --profile full up`) with health check, register, create
project and issue through nginx, and jobs processed by the containerised worker.

## Bugs found by testing

| Bug | Found by | Fix |
|---|---|---|
| Deleting a workspace failed (`ProtectedError`) because `Issue.status` was `PROTECT` | seed `--reset` | `RESTRICT`, plus a regression test |
| `GET /api/workspaces/` ran one query per workspace | query-count test | subquery annotation |
| The API image crashed on start: `pyotp` and `cryptography` were missing from `requirements.txt` | Docker stack build | added the pinned packages |
| Escape didn't close the create-issue dialog | shortcut e2e test | Escape handler on the modal |
| Vitest also collected the Playwright specs and failed, which would have broken the CI frontend job | running every suite together | `include` limited to `src/` in the Vite config |
| Celery tasks didn't run eagerly in tests (`app.conf` is overridden by Django settings) | background job tests | set `CELERY_TASK_ALWAYS_EAGER` through Django settings |
| Webhook retries raised `Retry` in eager mode | retry test | attempts tracked on the row, next attempt scheduled with `apply_async` |
| Stripe SDK objects are no longer dicts (`.get` fails) | billing webhook tests | normalise with `to_dict()` |
| A sprint request with `project=0` fired before the issue had loaded | browser network log | query only enabled once the id is known |
| Issue history showed stale entries after editing in the drawer | e2e `board.spec.ts` | history query invalidated on issue updates |
| Viewers' cards were announced as disabled (`aria-disabled`) although clicking opens the issue | e2e `members.spec.ts` | `aria-disabled={false}` on the card |
| Dropping a card on a column the workflow blocks moved it into a column passed on the way | e2e `workflow.spec.ts` | blocked columns stay droppable and the drop is rejected |
| Workflow checkboxes flickered back before the request finished and could send the wrong request | e2e `workflow.spec.ts` (flaky run) | action decided at click time, local pending state until refetch |
| Workspace switcher order depended on join order | e2e `members.spec.ts` | workspaces sorted by name |

## CI

`.github/workflows/ci.yml` runs all three suites on every push and pull request: backend (ruff, migrations check,
pytest on Postgres and Redis), frontend (ESLint, Prettier, TypeScript, unit tests, build) and e2e (Playwright), then
builds the Docker images. Each job was replayed locally from a clean install before pushing.
