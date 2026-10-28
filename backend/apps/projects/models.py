from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F

from apps.tenancy.managers import TenantModel

DEFAULT_STATUSES = [
    ("To Do", "todo"),
    ("In Progress", "in_progress"),
    ("In Review", "in_progress"),
    ("Done", "done"),
]


class Project(TenantModel):
    name = models.CharField(max_length=120)
    key = models.CharField(max_length=10, help_text="Issue key prefix, e.g. WEB")
    description = models.TextField(blank=True)
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    issue_counter = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["workspace", "key"], name="uniq_project_key_per_workspace"),
        ]

    def __str__(self):
        return self.key

    def save(self, *args, **kwargs):
        self.key = self.key.upper()
        creating = self._state.adding
        super().save(*args, **kwargs)
        if creating:
            self.bootstrap()

    def bootstrap(self):
        # default columns + board so a new project is usable right away
        Status.objects.bulk_create(
            Status(workspace=self.workspace, project=self, name=name, category=cat, order=i)
            for i, (name, cat) in enumerate(DEFAULT_STATUSES)
        )
        Board.objects.create(workspace=self.workspace, project=self, name=f"{self.key} board")

    def next_issue_number(self):
        # atomic increment, safe under concurrent creates
        Project.objects.filter(pk=self.pk).update(issue_counter=F("issue_counter") + 1)
        self.refresh_from_db(fields=["issue_counter"])
        return self.issue_counter


class Status(TenantModel):
    class Category(models.TextChoices):
        TODO = "todo", "To do"
        IN_PROGRESS = "in_progress", "In progress"
        DONE = "done", "Done"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="statuses")
    name = models.CharField(max_length=60)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.TODO)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        verbose_name_plural = "statuses"
        constraints = [
            models.UniqueConstraint(fields=["project", "name"], name="uniq_status_name_per_project"),
        ]

    def __str__(self):
        return f"{self.project.key}: {self.name}"


class Transition(TenantModel):
    # no transitions = open workflow, otherwise only listed moves are allowed
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="transitions")
    from_status = models.ForeignKey(Status, on_delete=models.CASCADE, related_name="outgoing")
    to_status = models.ForeignKey(Status, on_delete=models.CASCADE, related_name="incoming")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["from_status", "to_status"], name="uniq_transition"),
        ]

    def __str__(self):
        return f"{self.from_status.name} -> {self.to_status.name}"


def transition_allowed(project, from_status_id, to_status_id):
    if from_status_id == to_status_id:
        return True
    rules = Transition.objects.filter(project=project)
    if not rules.exists():
        return True
    return rules.filter(from_status_id=from_status_id, to_status_id=to_status_id).exists()


class Board(TenantModel):
    class Kind(models.TextChoices):
        KANBAN = "kanban", "Kanban"
        SCRUM = "scrum", "Scrum"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="boards")
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.KANBAN)

    def __str__(self):
        return self.name


class Sprint(TenantModel):
    class State(models.TextChoices):
        PLANNED = "planned", "Planned"
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="sprints")
    name = models.CharField(max_length=120)
    goal = models.TextField(blank=True)
    state = models.CharField(max_length=10, choices=State.choices, default=State.PLANNED)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(state="active"),
                name="one_active_sprint_per_project",
            ),
        ]

    def __str__(self):
        return self.name


class Issue(TenantModel):
    class Type(models.TextChoices):
        TASK = "task", "Task"
        BUG = "bug", "Bug"
        STORY = "story", "Story"
        EPIC = "epic", "Epic"

    class Priority(models.TextChoices):
        LOWEST = "lowest", "Lowest"
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        HIGHEST = "highest", "Highest"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="issues")
    number = models.PositiveIntegerField(editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.TASK)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.ForeignKey(Status, on_delete=models.RESTRICT, related_name="issues")
    sprint = models.ForeignKey(Sprint, null=True, blank=True, on_delete=models.SET_NULL, related_name="issues")
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_issues"
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="reported_issues"
    )
    story_points = models.PositiveSmallIntegerField(null=True, blank=True)
    # position within the column
    rank = models.FloatField(default=0, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["rank", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "number"], name="uniq_issue_number_per_project"),
        ]
        indexes = [
            models.Index(fields=["workspace", "project", "status", "rank"]),
            GinIndex(SearchVector("title", "description", config="english"), name="issue_search_gin"),
        ]

    @property
    def key(self):
        return f"{self.project.key}-{self.number}"

    def __str__(self):
        return self.key

    def clean(self):
        # status, sprint and project must belong to the same tenant
        if self.project_id and self.workspace_id and self.project.workspace_id != self.workspace_id:
            raise ValidationError("Project belongs to another workspace")
        if self.status_id and self.status.project_id != self.project_id:
            raise ValidationError({"status": "Status belongs to another project"})
        if self.sprint_id and self.sprint.project_id != self.project_id:
            raise ValidationError({"sprint": "Sprint belongs to another project"})

    def save(self, *args, **kwargs):
        if self._state.adding:
            if not self.workspace_id:
                self.workspace_id = self.project.workspace_id
            with transaction.atomic():
                self.number = self.project.next_issue_number()
                # new issues go to the bottom of their column
                if not self.rank:
                    last = Issue.objects.filter(project=self.project, status=self.status).order_by("-rank").first()
                    self.rank = (last.rank + 1024) if last else 1024
                self.full_clean(exclude=["number"])
                return super().save(*args, **kwargs)
        return super().save(*args, **kwargs)
