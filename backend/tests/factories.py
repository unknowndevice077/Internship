import factory

from apps.accounts.models import User
from apps.projects.models import Issue, Project
from apps.tenancy.models import Membership, Workspace


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker("name")
    password = factory.PostGenerationMethodCall("set_password", "pass12345!")


class WorkspaceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Workspace

    name = factory.Faker("company")
    slug = factory.Sequence(lambda n: f"ws-{n}")


class MembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Membership

    user = factory.SubFactory(UserFactory)
    workspace = factory.SubFactory(WorkspaceFactory)
    role = "member"


class ProjectFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Project

    workspace = factory.SubFactory(WorkspaceFactory)
    name = factory.Faker("catch_phrase")
    key = factory.Sequence(lambda n: f"P{n}")


class IssueFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Issue

    project = factory.SubFactory(ProjectFactory)
    workspace = factory.SelfAttribute("project.workspace")
    status = factory.LazyAttribute(lambda o: o.project.statuses.first())
    title = factory.Faker("sentence", nb_words=6)
