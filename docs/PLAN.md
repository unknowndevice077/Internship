# Sprintboard plan

Multi-tenant project management platform (FS-04). Due 20 Nov 2026.

## Design notes

- Tenancy: shared schema, `workspace_id` on every tenant table. Views filter with `for_workspace()`.
- Tenant resolution: `X-Workspace: <slug>` header, validated against the user's membership.
- Auth: JWT (simplejwt), email as username.
- Roles per workspace: owner, admin, member, viewer.
- Issue ordering: float `rank`, new position = midpoint of neighbours, rebalanced in a background job.
- Jobs: Celery + Redis (notifications, webhook delivery, reports).
- Billing: Stripe test mode, Checkout + webhooks, plan limits enforced in the API.

## Milestones

- [x] Models and tenant isolation
- [x] REST API, auth, role permissions, OpenAPI docs
- [x] React Kanban board (dnd-kit), backlog, sprints
- [x] Custom workflows, comments, attachments, audit log
- [ ] Webhooks, notifications, reports (Celery)
- [ ] Stripe billing and plan limits
- [ ] Docker images, GitHub Actions CI/CD
- [ ] Seed data (Faker), performance numbers
- [ ] README, architecture diagram, API docs, demo, presentation
