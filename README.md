# Nexvia internship projects

Both projects from my Nexvia full-stack internship (batch starting 20 October 2026). Each folder is a complete project with its own README, setup steps, tests, docs and screenshots.

| Folder | Project | What it is | Stack |
| --- | --- | --- | --- |
| [FS-04](FS-04) | Sprintboard | A multi-tenant project management platform, like a small Jira: workspaces, projects, sprints, issues, billing | Django REST, React + TypeScript, PostgreSQL, Celery + Redis, Stripe, Docker |
| [FS-01](FS-01) | Vendora | A multi-vendor marketplace: many sellers, one cart, and split payments with platform commission | React + TypeScript, Node.js + Express, MongoDB, Elasticsearch, Redis, Stripe Connect, AWS S3 |

## Live demos

| Project | Site | Demo login |
| --- | --- | --- |
| Sprintboard | https://sprintboard-web.onrender.com | press **Try the demo** |
| Vendora | https://vendora-kappa-nine.vercel.app | one-click buttons on the login page |

Both use Stripe test mode, so pay with card `4242 4242 4242 4242`, any future date and any CVC. Nothing is charged.

The APIs are on Render's free plan. They're kept awake from 8am to 8pm Philippine time by a small scheduled job in
[.github/workflows/keep-awake.yml](.github/workflows/keep-awake.yml). Outside those hours the first page can take up
to a minute while the server wakes up, and the sites say so.

The live sites deploy from each project's own repository (that's where Render and Vercel are connected). This
repository is the combined copy for the submission, with the same code and full history.

## Walkthrough videos

- [Sprintboard, 3 minutes, narrated](FS-04/docs/WALKTHROUGH.md): demo workspace, board, sprints, reports, settings, upgrading a plan with Stripe
- [Vendora, 3.5 minutes, narrated](FS-01/docs/WALKTHROUGH.md): shopping from two stores, paying with a Stripe test card, the seller shipping it, the admin side

## Where to start

- **Sprintboard:** [README](FS-04/README.md), [architecture](FS-04/docs/ARCHITECTURE.md), [API](FS-04/docs/API.md), [test results](FS-04/docs/TEST_RESULTS.md), [walkthrough](FS-04/docs/WALKTHROUGH.md), [reflection](FS-04/docs/REFLECTION.md), [screenshots](FS-04/docs/screenshots)
- **Vendora:** [README](FS-01/README.md), [architecture](FS-01/docs/ARCHITECTURE.md), [API](FS-01/docs/API.md), [test results](FS-01/docs/TEST_RESULTS.md), [walkthrough](FS-01/docs/WALKTHROUGH.md), [reflection](FS-01/docs/REFLECTION.md), [screenshots](FS-01/docs/screenshots)

Both run locally without any paid accounts. Payments use Stripe test mode, with a mock provider when no key is set.

The full commit history of each project is kept in this repository.
