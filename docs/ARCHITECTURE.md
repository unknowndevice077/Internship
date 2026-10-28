# Architecture

## System

```mermaid
flowchart LR
    browser["Browser<br/>React SPA"]
    nginx["nginx<br/>static files + /api proxy"]
    api["Django REST API<br/>gunicorn (gthread)"]
    pg[("PostgreSQL")]
    redis[("Redis<br/>broker")]
    worker["Celery worker"]
    beat["Celery beat"]
    stripe["Stripe"]
    hooks["Customer webhook<br/>endpoints"]
    smtp["Email (SMTP)"]

    browser -->|HTTPS, JWT + X-Workspace| nginx --> api
    api --> pg
    api -->|enqueue after commit| redis --> worker
    beat -->|weekly summary| redis
    worker --> pg
    worker -->|signed POST, retries| hooks
    worker --> smtp
    api -->|Checkout, portal| stripe
    stripe -->|signed webhooks| api
```

| Component | Responsibility |
|---|---|
| React SPA | Board, backlog, issue drawer, settings, billing. TanStack Query for server state, dnd-kit for drag and drop |
| Django API | Auth, tenancy, permissions, business rules, audit log, Stripe integration |
| PostgreSQL | All tenant data in one schema |
| Redis + Celery | Notifications, webhook delivery, reports, weekly summaries |
| Stripe | Subscriptions. Our database mirrors the subscription state from Stripe webhooks |

## Tenant isolation

Shared database, shared schema, `workspace_id` on every tenant table. One deployment, one migration path, and
tenants can be onboarded with a single insert. The risk is a query that forgets the filter, so isolation is
enforced in a few central places and covered by tests:

1. `WorkspaceRolePermission` reads the `X-Workspace` header, loads the caller's `Membership` for that slug and
   stores `request.workspace`. If there is no membership the API returns **404**, so you can't probe which
   workspaces exist.
2. `TenantViewSet.get_queryset()` always applies `.for_workspace(request.workspace)`, and `perform_create` sets
   the workspace from the request. Clients never send it.
3. `WorkspaceRelatedField` / `MemberField` only accept ids from the current workspace, so a request can't attach
   another tenant's status, sprint, issue or user.
4. `Issue.clean()` checks that the status and sprint belong to the same project, as a second line of defence.
5. Attachments and report CSVs are streamed through the API instead of a public `/media` URL, so the same
   checks apply to downloads.
6. Webhooks and notifications are built from the audit entry's workspace, and endpoints are looked up by
   workspace.

`tests/test_tenancy_api.py` covers cross-tenant reads, writes and foreign-key smuggling.

```mermaid
sequenceDiagram
    participant C as Client
    participant P as WorkspaceRolePermission
    participant V as TenantViewSet
    participant DB as Postgres
    C->>P: GET /api/issues/ (Bearer JWT, X-Workspace: acme)
    P->>DB: Membership where user = me and workspace.slug = acme
    alt no membership
        P-->>C: 404 Workspace not found
    else role below what the view needs
        P-->>C: 403
    else allowed
        P->>V: request.workspace, request.membership
        V->>DB: Issue where workspace_id = acme.id
        V-->>C: 200
    end
```

## Data model

```mermaid
erDiagram
    USER ||--o{ MEMBERSHIP : has
    WORKSPACE ||--o{ MEMBERSHIP : has
    WORKSPACE ||--|| SUBSCRIPTION : billed_by
    WORKSPACE ||--o{ PROJECT : owns
    PROJECT ||--o{ STATUS : has
    PROJECT ||--o{ TRANSITION : allows
    PROJECT ||--o{ BOARD : has
    PROJECT ||--o{ SPRINT : plans
    PROJECT ||--o{ ISSUE : contains
    STATUS ||--o{ ISSUE : "column of"
    SPRINT |o--o{ ISSUE : "scheduled in"
    ISSUE ||--o{ COMMENT : has
    ISSUE ||--o{ ATTACHMENT : has
    WORKSPACE ||--o{ AUDIT_LOG : records
    WORKSPACE ||--o{ WEBHOOK_ENDPOINT : has
    WEBHOOK_ENDPOINT ||--o{ WEBHOOK_DELIVERY : logs
    USER ||--o{ NOTIFICATION : receives
    SPRINT ||--o{ REPORT : summarised_by

    MEMBERSHIP { string role "owner|admin|member|viewer" }
    WORKSPACE { string slug UK  string plan }
    PROJECT { string key "unique per workspace" int issue_counter }
    ISSUE { int number "unique per project" float rank string type string priority }
    SPRINT { string state "planned|active|closed" }
    TRANSITION { fk from_status fk to_status }
    AUDIT_LOG { string action json changes }
```

Key constraints, enforced in the database:

- `(workspace, key)` unique on projects, `(project, number)` unique on issues
- at most one `active` sprint per project (partial unique index)
- `(user, workspace)` unique on memberships
- an issue's status uses `RESTRICT`: a status with issues can't be deleted, but deleting a whole workspace
  cascades cleanly

## Key flows

