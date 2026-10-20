import re

from django.conf import settings
from rest_framework import serializers

from apps.projects.models import Issue
from apps.tenancy.fields import WorkspaceRelatedField
from apps.tenancy.serializers import MemberUserSerializer

from .models import Attachment, AuditLog, Comment

MENTION_RE = re.compile(r"@([\w.+-]+@[\w-]+(?:\.[\w-]+)+)")


def mentioned_emails(text):
    return {m.lower() for m in MENTION_RE.findall(text or "")}


class CommentSerializer(serializers.ModelSerializer):
    issue = WorkspaceRelatedField(queryset=Issue.objects.all())
    author = MemberUserSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "issue", "author", "body", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate(self, attrs):
        if self.instance and "issue" in attrs and attrs["issue"] != self.instance.issue:
            raise serializers.ValidationError({"issue": "Comments can't be moved to another issue."})
        return attrs


class AttachmentSerializer(serializers.ModelSerializer):
    issue = WorkspaceRelatedField(queryset=Issue.objects.all())
    uploaded_by = MemberUserSerializer(read_only=True)
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "issue", "file", "name", "size", "content_type", "uploaded_by", "download_url", "created_at"]
        read_only_fields = ["name", "size", "content_type", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def get_download_url(self, obj) -> str:
        return f"/api/attachments/{obj.id}/download/"

    def validate_file(self, f):
        limit = settings.MAX_ATTACHMENT_MB * 1024 * 1024
        if f.size > limit:
            raise serializers.ValidationError(f"Files can be at most {settings.MAX_ATTACHMENT_MB} MB.")
        return f

    def create(self, validated_data):
        f = validated_data["file"]
        validated_data.update(name=f.name[:255], size=f.size, content_type=getattr(f, "content_type", "") or "")
        return super().create(validated_data)


class AuditLogSerializer(serializers.ModelSerializer):
    actor = MemberUserSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "actor", "action", "entity_type", "entity_id", "entity_label", "changes", "issue", "created_at"]
