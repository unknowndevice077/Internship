from rest_framework import serializers

from .models import EVENTS, WebhookDelivery, WebhookEndpoint
from .signing import UnsafeURL, check_url


class WebhookEndpointSerializer(serializers.ModelSerializer):
    events = serializers.ListField(child=serializers.ChoiceField(choices=EVENTS), required=False)
    stats = serializers.SerializerMethodField()

    class Meta:
        model = WebhookEndpoint
        fields = ["id", "url", "description", "events", "is_active", "secret", "stats", "created_at"]
        read_only_fields = ["secret", "created_at"]

    def validate_url(self, value):
        try:
            check_url(value)
        except UnsafeURL as exc:
            raise serializers.ValidationError(str(exc))
        return value

    def get_stats(self, obj) -> dict:
        recent = list(obj.deliveries.values_list("state", flat=True)[:50])
        return {
            "recent": len(recent),
            "failed": recent.count(WebhookDelivery.State.FAILED),
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # the secret is only shown once, right after creation
        if not self.context.get("show_secret"):
            data["secret"] = instance.secret[:6] + "…"
        return data


class WebhookDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookDelivery
        fields = [
            "id", "event", "payload", "state", "attempts", "response_code", "response_body",
            "last_error", "duration_ms", "created_at", "delivered_at",
        ]
