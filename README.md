# Sprintboard

A multi-tenant project tracker in the style of Jira. Each company gets its own workspace with projects, a Kanban
board, sprints, custom workflows and a paid plan through Stripe.

Built for the Nexvia Technologies full-stack internship (FS-04), Oct-Nov 2026.

![Board](docs/screenshots/03-board.png)

## What it does

- Workspaces with owner, admin, member and viewer roles, invites and workspace switching
- Kanban board with drag and drop, a backlog and sprint planning
- Per-project workflows: your own statuses and which moves between them are allowed
- Comments with @mentions, attachments, and a history of every field change
- Webhooks signed with HMAC and retried with backoff, plus in-app and email notifications
- Sprint reports with CSV export, and a weekly summary email
- Free, Pro and Business plans billed through Stripe (test mode), with limits enforced by the API
- Password reset and email verification
- OpenAPI docs at `/api/docs/`

Django 5.2 + DRF, PostgreSQL 16, Celery and Redis on the backend; React 18 + TypeScript (Vite, TanStack Query,
dnd-kit) on the frontend. Runs in Docker behind nginx and gunicorn, with CI/CD on GitHub Actions.

## Quick start

The fastest way to try it is the full Docker stack:

```bash
docker compose --profile full up --build
docker compose exec backend python manage.py seed
```

Then open http://localhost:8088 and sign in as `owner@acme-corp.test` / `demo-pass-123`.

The seed creates three companies on different plans: Acme Corp (Business), Globex (Pro) and Initech (Free). Every
demo user has the same password, so you can sign in as `owner@globex.test` or `owner@initech.test` to see how the
plans differ.

## Local development

You need Python 3.11, Node 22 and Docker (only for Postgres and Redis).

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

Keep `DJANGO_DEBUG=1` in your `.env`. Debug is off by default, and without it the app expects a real secret key and
HTTPS.

Celery worker and scheduler, in another terminal:

```bash
celery -A config worker -B -l info
```

`-B` doesn't work on Windows, so there you need two terminals:

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

The app is on http://localhost:5173 and Vite proxies `/api` to Django on port 8000. Emails (invites, password
resets, verification links) are printed in the worker's terminal.

## Stripe

Without a Stripe key the app still works: everyone is on the Free plan and the Billing page says upgrades are off.
To try real checkout in test mode:

1. Add your test key to `backend/.env`: `STRIPE_SECRET_KEY=sk_test_...`
2. Create the products and prices with `python manage.py stripe_setup` (safe to re-run, refuses live keys).
3. Forward webhooks and put the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`:
   `stripe listen --forward-to localhost:8000/api/billing/webhook/`
4. In the Stripe dashboard (test mode), open the customer portal settings and save them once.
5. Restart Django and the worker, then upgrade from the Billing page with card `4242 4242 4242 4242`.

The plan only changes when Stripe's webhook arrives, not on the redirect back. If an upgrade doesn't show up,
check that `stripe listen` is still running.

## Tests

```bash
cd backend && pytest --cov      # 96 tests, 92% coverage
cd frontend && npm test         # 6 unit tests
cd frontend && npm run e2e      # 33 Playwright tests
```

The Playwright suite starts its own API and Vite server (ports 8020 and 5191), reseeds the database and clicks
through the real UI: signup, plan limits, drag and drop, the issue drawer, password reset, workflows, sprints,
roles, webhooks and billing. To use your installed Chrome instead of downloading Chromium:

```bash
PW_CHANNEL=chrome E2E_PYTHON=../backend/.venv/bin/python npm run e2e
```

On Windows, give `E2E_PYTHON` the full path to the venv's `python.exe`.

Linting: `ruff check . && ruff format --check .` in `backend/`, `npm run lint && npm run format:check` in
`frontend/`.

Results and performance numbers are in [TEST_RESULTS.md](docs/TEST_RESULTS.md) and
[PERFORMANCE.md](docs/PERFORMANCE.md).

## CI/CD

Every push and pull request runs `.github/workflows/ci.yml`:

- **backend**: ruff, migrations check, pytest against real Postgres and Redis containers
- **frontend**: ESLint, Prettier, typecheck, unit tests, production build
- **e2e**: the Playwright suite against a real API and database
- **security**: `pip-audit`, `npm audit` and `manage.py check --deploy` with production settings
- **images**: builds both Docker images once the above pass and pushes them to GHCR
- **deploy**: `staging` branch deploys to staging, `main` to production, through the Render deploy hooks stored in
  each GitHub environment. Skips if no hooks are set.

Dependabot opens update PRs for pip, npm, the Docker base images and the workflow actions.

## Deploying

`render.yaml` sets up the API, worker, static frontend, Postgres and Redis on Render. The API and worker read the
same env var group, since both need the same secret key to sign and check reset and verification links.

With `DJANGO_DEBUG` unset the app turns on HTTPS redirects, secure cookies and HSTS, and won't start without
`DJANGO_SECRET_KEY`. Other settings you'll probably want:

- `AWS_STORAGE_BUCKET_NAME` and the usual `AWS_*` keys to keep attachments in S3 (`AWS_S3_ENDPOINT_URL` for
  Cloudflare R2 or MinIO). Render's disk is wiped on every deploy, so this matters there.
- `SENTRY_DSN` to send errors from the API and worker to Sentry
- `NUM_PROXIES=1` behind nginx or Render, so rate limits see the real client IP
- `THROTTLE_AUTH_RATE` / `THROTTLE_ANON_RATE` / `THROTTLE_USER_RATE` to change the rate limits (default 10, 60
  and 600 a minute)

Render's free Postgres has no backups, so use a paid instance for anything you care about.

## How it's put together

All tenants share one schema and every tenant table has a `workspace_id`. Requests pick a workspace with the
`X-Workspace` header, and a base viewset scopes every query and related field to it. Non-members get a 404 rather
than a 403, so you can't tell whether another company's data exists.

Card order on the board is a float `rank`. Moving a card writes one row (the midpoint of its neighbours), and a
column only gets renumbered when the gaps run out.

Every change goes through the audit log. After the transaction commits, one Celery task turns each entry into
notifications and webhook deliveries, so a request that rolls back never fires a webhook.

More detail and diagrams in [ARCHITECTURE.md](docs/ARCHITECTURE.md). Endpoints are in [API.md](docs/API.md) and
[openapi.yaml](docs/openapi.yaml).

```
backend/
  apps/
    accounts/       users, JWT auth, password reset, email verification
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

## Known gaps

- Billing is tested against mocked Stripe responses; it hasn't run against a deployed webhook endpoint yet.
- Notifications poll every 30 seconds instead of using websockets.
- No SSO and no per-workspace data export yet.
