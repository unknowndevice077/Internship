import random
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F
from django.db.models.expressions import RawSQL
from django.utils import timezone
from faker import Faker

from apps.activity.models import AuditLog, Comment
from apps.billing.plans import plan_for
from apps.projects.models import Issue, Project, Sprint, Status
from apps.reports.models import Report
from apps.reports.tasks import build_report
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


DESCRIPTIONS = [
    "Steps to reproduce:\n1. Sign in as a member\n2. Open the page\n3. Refresh twice\n\n"
    "Expected: the page loads.\nActual: a blank screen until the second refresh.",
    "Customers on the Business plan asked for this in the last two support calls. Keep the existing behaviour "
    "behind a flag until QA signs off.",
    "Acceptance criteria:\n- Works on Chrome, Safari and Firefox\n- Covered by an API test\n- Docs updated",
    "Spotted in the error tracker, about 40 events a day since the last release. Probably related to the "
    "timezone change.",
    "Follow-up from the sprint review. Design is in the shared Figma file, ask the design team for the latest frame.",
    "Low priority, but it keeps coming up in onboarding sessions. Should be a small change.",
]

SPRINT_GOALS = ["Ship the new onboarding flow", "Stabilise billing and exports", "Performance and polish"]

COMMENTS = [
    "I can take this one after standup.",
    "Reproduced locally, looks like a missing null check.",
    "PR is up, could someone review?",
    "Moved to next sprint, we ran out of time.",
    "QA passed on staging.",
    "Can we split this into two tickets? The API part is bigger than it looks.",
    "Blocked until the billing changes are merged.",
    "Pairing on this tomorrow morning.",
    "Added screenshots to the attachments.",
    "Customer confirmed the fix works for them.",
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
        user, created = User.objects.get_or_create(
            email=email, defaults={"full_name": full_name, "email_verified_at": timezone.now()}
        )
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
        # a workspace shouldn't start out over its own plan's member limit
        room = plan_for(workspace).max_members
        count = opts["users"] if room is None else min(opts["users"], room - 1)
        for role in roles[:count]:
            first = self.fake.unique.first_name().lower()
            user = self.user(f"{first}@{domain}", f"{first.title()} {self.fake.last_name()}")
            Membership.objects.create(workspace=workspace, user=user, role=role)
            if role != Role.VIEWER:
                people.append(user)

        for project_name, key in projects:
            project = Project.objects.create(
                workspace=workspace,
                name=project_name,
                key=key,
                lead=owner,
                description=f"{project_name} roadmap and bugs",
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
            # the running sprint is 9 days in, the two before it are closed
            start = today - timedelta(days=14 * (3 - n) + 9)
            sprints.append(
                Sprint(
                    workspace=workspace,
                    project=project,
                    name=f"Sprint {n}",
                    goal=SPRINT_GOALS[n - 1],
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
        titles = [f"{verb} {thing}" for verb in ISSUE_VERBS for thing in ISSUE_THINGS]
        random.shuffle(titles)
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
                    title=titles[(number - 1) % len(titles)],
                    description=random.choice(DESCRIPTIONS),
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
        # bulk_create skips Issue.save(), so set numbers and the counter here
        Issue.objects.bulk_create(issues, batch_size=500)
        Project.objects.filter(pk=project.pk).update(issue_counter=count)
        # spread created_at over the last 50 days
        Issue.objects.filter(project=project).update(created_at=RawSQL("now() - random() * interval '50 days'", []))

        saved = list(Issue.objects.filter(project=project).select_related("status", "sprint"))
        now = timezone.now()
        for issue in saved:
            if issue.status.category != Status.Category.DONE:
                continue
            sprint = issue.sprint
            if sprint and sprint.start_date:
                # more gets finished towards the end of a sprint
                last = min(sprint.end_date, today)
                span = max((last - sprint.start_date).days, 0)
                day = sprint.start_date + timedelta(days=round(span * random.random() ** 0.7))
                done_at = timezone.make_aware(datetime.combine(day, time(random.randint(9, 17), random.randint(0, 59))))
                issue.completed_at = min(done_at, now)
            else:
                issue.completed_at = now - timedelta(days=random.random() * 14)
        Issue.objects.bulk_update(saved, ["completed_at"], batch_size=500)
        # nothing can be finished before it was created
        Issue.objects.filter(project=project, completed_at__lt=F("created_at")).update(
            created_at=F("completed_at") - timedelta(days=2)
        )
        comments, entries = [], []
        for issue in random.sample(saved, k=min(len(saved), count // 3)):
            for _ in range(random.randint(1, 3)):
                author = random.choice(people)
                comments.append(Comment(workspace=workspace, issue=issue, author=author, body=random.choice(COMMENTS)))
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
        # finished issues also get the move that finished them, so the activity feed has some history
        doing = next((st.name for st in statuses if st.category == Status.Category.IN_PROGRESS), statuses[0].name)
        for issue in saved:
            if issue.completed_at:
                entries.append(
                    AuditLog(
                        workspace=workspace,
                        actor=issue.assignee or issue.reporter,
                        action=AuditLog.Action.MOVED,
                        entity_type="issue",
                        entity_id=issue.id,
                        entity_label=issue.key,
                        issue=issue,
                        changes={"status": [doing, issue.status.name]},
                    )
                )
        Comment.objects.bulk_create(comments, batch_size=500)
        AuditLog.objects.bulk_create(entries, batch_size=500)
        # created_at is auto_now_add, so backdate the entries after the insert
        for entry in entries:
            moved = entry.action == AuditLog.Action.MOVED
            entry.created_at = entry.issue.completed_at if moved else entry.issue.created_at
        AuditLog.objects.bulk_update(entries, ["created_at"], batch_size=500)

        for sprint in closed:
            report = Report.objects.create(
                workspace=workspace, kind=Report.Kind.SPRINT, project=project, sprint=sprint, requested_by=people[0]
            )
            build_report(report.id)
