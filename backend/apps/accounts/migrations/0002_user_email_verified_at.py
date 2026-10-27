from django.db import migrations, models
from django.db.models import F


def mark_existing_verified(apps, schema_editor):
    # accounts from before verification existed shouldn't suddenly show the banner
    User = apps.get_model("accounts", "User")
    User.objects.filter(email_verified_at__isnull=True).update(email_verified_at=F("date_joined"))


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(mark_existing_verified, migrations.RunPython.noop),
    ]
