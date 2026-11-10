import statistics
import time

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from rest_framework_simplejwt.tokens import RefreshToken

from apps.projects.models import Issue, Project


class Command(BaseCommand):
    help = "Time the main API endpoints in-process against the current database (run `seed` first)."

    def add_arguments(self, parser):
        parser.add_argument("--workspace", default="acme-corp")
        parser.add_argument("--email", default="owner@acme-corp.test")
        parser.add_argument("--runs", type=int, default=30)

    def handle(self, *args, **opts):
        user = get_user_model().objects.filter(email=opts["email"]).first()
        project = Project.objects.filter(workspace__slug=opts["workspace"]).order_by("id").first()
        if not user or not project:
            raise CommandError("Seed data not found. Run `python manage.py seed` first.")

        token = str(RefreshToken.for_user(user).access_token)
        client = Client(
            HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_WORKSPACE=opts["workspace"], SERVER_NAME="localhost"
        )
        issue = project.issues.order_by("id").first()
        statuses = list(project.statuses.order_by("order"))
        issue_count = Issue.objects.filter(project=project).count()

        cases = [
            ("GET board (all issues)", lambda: client.get(f"/api/projects/{project.id}/board/")),
            ("GET issues, page of 50", lambda: client.get(f"/api/issues/?project={project.id}&limit=50")),
            ("GET issues, search", lambda: client.get(f"/api/issues/?project={project.id}&q=login")),
            ("GET backlog (500)", lambda: client.get(f"/api/issues/?project={project.id}&backlog=true&limit=500")),
            ("GET issue detail", lambda: client.get(f"/api/issues/{issue.id}/")),
            ("GET comments", lambda: client.get(f"/api/comments/?issue={issue.id}")),
            ("POST move issue", lambda: self.move(client, issue, statuses)),
            (
                "PATCH issue",
                lambda: client.patch(f"/api/issues/{issue.id}/", {"priority": "high"}, content_type="application/json"),
            ),
        ]

        self.stdout.write(f"Project {project.key}: {issue_count} issues, {opts['runs']} runs per endpoint\n")
        self.stdout.write("| Endpoint | p50 ms | p95 ms | mean ms | queries |")
        self.stdout.write("|---|---:|---:|---:|---:|")
        for name, call in cases:
            call()  # warm up
            timings, queries = [], 0
            for _ in range(opts["runs"]):
                with CaptureQueriesContext(connection) as ctx:
                    start = time.perf_counter()
                    res = call()
                    timings.append((time.perf_counter() - start) * 1000)
                if res.status_code >= 400:
                    raise CommandError(f"{name} returned {res.status_code}: {res.content[:200]}")
                queries = len(ctx.captured_queries)
            timings.sort()
            p95 = timings[max(0, int(len(timings) * 0.95) - 1)]
            p50, mean = statistics.median(timings), statistics.mean(timings)
            self.stdout.write(f"| {name} | {p50:.1f} | {p95:.1f} | {mean:.1f} | {queries} |")

    def move(self, client, issue, statuses):
        issue.refresh_from_db(fields=["status"])
        target = statuses[1] if issue.status_id == statuses[0].id else statuses[0]
        return client.post(f"/api/issues/{issue.id}/move/", {"status": target.id}, content_type="application/json")
