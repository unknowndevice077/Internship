import pytest
from rest_framework.test import APIClient

from tests.factories import MembershipFactory, ProjectFactory


class WorkspaceClient(APIClient):
    def as_member(self, membership):
        self.force_authenticate(membership.user)
        self.credentials(HTTP_X_WORKSPACE=membership.workspace.slug)
        return self


@pytest.fixture
def api():
    return WorkspaceClient()


@pytest.fixture
def owner(db):
    return MembershipFactory(role="owner")


@pytest.fixture
def project(owner):
    return ProjectFactory(workspace=owner.workspace, key="WEB")


@pytest.fixture
def member_of():
    def make(workspace, role="member"):
        return MembershipFactory(workspace=workspace, role=role)

    return make


@pytest.fixture(autouse=True)
def test_settings(settings, tmp_path):
    # run celery tasks inline
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
    settings.MEDIA_ROOT = tmp_path
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
