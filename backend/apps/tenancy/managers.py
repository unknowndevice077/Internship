from django.db import models


class TenantQuerySet(models.QuerySet):
    def for_workspace(self, workspace):
        return self.filter(workspace=workspace)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    pass


# Every tenant-owned table extends this. Always query through
# .for_workspace() so data from other workspaces can't leak.
class TenantModel(models.Model):
    workspace = models.ForeignKey(
        "tenancy.Workspace", on_delete=models.CASCADE, related_name="+", db_index=True
    )

    objects = TenantManager()

    class Meta:
        abstract = True
