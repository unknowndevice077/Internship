import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models.expressions import RawSQL
from django.utils import timezone
from faker import Faker

from apps.activity.models import AuditLog, Comment
from apps.projects.models import Issue, Project, Sprint, Status
from apps.tenancy.models import Membership, Role, Workspace

User = get_user_model()

DEMO_PASSWORD = "demo-pass-123"

COMPANIES = [
    ("Acme Corp", "acme-corp", "business", [("Website", "WEB"), ("Mobile App", "MOB"), ("Platform", "PLAT")]),
    ("Globex", "globex", "pro", [("Billing", "BILL"), ("Data Pipeline", "DATA")]),
    ("Initech", "initech", "free", [("TPS Reports", "TPS")]),
]

ISSUE_VERBS = ["Fix", "Add", "Refactor", "Investigate", "Update", "Remove", "Document", "Optimize", "Migrate", "Test"]
ISSUE_THINGS = [
    "login flow",
    "password reset email",
    "billing page",
    "search results",
    "dashboard charts",
    "API rate limits",
    "CSV export",
    "dark mode",
    "onboarding checklist",
    "notification settings",
    "audit log filters",
    "webhook retries",
    "file uploads",
    "mobile layout",
    "SSO integration",
    "invoice PDF",
    "sprint report",
    "permissions matrix",
    "cache invalidation",
    "error tracking",
]


class Command(BaseCommand):
    help = "Fill the database with demo workspaces, users, sprints and issues."

    def add_arguments(self, parser):
        parser.add_argument("--issues", type=int, default=150, help="issues per project")
        parser.add_argument("--users", type=int, default=6, help="extra members per workspace")
        parser.add_argument("--reset", action="store_true", help="delete the demo workspaces first")
        parser.add_argument("--seed", type=int, default=42)

    def handle(self, *args, **opts):
        random.seed(opts["seed"])
        self.fake = Faker()
        Faker.seed(opts["seed"])

        if opts["reset"]:
            Workspace.objects.filter(slug__in=[c[1] for c in COMPANIES]).delete()

        with transaction.atomic():
            for name, slug, plan, projects in COMPANIES:
                if Workspace.objects.filter(slug=slug).exists():
                    self.stdout.write(f"{slug} exists, skipping (use --reset to rebuild)")
                    continue
                self.seed_workspace(name, slug, plan, projects, opts)

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Log in as owner@acme-corp.test / {DEMO_PASSWORD} (every demo user has the same password)."
            )
        )

    def user(self, email, full_name):
        user, created = User.objects.get_or_create(email=email, defaults={"full_name": full_name})
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save(update_fields=["password"])
        return user

    def seed_workspace(self, name, slug, plan, projects, opts):
        workspace = Workspace.objects.create(name=name, slug=slug, plan=plan)
        domain = f"{slug}.test"
        owner = self.user(f"owner@{domain}", self.fake.name())
        Membership.objects.create(workspace=workspace, user=owner, role=Role.OWNER)

        people = [owner]
        roles = [Role.ADMIN] + [Role.MEMBER] * max(0, opts["users"] - 2) + [Role.VIEWER]
        for role in roles[: opts["users"]]:
            first = self.fake.unique.first_name().lower()
            user = self.user(f"{first}@{domain}", f"{first.title()} {self.fake.last_name()}")
            Membership.objects.create(workspace=workspace, user=user, role=role)
            if role != Role.VIEWER:
                people.append(user)

        for project_name, key in projects:
            project = Project.objects.create(
                workspace=workspace, name=project_name, key=key, lead=owner, description=self.fake.sentence(nb_words=10)
            )
            self.seed_project(project, people, opts["issues"])

        self.stdout.write(f"{slug}: {len(people)} active members, {len(projects)} projects")

    def seed_project(self, project, people, count):
        workspace = project.workspace
        statuses = list(project.statuses.order_by("order"))
        done = [s for s in statuses if s.category == Status.Category.DONE]
        today = timezone.localdate()

        sprints = []
        for n in range(1, 4):
            start = today - timedelta(days=14 * (4 - n))
            sprints.append(
                Sprint(
                    workspace=workspace,
                    project=project,
                    name=f"Sprint {n}",
                    goal=self.fake.sentence(nb_words=6),
                    state=Sprint.State.CLOSED if n < 3 else Sprint.State.ACTIVE,
                    start_date=start,
                    end_date=start + timedelta(days=13),
                )
            )
        sprints.append(Sprint(workspace=workspace, project=project, name="Sprint 4", state=Sprint.State.PLANNED))
        Sprint.objects.bulk_create(sprints)
        closed, active, planned = sprints[:2], sprints[2], sprints[3]

        issues = []
        rank_by_status = {s.id: 0.0 for s in statuses}
        for number in range(1, count + 1):
            bucket = random.random()
            if bucket < 0.35:
                sprint, status = random.choice(closed), random.choice(done) if random.random() < 0.85 else statuses[0]
            elif bucket < 0.6:
                sprint, status = active, random.choice(statuses)
            elif bucket < 0.7:
                sprint, status = planned, statuses[0]
            else:
                sprint, status = None, statuses[0] if random.random() < 0.8 else statuses[1]
            rank_by_status[status.id] += 1024
            issues.append(
                Issue(
                    workspace=workspace,
                    project=project,
                    number=number,
                    title=f"{random.choice(ISSUE_VERBS)} {random.choice(ISSUE_THINGS)}",
                    description=self.fake.paragraph(nb_sentences=3),
                    type=random.choices(["task", "bug", "story", "epic"], weights=[50, 25, 20, 5])[0],
                    priority=random.choices(["lowest", "low", "medium", "high", "highest"], weights=[5, 20, 45, 22, 8])[
                        0
                    ],
                    status=status,
                    sprint=sprint,
                    assignee=random.choice(people + [None]),
                    reporter=random.choice(people),
                    story_points=random.choice([1, 2, 3, 5, 8, None]),
                    rank=rank_by_status[status.id],
                )
            )
        # bulk_create skips Issue.save(), so numbers and the counter are set by hand
        Issue.objects.bulk_create(issues, batch_size=500)
        Project.objects.filter(pk=project.pk).update(issue_counter=count)
        # spread creation dates over the last ~7 weeks so reports have something to show
        Issue.objects.filter(project=project).update(created_at=RawSQL("now() - random() * interval '50 days'", []))

        saved = list(Issue.objects.filter(project=project))
        comments, entries = [], []
        for issue in random.sample(saved, k=min(len(saved), count // 3)):
            for _ in range(random.randint(1, 3)):
                author = random.choice(people)
                comments.append(
                    Comment(
                        workspace=workspace,
                        issue=issue,
                        author=author,
                        body=self.fake.sentence(nb_words=random.randint(6, 18)),
                    )
                )
            entries.append(
                AuditLog(
                    workspace=workspace,
                    actor=issue.reporter,
                    action=AuditLog.Action.CREATED,
                    entity_type="issue",
                    entity_id=issue.id,
                    entity_label=issue.key,
                    issue=issue,
                )
            )
        Comment.objects.bulk_create(comments, batch_size=500)
        AuditLog.objects.bulk_create(entries, batch_size=500)
