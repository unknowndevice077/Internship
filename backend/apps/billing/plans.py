from dataclasses import asdict, dataclass

UNLIMITED = None


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    price_usd: int
    lookup_key: str | None
    max_projects: int | None
    max_members: int | None
    max_storage_mb: int | None
    webhooks: bool
    features: tuple[str, ...]

    def as_dict(self):
        return asdict(self)


PLANS = {
    "free": Plan(
        code="free", name="Free", price_usd=0, lookup_key=None,
        max_projects=3, max_members=5, max_storage_mb=100, webhooks=False,
        features=("Kanban, backlog and sprints", "Custom workflows", "3 projects", "5 members"),
    ),
    "pro": Plan(
        code="pro", name="Pro", price_usd=29, lookup_key="sprintboard_pro_monthly",
        max_projects=25, max_members=25, max_storage_mb=5_000, webhooks=True,
        features=("Everything in Free", "Webhooks", "25 projects", "25 members", "5 GB storage"),
    ),
    "business": Plan(
        code="business", name="Business", price_usd=99, lookup_key="sprintboard_business_monthly",
        max_projects=UNLIMITED, max_members=UNLIMITED, max_storage_mb=50_000, webhooks=True,
        features=("Everything in Pro", "Unlimited projects", "Unlimited members", "50 GB storage"),
    ),
}

PAID_PLANS = {code: plan for code, plan in PLANS.items() if plan.lookup_key}


def plan_for(workspace):
    return PLANS.get(workspace.plan, PLANS["free"])


def plan_by_lookup_key(key):
    return next((p for p in PAID_PLANS.values() if p.lookup_key == key), None)
