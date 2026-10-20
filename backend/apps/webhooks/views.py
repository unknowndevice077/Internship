from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.tenancy.models import Role
from apps.tenancy.views import TenantViewSet

from .models import EVENTS, WebhookDelivery, WebhookEndpoint
from .serializers import WebhookDeliverySerializer, WebhookEndpointSerializer
from .tasks import deliver_webhook


class WebhookEndpointViewSet(TenantViewSet):
    queryset = WebhookEndpoint.objects.all()
    serializer_class = WebhookEndpointSerializer
    read_role = Role.ADMIN
    write_role = Role.ADMIN
    pagination_class = None
    audited = False

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        endpoint = self.perform_create(serializer)
        data = self.get_serializer(endpoint, context={**self.get_serializer_context(), "show_secret": True}).data
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def events(self, request):
        return Response(EVENTS)

    @action(detail=True, methods=["get"])
    def deliveries(self, request, pk=None):
        endpoint = self.get_object()
        page = endpoint.deliveries.all()[:50]
        return Response(WebhookDeliverySerializer(page, many=True).data)

    @action(detail=True, methods=["post"])
    def ping(self, request, pk=None):
        endpoint = self.get_object()
        delivery = WebhookDelivery.objects.create(
            workspace=request.workspace,
            endpoint=endpoint,
            event="ping",
            payload={"event": "ping", "workspace": request.workspace.slug, "sent_at": timezone.now().isoformat()},
        )
        deliver_webhook.delay(delivery.id)
        return Response(WebhookDeliverySerializer(delivery).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"], url_path=r"deliveries/(?P<delivery_id>\d+)/redeliver")
    def redeliver(self, request, pk=None, delivery_id=None):
        endpoint = self.get_object()
        original = get_object_or_404(endpoint.deliveries, pk=delivery_id)
        delivery = WebhookDelivery.objects.create(
            workspace=request.workspace, endpoint=endpoint, event=original.event, payload=original.payload
        )
        deliver_webhook.delay(delivery.id)
        return Response(WebhookDeliverySerializer(delivery).data, status=status.HTTP_202_ACCEPTED)
