from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers

from .models import Membership, Role, Workspace

User = get_user_model()


def unique_slug(name):
    base = slugify(name)[:50] or "workspace"
    slug, n = base, 1
    while Workspace.objects.filter(slug=slug).exists():
        n += 1
        slug = f"{base}-{n}"
    return slug


def create_workspace(name, owner):
    workspace = Workspace.objects.create(name=name, slug=unique_slug(name))
    Membership.objects.create(user=owner, workspace=workspace, role=Role.OWNER)
    return workspace


class WorkspaceSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "plan", "role", "created_at"]
        read_only_fields = ["slug", "plan", "created_at"]

    def get_role(self, obj) -> str | None:
        if hasattr(obj, "my_role"):
            return obj.my_role
        user = self.context["request"].user
        membership = obj.memberships.filter(user=user).first()
        return membership.role if membership else None


class WorkspaceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "slug"]
        read_only_fields = ["slug"]

    @transaction.atomic
    def create(self, validated_data):
        return create_workspace(validated_data["name"], self.context["request"].user)


class MemberUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "full_name"]


class MembershipSerializer(serializers.ModelSerializer):
    user = MemberUserSerializer(read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "user", "role", "joined_at"]
        read_only_fields = ["joined_at"]


class MemberInviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=[r for r in Role.values if r != Role.OWNER], default=Role.MEMBER)

    def validate_email(self, value):
        workspace = self.context["request"].workspace
        if Membership.objects.filter(workspace=workspace, user__email__iexact=value).exists():
            raise serializers.ValidationError("Already a member.")
        return value.lower()

    def create(self, validated_data):
        # people without an account get a placeholder user; registering with the same email claims it
        user, created = User.objects.get_or_create(email=validated_data["email"])
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        return Membership.objects.create(
            user=user, workspace=self.context["request"].workspace, role=validated_data["role"]
        )

    def to_representation(self, instance):
        return MembershipSerializer(instance, context=self.context).data
