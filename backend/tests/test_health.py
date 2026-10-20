import pytest

pytestmark = pytest.mark.django_db


def test_health_reports_database_and_redis(client):
    res = client.get("/api/health/")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok", "redis": "ok"}


def test_health_degrades_when_redis_is_down(client, settings):
    settings.REDIS_URL = "redis://localhost:1/0"
    res = client.get("/api/health/")
    assert res.status_code == 503
    assert res.json()["redis"].startswith("error")
