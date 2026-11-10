from django.db import migrations, models
from django.db.models import F


def backfill(apps, schema_editor):
    # best guess for issues finished before the column existed
    Issue = apps.get_model("projects", "Issue")
    Issue.objects.filter(status__category="done").update(completed_at=F("updated_at"))


class Migration(migrations.Migration):
    dependencies = [("projects", "0004_hardening")]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="completed_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
