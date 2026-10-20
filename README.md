# Sprintboard

Multi-tenant project management platform, similar to Jira. Each company gets its own workspace with projects,
Kanban boards, sprints, custom workflows and Stripe billing.

Built for the Nexvia Technologies full-stack internship (FS-04), Oct–Nov 2026.

![Board](docs/screenshots/03-board.png)

## Features

- **Workspaces (tenants)**: shared schema with a `workspace_id` on every tenant table, resolved per request from the
  `X-Workspace` header and checked against the caller's membership
- **Roles**: owner, admin, member, viewer per workspace, enforced per endpoint and action
- **Kanban board**: drag-and-drop between columns and within a column (dnd-kit), float ranks so a move is one update
- **Backlog and sprints**: plan, start, complete; unfinished work moves to the backlog or the next sprint
- **Custom workflows**: per-project statuses and allowed transitions, enforced by the API and shown on the board
- **Comments, @mentions, attachments**: attachments are downloaded through the API, so tenant checks apply
- **Audit log**: field-level diffs for every change, issue history tab, admin-only workspace log
- **Background jobs (Celery + Redis)**: HMAC-signed outbound webhooks with retries, in-app and email notifications,
  sprint reports with CSV export, weekly summary emails (celery beat)
- **Stripe Billing (test mode)**: Free / Pro / Business plans, Checkout, customer portal, signed webhooks, plan limits
- **Ops**: Docker images, docker compose stack, GitHub Actions CI/CD, health check, OpenAPI docs

## Stack

| Layer | Tech |
|---|---|
| API | Django 5.2, Django REST Framework, SimpleJWT, drf-spectacular |
| Database | PostgreSQL 16 |
| Jobs | Celery 5, Redis 7, celery beat |
| Billing | Stripe Billing (test mode) |
| Frontend | React 18, TypeScript, Vite, TanStack Query, dnd-kit |
| Infra | Docker, nginx, gunicorn, GitHub Actions, Render blueprint |

## Quick start (Docker)

```bash
docker compose --profile full up --build
docker compose exec backend python manage.py seed
```

Open http://localhost:8088 and sign in with `owner@acme-corp.test` / `demo-pass-123`.

The seed creates three workspaces on different plans (Acme Corp: Business, Globex: Pro, Initech: Free).
Every demo user has the same password.

## Local development

Requirements: Python 3.11, Node 22, Docker (for Postgres and Redis).

```bash
docker compose up -d db redis

cd backend
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py seed
python manage.py runserver

# second terminal
celery -A config worker -l info          # on Windows add: -P solo

# third terminal
cd frontend
npm install
npm run dev
```

The app runs at http://localhost:5173 (Vite proxies `/api` to Django on port 8000).
API docs: http://localhost:8000/api/docs/

Copy `backend/.env.example` for the available settings. Defaults work for local development.

## Stripe (test mode)

1. Create a Stripe account and stay in **test mode**.
2. Set `STRIPE_SECRET_KEY=sk_test_...` and run `python manage.py stripe_setup` to create the Pro and Business prices.
3. Forward webhooks with the Stripe CLI and set the secret it prints:
   ```bash
   stripe listen --forward-to localhost:8000/api/billing/webhook/
   ```
   `STRIPE_WEBHOOK_SECRET=whsec_...`
4. Upgrade from the Billing page with card `4242 4242 4242 4242`, any future date and any CVC.

Without Stripe keys the app still works on the Free plan, and the Billing page says billing is disabled.

## Tests

```bash
cd backend && pytest --cov        # 89 tests, ~92% coverage
cd frontend && npm test           # drag-and-drop ordering and workflow rules
```

CI runs ruff, a migrations check, the backend tests against real Postgres and Redis, the frontend typecheck, tests
and build, then builds both Docker images. See [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) and
[docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Project layout

```
backend/
  apps/
    accounts/       email-based user, register, JWT
    tenancy/        workspaces, memberships, roles, base tenant viewset
    projects/       projects, statuses, transitions, boards, sprints, issues, seed/bench commands
    activity/       comments, attachments, audit log
    notifications/  in-app + email notifications
    webhooks/       outbound webhooks, signing, delivery tasks
    reports/        sprint and weekly reports
    billing/        plans, limits, Stripe checkout/portal/webhooks
  config/           settings, urls, celery, health check
  tests/
frontend/
  src/api           fetch client with token refresh, React Query hooks
  src/components    Kanban board, issue drawer, notification bell
  src/pages
docs/               architecture, API, test results, performance, presentation
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [API guide](docs/API.md) and [OpenAPI schema](docs/openapi.yaml)
- [Test results](docs/TEST_RESULTS.md)
- [Performance](docs/PERFORMANCE.md)
- [Presentation outline](docs/PRESENTATION.md)

## Deployment

`render.yaml` describes the API, worker, static frontend, Postgres and Redis on Render.
On every push to `main`, GitHub Actions builds the images (pushed to GHCR) and calls the Render deploy hooks if the
`RENDER_DEPLOY_HOOK_*` secrets are set.
