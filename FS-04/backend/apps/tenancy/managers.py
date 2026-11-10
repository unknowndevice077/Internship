from django.db import models


class TenantQuerySet(models.QuerySet):
    def for_workspace(self, workspace):
        return self.filter(workspace=workspace)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    pass


# Base for tenant-owned models. Query through .for_workspace().
class TenantModel(models.Model):
    workspace = models.ForeignKey("tenancy.Workspace", on_delete=models.CASCADE, related_name="+", db_index=True)

    objects = TenantManager()

    class Meta:
        abstract = True
