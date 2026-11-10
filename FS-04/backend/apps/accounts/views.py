from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from . import lockout, sessions, tasks, tokens, twofactor
from .models import User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    MeSerializer,
    OtpRequired,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    TwoFactorCodeSerializer,
    TwoFactorDisableSerializer,
    VerifyEmailSerializer,
    tokens_for,
)

NO_CONTENT = {204: None}


class AuthThrottleMixin:
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class LoginView(AuthThrottleMixin, TokenObtainPairView):
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        email = str(request.data.get("email", "")).strip().lower()
        ip = BaseThrottle().get_ident(request)
        if lockout.is_locked(email, ip):
            minutes = settings.LOGIN_LOCKOUT_SECONDS // 60
            return Response(
                {"detail": f"Too many failed attempts. Try again in {minutes} minutes.", "code": "locked"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed as exc:
            # asking for the code isn't a failure
            if not isinstance(exc, OtpRequired):
                lockout.record_failure(email, ip)
            raise
        lockout.clear(email, ip)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=inline_serializer("LogoutBody", {"refresh": serializers.CharField()}), responses=NO_CONTENT)
    def post(self, request):
        try:
            RefreshToken(request.data.get("refresh", "")).blacklist()
        except TokenError:
            # already expired or revoked, which is the state we want anyway
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(AuthThrottleMixin, generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        transaction.on_commit(lambda: tasks.send_verification_email.delay(user.pk))
        body = {"user": MeSerializer(user).data, **tokens_for(user)}
        return Response(body, status=status.HTTP_201_CREATED)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(AuthThrottleMixin, APIView):
    @extend_schema(request=ChangePasswordSerializer, responses={200: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        # every other device is signed out; this one gets fresh tokens
        sessions.revoke_all(request.user)
        return Response(tokens_for(request.user))


class TwoFactorSetupView(AuthThrottleMixin, APIView):
    @extend_schema(request=None, responses={200: None})
    def post(self, request):
        if request.user.totp_enabled:
            raise ValidationError({"detail": "Two-factor authentication is already on."})
        secret = twofactor.new_secret()
        twofactor.store_secret(request.user, secret)
        return Response({"secret": secret, "otpauth_url": twofactor.provisioning_url(request.user, secret)})


class TwoFactorEnableView(AuthThrottleMixin, APIView):
    @extend_schema(request=TwoFactorCodeSerializer, responses={200: None})
    def post(self, request):
        serializer = TwoFactorCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if user.totp_enabled or not user.totp_secret:
            raise ValidationError({"detail": "Start the setup first."})
        if not twofactor.verify_totp(user, serializer.validated_data["code"].strip()):
            raise ValidationError({"code": "That code didn't match. Check the time on your phone and try again."})
        user.totp_enabled = True
        user.save(update_fields=["totp_enabled"])
        return Response({"recovery_codes": twofactor.make_recovery_codes(user)})


class TwoFactorDisableView(AuthThrottleMixin, APIView):
    @extend_schema(request=TwoFactorDisableSerializer, responses=NO_CONTENT)
    def post(self, request):
        serializer = TwoFactorDisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.totp_enabled:
            raise ValidationError({"detail": "Two-factor authentication is off."})
        if not user.check_password(serializer.validated_data["password"]):
            raise ValidationError({"password": "That isn't your password."})
        if not twofactor.check(user, serializer.validated_data["code"]):
            raise ValidationError({"code": "That code didn't work."})
        user.totp_enabled = False
        user.totp_secret = ""
        user.totp_last_step = 0
        user.recovery_hashes = []
        user.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=PasswordResetRequestSerializer, responses=NO_CONTENT)
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"]).first()
        if user:
            tasks.send_password_reset_email.delay(user.pk)
        # same response either way so this can't be used to find accounts
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=PasswordResetConfirmSerializer, responses=NO_CONTENT)
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["password"])
        # the link proves they own the inbox
        user.email_verified_at = user.email_verified_at or timezone.now()
        user.save(update_fields=["password", "email_verified_at"])
        sessions.revoke_all(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class VerifyEmailView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=VerifyEmailSerializer, responses=NO_CONTENT)
    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = tokens.user_from_verify(serializer.validated_data["token"])
        if user is None:
            return Response({"token": ["This link is invalid or has expired."]}, status=status.HTTP_400_BAD_REQUEST)
        if not user.email_verified:
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResendVerificationView(AuthThrottleMixin, APIView):
    @extend_schema(request=None, responses=NO_CONTENT)
    def post(self, request):
        if not request.user.email_verified:
            tasks.send_verification_email.delay(request.user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
