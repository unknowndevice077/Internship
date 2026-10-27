# Sprintboard

Multi-tenant project management app (Jira-style). Each company has its own workspace with projects, Kanban boards,
sprints, custom workflows and subscription billing.

Nexvia Technologies full-stack internship project (FS-04), Oct-Nov 2026.

![Board](docs/screenshots/03-board.png)

## Features

- Workspaces with owner, admin, member and viewer roles
- Kanban board with drag and drop, backlog and sprint planning
- Custom workflows per project (statuses and allowed transitions)
- Comments with @mentions, file attachments, audit log with field-level history
- Outbound webhooks (HMAC-signed, retried with backoff), in-app and email notifications
- Sprint reports with CSV export and a weekly summary email
- Stripe Billing in test mode: Free, Pro and Business plans with enforced limits
- OpenAPI docs at `/api/docs/`

## Stack

- Backend: Django 5.2, Django REST Framework, SimpleJWT, PostgreSQL 16
- Background jobs: Celery 5 with Redis 7, celery beat for scheduled tasks
- Frontend: React 18, TypeScript, Vite, TanStack Query, dnd-kit
- Billing: Stripe (test mode)
- Infra: Docker, nginx, gunicorn, GitHub Actions

## Running with Docker

```bash
docker compose --profile full up --build
docker compose exec backend python manage.py seed
```

Open http://localhost:8088 and sign in as `owner@acme-corp.test` / `demo-pass-123`.

`seed` creates three demo workspaces: Acme Corp (Business plan), Globex (Pro) and Initech (Free). All demo users
share the same password.

## Local development

Requirements: Python 3.11, Node 22 and Docker (for Postgres and Redis).

```bash
docker compose up -d db redis
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
python manage.py migrate
python manage.py seed
python manage.py runserver
```

Worker, in a second terminal (add `-P solo` on Windows):

```bash
celery -A config worker -B -l info
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

The app runs on http://localhost:5173. Vite proxies `/api` to Django on port 8000.

## Stripe test mode

1. Put a test secret key in `backend/.env` (`STRIPE_SECRET_KEY=sk_test_...`).
2. Create the products and prices: `python manage.py stripe_setup`
3. Forward webhooks and copy the signing secret it prints into `STRIPE_WEBHOOK_SECRET`:
   `stripe listen --forward-to localhost:8000/api/billing/webhook/`
4. In the Stripe dashboard (test mode), save the customer portal settings once.
5. Upgrade from the Billing page with card `4242 4242 4242 4242`.

Without a key the app runs on the Free plan and the Billing page shows that upgrades are disabled.

## Tests

| Suite | Command | Count |
|---|---|---|
| Backend unit and API tests | `cd backend && pytest --cov` | 89 tests, 92% coverage |
| Frontend unit tests | `cd frontend && npm test` | 6 tests |
| End-to-end (Playwright) | `cd frontend && npm run e2e` | 30 tests |

The end-to-end suite starts its own API (port 8020) and Vite server (port 5191), seeds the database and drives the
UI in Chromium: sign up and sign in, projects and plan limits, drag and drop, every field in the issue drawer,
comments, attachments, workflows, sprints and reports, roles and workspace switching, webhooks, notifications and
billing. Locally you can use an installed Chrome instead of downloading one:

```bash
PW_CHANNEL=chrome E2E_PYTHON=../backend/.venv/bin/python npm run e2e
```

Lint and format checks: `ruff check . && ruff format --check .` (backend) and `npm run lint && npm run format:check`
(frontend).

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request:

1. backend: ruff, migrations check, pytest against Postgres and Redis service containers, coverage report
2. frontend: ESLint, Prettier, TypeScript, unit tests, production build
3. e2e: Playwright against a real API, database and Vite server
4. images: builds the backend and web Docker images, and pushes them to GHCR on `main`
5. deploy: on `main`, calls the Render deploy hooks when the `RENDER_DEPLOY_HOOK_*` secrets are set

`render.yaml` defines the Render services (API, worker, static frontend, Postgres, Redis).

## Project layout

```
backend/
  apps/
    accounts/       user model, registration, JWT
    tenancy/        workspaces, memberships, roles, base tenant viewset
    projects/       projects, statuses, transitions, sprints, issues; seed and bench commands
    activity/       comments, attachments, audit log
    notifications/  in-app and email notifications
    webhooks/       endpoints, signing, delivery tasks
    reports/        sprint and weekly reports
    billing/        plans, limits, Stripe checkout, portal and webhooks
  config/           settings, URLs, Celery app, health check
  tests/
frontend/
  src/api/          fetch client with token refresh, query hooks
  src/auth/         session context and role helpers
  src/components/   board, issue drawer, notification bell
  src/pages/
  e2e/              Playwright tests
docs/
scripts/loadtest.py
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API guide](docs/API.md), [OpenAPI schema](docs/openapi.yaml)
- [Test results](docs/TEST_RESULTS.md)
- [Performance](docs/PERFORMANCE.md)