**Issue numbers.** `Project.issue_counter` is incremented with `UPDATE ... SET issue_counter = issue_counter + 1`
inside the issue's transaction, so two concurrent creates never get the same `WEB-42`.

**Drag and drop.** Each card has a float `rank` within its column. A drop sends the ids of the new neighbours, and
the server stores the midpoint, so only the moved row is written. When two neighbours get closer than `1e-6`, the
column is renumbered in steps of 1024 before the move.

**Workflow rules.** A project with no transitions has an open workflow. Once any transition exists, only the listed
moves are allowed. Both `PATCH /issues/{id}` and `POST /issues/{id}/move/` check this. The board gets the transition
list and greys out columns you can't drop into.

**Events pipeline.**

```mermaid
flowchart LR
    write["API write<br/>(create/update/move/comment)"] --> audit["AuditLog row"]
    audit -->|transaction.on_commit| task["handle_audit_entry (Celery)"]
    task --> notif["Notifications<br/>assign, mention, comment, status"]
    notif --> email["email task"]
    task --> fan["fan_out_event"]
    fan --> d1["deliver_webhook<br/>endpoint A"]
    fan --> d2["deliver_webhook<br/>endpoint B"]
    d1 -->|fail| retry["retry 30s, 1m, 2m, 4m"]
```

Every write goes through the audit log, and one task turns each audit entry into notifications and webhook events,
so these features can't drift apart. Tasks are queued with `on_commit`, so a rolled-back request never sends a
webhook.

**Webhook delivery.** JSON body, `X-Sprintboard-Signature: sha256=HMAC(secret, body)`, 5-second timeout, no
redirects, 5 attempts with backoff, every attempt logged. URLs that resolve to private, loopback or link-local
addresses are rejected when the endpoint is saved and again at send time, to prevent SSRF.

**Billing.** Checkout and the customer portal are hosted by Stripe. Our database only changes when a signed Stripe
webhook arrives (`customer.subscription.*`, `checkout.session.completed`). Event ids are stored with a unique
constraint, so a redelivered event is processed once. Plan limits (projects, members, storage, webhooks) are
checked in the API and return `402` with `code: plan_limit`.

**Accounts.** Password reset uses Django's token generator, which hashes the current password, so a link stops
working once it has been used. The reset endpoint answers 204 whether or not the email exists. Verification links
are signed with the secret key and carry the email address, so changing the address voids old links; they expire
after 3 days. Unverified users can still work and see a banner until they confirm, but can't invite people or
start a checkout.

Refresh tokens rotate: each refresh issues a new one and blacklists the old one, and signing out, changing the
password or resetting it blacklists the rest. Wrong passwords are counted per email and address (5 in 15 minutes
locks that pair), so a stranger can't lock someone out from elsewhere. Two-factor authentication is TOTP with eight
single-use recovery codes. The secret is encrypted with a key derived from `SECRET_KEY`, and a code that has been
accepted can't be used again in its time window.

**Hardening.** Auth endpoints are rate limited per IP (10/min) and everything else per IP or user, with counters
in Redis. Debug is off unless `DJANGO_DEBUG` is set; production adds HTTPS redirects, secure cookies and HSTS.
Attachments go to S3-compatible storage when a bucket is configured and are always downloaded through the API, so
tenant checks apply. Uploads of executable and web-page types are refused, and if `CLAMD_HOST` is set each file is
streamed to ClamAV first (a failed scan rejects the upload). Errors from the API and worker go to Sentry when
`SENTRY_DSN` is set. nginx adds a Content-Security-Policy, `X-Frame-Options` and the other usual headers.

**Data lifecycle.** A scheduled task prunes audit entries older than a year and notifications older than 90 days and
clears expired tokens from the blacklist. Owners can export a workspace as streamed JSON and delete it, which
cascades through every tenant table and cancels the Stripe subscription. Issue search is a Postgres full-text
query (GIN index on title and description) plus a substring match on the title, and `WEB-12` style keys resolve
directly. The health check also reports whether a worker has written its one-minute heartbeat.

## Roles

| Action | viewer | member | admin | owner |
|---|---|---|---|---|
| Read projects, issues, boards | yes | yes | yes | yes |
| Create/edit issues, comment, upload | | yes | yes | yes |
| Delete issues | | | yes | yes |
| Projects, statuses, workflows | | | yes | yes |
| Invite members, change roles | | | yes | yes |
| Webhooks, workspace audit log | | | yes | yes |
| Grant or remove owner, billing changes | | | | yes |

## Deployment

```mermaid
flowchart LR
    dev["git push staging / main"] --> ci["GitHub Actions<br/>lint, tests, e2e,<br/>dependency audit, deploy checks"]
    ci --> ghcr["GHCR images<br/>backend, web"]
    ci -->|staging hooks| staging["Render staging"]
    ci -->|production hooks| render["Render production<br/>api, worker, static web,<br/>Postgres, Redis"]
```

Migrations run when the API container starts (`RUN_MIGRATIONS=1`). The worker runs beat with `-B`, so a single
instance covers both.
