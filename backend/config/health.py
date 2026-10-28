import time

import redis
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse


def health(request):
    checks = {}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc.__class__.__name__}"
    try:
        redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1).ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc.__class__.__name__}"
    healthy = all(v == "ok" for v in checks.values())
    # informational: a stopped worker doesn't make the API unhealthy
    beat = cache.get("worker:heartbeat")
    worker = "ok" if beat and time.time() - beat < 180 else "no heartbeat"
    status = {"status": "ok" if healthy else "degraded", **checks, "worker": worker}
    return JsonResponse(status, status=200 if healthy else 503)
