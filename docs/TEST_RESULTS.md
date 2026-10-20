# Test results

Run on 21 Oct 2026 (Windows 11, Python 3.11.9, Node 22, Postgres 16, Redis 7).

## Backend: 89 passed, 92% coverage

```
$ pytest --cov
...
89 passed in 29.40s
TOTAL   1992 statements   162 missed   92%
```

| Test file | Tests | What it covers |
|---|---:|---|
| `test_models.py` | 10 | default workflow, per-project numbering, ranks, unique constraints, one active sprint, workspace deletion cascade |
| `test_auth_api.py` | 5 | register, invited-user claim, login with email, unique slugs |
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
| accounts | 105 | 95% |
| tenancy | 241 | 93% |
| projects | 583 | 95% |
| activity | 233 | 93% |
| notifications | 119 | 92% |
| webhooks | 203 | 87% |
| reports | 167 | 88% |
| billing | 248 | 88% |

Migrations, admin, ASGI/WSGI and the `stripe_setup` command (which needs a real Stripe account) are excluded.

Lint: `ruff check` and `ruff format --check` pass. `makemigrations --check` reports no missing migrations.

## Frontend: 6 passed

```
$ npm test
 ✓ src/components/kanban.test.ts (6 tests)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Covers finding a card's column, moving across columns and into an empty column, the neighbour ids sent to the move
API, and the workflow rule check used to block columns. `npm run typecheck` (strict TypeScript) and
`npm run build` both pass. The production bundle is 308 kB (97 kB gzipped).

## Manual end-to-end checks

Done in the browser against the dev stack with a real Celery worker:

- drag a card to another column and reorder within a column, then reload to confirm both are saved
- with a custom workflow, dragging from To Do greys out the disallowed columns, and the API rejects a forced PATCH
- comment, upload an attachment and see both in the issue history
- a second user assigns an issue and @mentions the owner, and the bell shows 2 unread
- a webhook to a local receiver gets `issue.created`, `comment.commented` and `ping` with valid signatures
- complete a sprint, and the worker builds the report (21 points committed, 1 done, 4.8%)
- the 4th project on the Free plan is refused with an upgrade link

Full Docker stack (`docker compose --profile full up`): health check green, register, create a project and an issue
through nginx, and the worker processes the jobs.

## Bugs found by testing

| Bug | Found by | Fix |
|---|---|---|
| Deleting a workspace failed (`ProtectedError`) because `Issue.status` was `PROTECT` | seed `--reset` | `RESTRICT`, plus a regression test |
| `GET /api/workspaces/` ran one query per workspace | query-count test | subquery annotation |
| Celery tasks didn't run eagerly in tests (`app.conf` is overridden by Django settings) | background job tests | set `CELERY_TASK_ALWAYS_EAGER` through Django settings |
| Webhook retries raised `Retry` in eager mode | retry test | attempts tracked on the row, next attempt scheduled with `apply_async` |
| Stripe SDK objects are no longer dicts (`.get` fails) | billing webhook tests | normalise with `to_dict()` |
| A sprint request with `project=0` fired before the issue had loaded | browser network log | query only enabled once the id is known |

## CI

`.github/workflows/ci.yml` runs the same backend tests against Postgres and Redis service containers, plus lint, the
migrations check, the frontend checks and the Docker image builds. It runs on the first push to GitHub.
