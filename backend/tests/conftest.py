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
