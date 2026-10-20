# API guide

Base URL: `/api`. The interactive docs are at `/api/docs/` and the schema is in [openapi.yaml](openapi.yaml).

## Auth

```http
POST /api/auth/register/   {"email", "password", "full_name", "workspace_name"}
POST /api/auth/token/      {"email", "password"}          -> {"access", "refresh"}
POST /api/auth/token/refresh/ {"refresh"}                  -> {"access"}
GET  /api/auth/me/                                         -> user + workspaces and roles
```

Access tokens last 30 minutes and refresh tokens 7 days. Send `Authorization: Bearer <access>`.

## Tenant header

Every workspace endpoint needs `X-Workspace: <slug>`. Without it the API returns `400`. If you aren't a member
of that workspace, it returns `404`.

```bash
curl -H "Authorization: Bearer $TOKEN" -H "X-Workspace: acme-corp" localhost:8000/api/issues/?project=1
```

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| GET/POST | `/workspaces/` | any user | your workspaces / create one (you become owner) |
| GET/PATCH | `/workspace/` | viewer / admin | current workspace |
| GET/POST/PATCH/DELETE | `/members/` | viewer / admin | invite by email; only owners can grant owner |
| CRUD | `/projects/` | viewer / admin | `issue_count` included |
| GET | `/projects/{id}/board/` | viewer | columns with cards and the transition list; `?sprint=active` |
| CRUD | `/statuses/?project=` | viewer / admin | board columns |
| GET/POST/DELETE | `/transitions/?project=` | viewer / admin | workflow rules |
| CRUD | `/sprints/?project=` | viewer / member | |
| POST | `/sprints/{id}/start/` | member | one active sprint per project |
| POST | `/sprints/{id}/complete/` | member | `{"move_to": sprint_id}` optional; queues a report |
| CRUD | `/issues/` | viewer / member | filters: `project status sprint assignee type priority backlog q`, `ordering=rank\|number\|priority\|created_at` |
| POST | `/issues/{id}/move/` | member | `{"status", "before", "after"}` neighbour ids |
| CRUD | `/comments/?issue=` | viewer / member | authors edit their own; admins can delete any |
| GET/POST/DELETE | `/attachments/?issue=` | viewer / member | multipart upload; `GET /attachments/{id}/download/` |
| GET | `/audit-log/` | admin | `?issue=` allowed for viewers |
| GET | `/notifications/` | viewer | `?unread=true`, `unread-count/`, `{id}/read/`, `read-all/` |
| CRUD | `/webhooks/` | admin | paid plans; `{id}/ping/`, `{id}/deliveries/`, `{id}/deliveries/{d}/redeliver/`, `events/` |
| GET/POST | `/reports/` | viewer / member | `{"kind": "sprint", "sprint": id}` returns 202; `{id}/download/` CSV |
| GET | `/billing/` | admin | plan, limits, usage |
| POST | `/billing/checkout/` | owner | `{"plan": "pro"\|"business"}` -> Stripe Checkout URL |
| POST | `/billing/portal/` | owner | Stripe customer portal URL |
| POST | `/billing/webhook/` | Stripe | signature-verified |
| GET | `/health/` | public | database + redis |

## Errors

Standard DRF format. Field errors look like `{"title": ["This field is required."]}`, and other errors look like
`{"detail": "..."}`.

| Status | When |
|---|---|
| 400 | validation, missing `X-Workspace`, workflow doesn't allow the move |
| 401 | missing or expired token |
| 402 | plan limit: `{"detail", "code": "plan_limit", "resource", "limit"}` |
| 403 | role too low |
| 404 | not found, or it belongs to another workspace |
| 503 | billing endpoints when Stripe isn't configured |

## Moving a card

`before` is the card that ends up directly above the moved card, and `after` is the card directly below. Leave both
out to drop at the bottom of the column.

```json
POST /api/issues/42/move/
{"status": 7, "before": 40, "after": 41}
```

## Webhooks

Event names follow `<entity>.<action>`: `issue.created`, `issue.updated`, `issue.moved`, `issue.deleted`,
`comment.commented`, `attachment.attached`, `sprint.created`, `sprint.updated`, `project.created`,
`membership.created`, plus `ping`.

```json
{
  "event": "issue.moved",
  "workspace": "acme-corp",
  "occurred_at": "2026-10-21T02:26:29.120Z",
  "actor": {"id": 3, "email": "sam@acme.io"},
  "entity": {"type": "issue", "id": 42, "label": "WEB-42"},
  "changes": {"status": ["To Do", "In Progress"]},
  "issue": {"id": 42, "key": "WEB-42", "title": "Fix login", "status": "In Progress", "assignee": "dana@acme.io"}
}
```

Headers: `X-Sprintboard-Event`, `X-Sprintboard-Delivery`, `X-Sprintboard-Signature`.

Verifying the signature (Python):

```python
import hashlib, hmac

def valid(secret: str, body: bytes, header: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)
```

A delivery counts as successful on any 2xx response. Anything else is retried after 30 s, 1 m, 2 m and 4 m, then
marked failed. Failed deliveries can be redelivered from the settings page.
