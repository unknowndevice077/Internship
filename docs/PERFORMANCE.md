# Performance

Measured on 21 Oct 2026, Windows 11 laptop (12 logical cores), Postgres 16 and Redis 7 in Docker Desktop.
Data from `python manage.py seed --issues 400`: 3 workspaces, 6 projects, 2,400 issues, ~800 comments.

## Query counts

`tests/test_query_counts.py` loads each list endpoint with a small and a larger data set and asserts the query count
doesn't change, so N+1 regressions fail CI.

| Endpoint | Queries |
|---|---:|
| `GET /api/projects/{id}/board/` | 6 |
| `GET /api/issues/` | 5 |
| `GET /api/issues/{id}/` | 3 |
| `GET /api/comments/?issue=` | 4 |
| `POST /api/issues/{id}/move/` | 13 |

Found and fixed while writing these: `GET /api/workspaces/` ran one extra query per workspace to look up the
caller's role. It now uses a subquery annotation.

## Endpoint latency (in-process)

`python manage.py bench --runs 30`, Django test client, project with 400 issues, single thread.

| Endpoint | p50 ms | p95 ms |
|---|---:|---:|
| GET board (400 issues) | 27.3 | 44.0 |
| GET issues, page of 50 | 31.2 | 37.1 |
| GET issues, title search | 25.4 | 31.7 |
| GET backlog (500) | 50.7 | 71.9 |
| GET issue detail | 19.5 | 25.6 |
| GET comments | 14.2 | 17.3 |
| POST move issue | 48.7 | 55.3 |
| PATCH issue | 24.7 | 30.9 |

The board was 75.3 ms p50 / 121.8 ms p95 before it stopped going through DRF serializers for each card
(it now builds the card dicts from `.values()`).

## Load test (HTTP, full Docker stack)

`python scripts/loadtest.py --users 20 --seconds 20` (with `THROTTLE_USER_RATE=100000/min`, since every
virtual user shares one account) against nginx -> gunicorn, mixing the board, issue list,
search and unread-count endpoints.

| Version | Throughput | Errors | Board p50 / p95 | Issue list p50 / p95 |
|---|---:|---:|---:|---:|
| 3 sync gunicorn workers | 64 req/s | 0 | 334 / 547 ms | 279 / 480 ms |
| gthread workers, 4 threads each | 66 req/s | 0 | 359 / 929 ms | 197 / 499 ms |
| + board built from `.values()` | 112 req/s | 0 | 144 / 357 ms | 160 / 392 ms |
| + rate limiting, Redis cache, full-text search (seed `--issues 60`) | 153 req/s | 0 | 91 / 240 ms | 128 / 308 ms |

The last row was measured on a different seed size than the rows above it, so it shows the added features cost
nothing noticeable rather than a speed-up. Search over title and description (`q=fix`) came in at 119 / 278 ms.

Each gunicorn worker thread can hold a Postgres connection. The Docker stack plus a second API process used 94 of
Postgres' default 100 connections, so on small database plans lower `WEB_CONCURRENCY` or `GUNICORN_THREADS`.

More workers alone didn't help: the backend container was at ~850% CPU, so the requests were CPU-bound in Python,
not waiting on Postgres. Cutting serializer work on the heaviest endpoint gave the 75% throughput gain.

## Test suite

- Backend: 130 tests, 93% line coverage (`pytest --cov`), ~30 s locally.
  Switching tests to the MD5 password hasher took the suite from 77 s to 16.5 s.
- Frontend: 6 unit tests for the drag-and-drop ordering and workflow rules (`npm test`).

## Next steps

- Cache the board per project (invalidate on issue writes) if boards grow past a few thousand cards.
- Paginate or virtualize very large columns in the UI.
- Move the `q` search to a trigram or full-text index once projects have tens of thousands of issues.
