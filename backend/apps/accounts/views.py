from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from . import tasks, tokens
from .models import User
from .serializers import (
    MeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    VerifyEmailSerializer,
    tokens_for,
)


class AuthThrottleMixin:
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class LoginView(AuthThrottleMixin, TokenObtainPairView):
    pass


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


class PasswordResetRequestView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=PasswordResetRequestSerializer, responses={204: None})
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

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["password"])
        # the link proves they own the inbox
        user.email_verified_at = user.email_verified_at or timezone.now()
        user.save(update_fields=["password", "email_verified_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class VerifyEmailView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=VerifyEmailSerializer, responses={204: None})
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
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        if not request.user.email_verified:
            tasks.send_verification_email.delay(request.user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
