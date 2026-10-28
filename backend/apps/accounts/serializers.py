from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.tenancy.models import Membership
from apps.tenancy.serializers import create_workspace

from . import tokens, twofactor

User = get_user_model()


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    workspace_name = serializers.CharField(max_length=120, required=False)

    def validate_email(self, value):
        value = value.lower()
        existing = User.objects.filter(email__iexact=value).first()
        # an invited placeholder (no usable password) can still be claimed
        if existing and existing.has_usable_password():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        invited = User.objects.filter(email=attrs["email"]).exists()
        if not invited and not attrs.get("workspace_name"):
            raise serializers.ValidationError({"workspace_name": "Required when you weren't invited."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user = User.objects.filter(email=validated_data["email"]).first() or User(email=validated_data["email"])
        user.full_name = validated_data.get("full_name", "")
        user.set_password(validated_data["password"])
        user.save()
        if validated_data.get("workspace_name"):
            create_workspace(validated_data["workspace_name"], user)
        return user


class OtpRequired(AuthenticationFailed):
    def __init__(self):
        super().__init__({"detail": "Enter the 6-digit code from your authenticator app.", "code": "otp_required"})


class LoginSerializer(TokenObtainPairSerializer):
    otp = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        user = authenticate(self.context.get("request"), email=attrs["email"], password=attrs["password"])
        if user is None or not user.is_active:
            raise AuthenticationFailed(
                {"detail": self.error_messages["no_active_account"], "code": "no_active_account"}
            )
        # check the second factor before any token exists
        if user.totp_enabled:
            if not attrs.get("otp"):
                raise OtpRequired()
            if not twofactor.check(user, attrs["otp"]):
                raise AuthenticationFailed({"detail": "That code didn't work.", "code": "invalid_otp"})
        self.user = user
        refresh = self.get_token(user)
        return {"refresh": str(refresh), "access": str(refresh.access_token)}


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("That isn't your current password.")
        return value

    def validate_new_password(self, value):
        try:
            validate_password(value, self.context["request"].user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages)) from e
        return value


class TwoFactorCodeSerializer(serializers.Serializer):
    code = serializers.CharField()


class TwoFactorDisableSerializer(TwoFactorCodeSerializer):
    password = serializers.CharField(write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = tokens.user_from_reset(attrs["uid"], attrs["token"])
        if user is None:
            raise serializers.ValidationError({"token": "This reset link is invalid or has expired."})
        try:
            validate_password(attrs["password"], user)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)}) from e
        attrs["user"] = user
        return attrs


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class MembershipBriefSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source="workspace.slug")
    name = serializers.CharField(source="workspace.name")
    plan = serializers.CharField(source="workspace.plan")

    class Meta:
        model = Membership
        fields = ["slug", "name", "plan", "role"]


class MeSerializer(serializers.ModelSerializer):
    email_verified = serializers.BooleanField(read_only=True)
    totp_enabled = serializers.BooleanField(read_only=True)
    workspaces = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "email_verified", "totp_enabled", "workspaces"]
        read_only_fields = ["email"]

    def get_workspaces(self, obj) -> list[dict]:
        memberships = obj.memberships.select_related("workspace").order_by("workspace__name")
        return MembershipBriefSerializer(memberships, many=True).data
