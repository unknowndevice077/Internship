import pytest

pytestmark = pytest.mark.django_db


def test_health_reports_database_and_redis(client):
    res = client.get("/api/health/")
    assert res.status_code == 200
    body = res.json()
    assert (body["status"], body["database"], body["redis"]) == ("ok", "ok", "ok")
    # no worker is running under test
    assert body["worker"] == "no heartbeat"


def test_health_says_inline_when_jobs_run_in_the_api(client, settings):
    settings.INLINE_TASKS = True
    assert client.get("/api/health/").json()["worker"] == "inline"


def test_health_degrades_when_redis_is_down(client, settings):
    settings.REDIS_URL = "redis://localhost:1/0"
    res = client.get("/api/health/")
    assert res.status_code == 503
    assert res.json()["redis"].startswith("error")
