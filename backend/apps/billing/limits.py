from django.db.models import Sum
from rest_framework import status
from rest_framework.exceptions import APIException

from .plans import plan_for

LABELS = {"projects": "projects", "members": "members", "storage_mb": "MB of storage"}


class PlanLimitReached(APIException):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_code = "plan_limit"

    def __init__(self, message, resource, limit=None):
        detail = {"detail": message, "code": "plan_limit", "resource": resource}
        if limit is not None:
            detail["limit"] = limit
        super().__init__(detail)


def usage(workspace):
    from apps.activity.models import Attachment
    from apps.projects.models import Project
    from apps.tenancy.models import Membership

    storage = Attachment.objects.filter(workspace=workspace).aggregate(total=Sum("size"))["total"] or 0
    return {
        "projects": Project.objects.filter(workspace=workspace).count(),
        "members": Membership.objects.filter(workspace=workspace).count(),
        "storage_mb": round(storage / 1024 / 1024, 2),
    }


def check_feature(workspace, feature):
    plan = plan_for(workspace)
    if not getattr(plan, feature):
        raise PlanLimitReached(
            f"{feature.capitalize()} aren't included in the {plan.name} plan. Upgrade to use them.", feature
        )


def check(workspace, resource, adding=1):
    plan = plan_for(workspace)
    limit = getattr(plan, f"max_{resource}")
    if limit is None:
        return
    if usage(workspace)[resource] + adding > limit:
        label = LABELS[resource]
        raise PlanLimitReached(f"Your {plan.name} plan allows {limit} {label}. Upgrade to add more.", label, limit)
