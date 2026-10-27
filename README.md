# Sprintboard

Multi-tenant project management app (Jira-style). Each company has its own workspace with projects, Kanban boards,
sprints, custom workflows and subscription billing.

Nexvia Technologies full-stack internship project (FS-04), Oct-Nov 2026.

![Board](docs/screenshots/03-board.png)

## Features

- Workspaces with owner, admin, member and viewer roles
- Password reset and email verification
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

Worker with the beat scheduler, in a second terminal:

```bash
celery -A config worker -B -l info
```

On Windows `-B` isn't supported, so run them separately:

```bash
celery -A config worker -P solo -l info
celery -A config beat -l info
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
| Backend unit and API tests | `cd backend && pytest --cov` | 96 tests, 92% coverage |
| Frontend unit tests | `cd frontend && npm test` | 6 tests |
| End-to-end (Playwright) | `cd frontend && npm run e2e` | 33 tests |

The end-to-end suite starts its own API (port 8020) and Vite server (port 5191), seeds the database and drives the
UI in Chromium: sign up and sign in, projects and plan limits, drag and drop, every field in the issue drawer,
password reset, email verification, comments, attachments, workflows, sprints and reports, roles and workspace switching, webhooks, notifications and
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
4. security: `pip-audit` and `npm audit` for known vulnerabilities, `manage.py check --deploy` with production
   settings
5. images: builds the backend and web Docker images once everything above passes, and pushes them to GHCR on
   `main` (`latest`) and `staging`
6. deploy: pushes to `staging` deploy to the staging environment, pushes to `main` to production. Each GitHub
   environment holds its own `RENDER_DEPLOY_HOOK_API`, `_WORKER` and `_WEB` secrets; without them the step is
   skipped. Add required reviewers to the `production` environment to gate releases.

Dependabot opens weekly PRs for pip and npm updates and monthly ones for Docker base images and actions.

`render.yaml` defines the Render services (API, worker, static frontend, Postgres, Redis). The API and worker share
one env var group so they sign tokens with the same secret key.

## Production settings

`DJANGO_DEBUG` is off unless set, and the app refuses to start without `DJANGO_SECRET_KEY` in that mode. With
debug off it also turns on HTTPS redirects, secure cookies and HSTS (one year, `SECURE_HSTS_SECONDS`).

| Variable | Purpose |
|---|---|
| `AWS_STORAGE_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_REGION_NAME` | store attachments in S3. Set `AWS_S3_ENDPOINT_URL` too for Cloudflare R2 or MinIO. Without a bucket files go to local disk, which Render wipes on each deploy |
| `SENTRY_DSN` | report errors from the API and the Celery worker to Sentry |
| `THROTTLE_AUTH_RATE` | login, signup, password reset and verification requests per IP (default `10/min`) |
| `THROTTLE_ANON_RATE`, `THROTTLE_USER_RATE` | other requests per IP / per user (defaults `60/min`, `600/min`) |
| `NUM_PROXIES` | how many proxies sit in front of gunicorn, so throttling uses the real client IP (`1` behind nginx or Render) |

Throttle counters live in Redis so they hold across gunicorn workers. Database backups come from the host;
Render's free Postgres has none, so use a paid instance (daily backups) for anything real.

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
