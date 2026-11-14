from rest_framework import serializers

from apps.tenancy.fields import MemberField, WorkspaceRelatedField
from apps.tenancy.serializers import MemberUserSerializer

from .models import Board, Issue, Project, Sprint, Status, Transition, transition_allowed


class StatusSerializer(serializers.ModelSerializer):
    project = WorkspaceRelatedField(queryset=Project.objects.all())

    class Meta:
        model = Status
        fields = ["id", "project", "name", "category", "order"]

    def validate(self, attrs):
        if self.instance and "project" in attrs and attrs["project"] != self.instance.project:
            raise serializers.ValidationError({"project": "Cannot move a status to another project."})
        return attrs


class TransitionSerializer(serializers.ModelSerializer):
    project = WorkspaceRelatedField(queryset=Project.objects.all())
    from_status = WorkspaceRelatedField(queryset=Status.objects.all())
    to_status = WorkspaceRelatedField(queryset=Status.objects.all())

    class Meta:
        model = Transition
        fields = ["id", "project", "from_status", "to_status"]
        validators = []

    def validate(self, attrs):
        project = attrs["project"]
        if attrs["from_status"].project_id != project.id or attrs["to_status"].project_id != project.id:
            raise serializers.ValidationError("Both statuses must belong to the project.")
        if attrs["from_status"] == attrs["to_status"]:
            raise serializers.ValidationError("A transition needs two different statuses.")
        if Transition.objects.filter(from_status=attrs["from_status"], to_status=attrs["to_status"]).exists():
            raise serializers.ValidationError("This transition already exists.")
        return attrs


class BoardSerializer(serializers.ModelSerializer):
    project = WorkspaceRelatedField(queryset=Project.objects.all())

    class Meta:
        model = Board
        fields = ["id", "project", "name", "kind"]


class ProjectSerializer(serializers.ModelSerializer):
    lead = MemberField(required=False, allow_null=True)
    issue_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Project
        fields = ["id", "name", "key", "description", "lead", "issue_count", "created_at"]
        read_only_fields = ["created_at"]

    def validate_key(self, value):
        value = value.upper()
        if not value.isalnum() or not value[0].isalpha():
            raise serializers.ValidationError("Use letters and digits only, starting with a letter.")
        workspace = self.context["request"].workspace
        clash = Project.objects.filter(workspace=workspace, key=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("Key already used in this workspace.")
        return value


class SprintSerializer(serializers.ModelSerializer):
    project = WorkspaceRelatedField(queryset=Project.objects.all())

    class Meta:
        model = Sprint
        fields = ["id", "project", "name", "goal", "state", "start_date", "end_date"]
        read_only_fields = ["state"]

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "Must be after the start date."})
        return attrs


class IssueSerializer(serializers.ModelSerializer):
    key = serializers.CharField(read_only=True)
    project = WorkspaceRelatedField(queryset=Project.objects.all())
    status = WorkspaceRelatedField(queryset=Status.objects.all(), required=False)
    sprint = WorkspaceRelatedField(queryset=Sprint.objects.all(), required=False, allow_null=True)
    assignee = MemberField(required=False, allow_null=True)
    assignee_detail = MemberUserSerializer(source="assignee", read_only=True)
    reporter = MemberUserSerializer(read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "key",
            "project",
            "number",
            "title",
            "description",
            "type",
            "priority",
            "status",
            "sprint",
            "assignee",
            "assignee_detail",
            "reporter",
            "story_points",
            "rank",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["number", "rank", "created_at", "updated_at"]

    def validate(self, attrs):
        project = attrs.get("project", getattr(self.instance, "project", None))
        if self.instance and "project" in attrs and attrs["project"] != self.instance.project:
            raise serializers.ValidationError({"project": "Issues can't be moved between projects."})

        status = attrs.get("status")
        if status is None and not self.instance:
            attrs["status"] = project.statuses.order_by("order").first()
        elif status is not None and status.project_id != project.id:
            raise serializers.ValidationError({"status": "Status belongs to another project."})
        elif (
            status is not None and self.instance and not transition_allowed(project, self.instance.status_id, status.id)
        ):
            raise serializers.ValidationError(
                {"status": f"The workflow doesn't allow moving from {self.instance.status.name} to {status.name}."}
            )

        sprint = attrs.get("sprint")
        if sprint is not None and sprint.project_id != project.id:
            raise serializers.ValidationError({"sprint": "Sprint belongs to another project."})
        if sprint is not None and sprint.state == Sprint.State.CLOSED:
            raise serializers.ValidationError({"sprint": "Sprint is closed."})
        return attrs

    def update(self, instance, validated_data):
        # write only the fields this request changed: the drawer fires a PATCH per field, and saving the
        # whole row let a slower request put back a value another one had just changed
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        return instance


class IssueMoveSerializer(serializers.Serializer):
    status = WorkspaceRelatedField(queryset=Status.objects.all())
    before = WorkspaceRelatedField(queryset=Issue.objects.all(), required=False, allow_null=True)
    after = WorkspaceRelatedField(queryset=Issue.objects.all(), required=False, allow_null=True)

    def validate(self, attrs):
        issue = self.context["issue"]
        if attrs["status"].project_id != issue.project_id:
            raise serializers.ValidationError({"status": "Status belongs to another project."})
        for side in ("before", "after"):
            neighbour = attrs.get(side)
            if neighbour and (neighbour.status_id != attrs["status"].id or neighbour.pk == issue.pk):
                raise serializers.ValidationError({side: "Must be another issue in the target column."})
        return attrs


class SprintCompleteSerializer(serializers.Serializer):
    move_to = WorkspaceRelatedField(queryset=Sprint.objects.all(), required=False, allow_null=True)
