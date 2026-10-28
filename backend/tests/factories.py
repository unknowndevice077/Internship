import factory
from django.utils import timezone

from apps.accounts.models import User
from apps.projects.models import Issue, Project
from apps.tenancy.models import Membership, Workspace


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker("name")
    email_verified_at = factory.LazyFunction(timezone.now)

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):
        obj.set_password(extracted or "pass12345!")
        if create:
            obj.save(update_fields=["password"])


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
