# Nexvia internship projects

Both projects from my Nexvia full-stack internship (batch starting 20 October 2026). Each folder is a complete project with its own README, setup steps, tests, docs and screenshots.

| Folder | Project | What it is | Stack |
| --- | --- | --- | --- |
| [FS-04](FS-04) | Sprintboard | A multi-tenant project management platform, like a small Jira: workspaces, projects, sprints, issues, billing | Django REST, React + TypeScript, PostgreSQL, Celery + Redis, Stripe, Docker |
| [FS-01](FS-01) | Vendora | A multi-vendor marketplace: many sellers, one cart, and split payments with platform commission | React + TypeScript, Node.js + Express, MongoDB, Elasticsearch, Redis, Stripe Connect, AWS S3 |

## Where to start

- **Sprintboard:** [README](FS-04/README.md), [architecture](FS-04/docs/ARCHITECTURE.md), [API](FS-04/docs/API.md), [test results](FS-04/docs/TEST_RESULTS.md), [screenshots](FS-04/docs/screenshots)
- **Vendora:** [README](FS-01/README.md), [architecture](FS-01/docs/ARCHITECTURE.md), [API](FS-01/docs/API.md), [test results](FS-01/docs/TEST_RESULTS.md), [screenshots](FS-01/docs/screenshots)

Both run locally without any paid accounts. Payments use Stripe test mode, with a mock provider when no key is set.

The full commit history of each project is kept in this repository.
