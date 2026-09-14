from django.contrib.auth.hashers import make_password
from django.db import migrations


def secure_unknown_passwords(apps, schema_editor):
    User = apps.get_model('core', 'User')
    demo_emails = {
        'admin@rosascandy.com',
        'vendedor@rosascandy.com',
        'produtor@rosascandy.com',
    }
    for user in User.objects.exclude(email__in=demo_emails):
        user.password = make_password(None)
        user.save(update_fields=['password'])


class Migration(migrations.Migration):
    dependencies = [('core', '0002_import_legacy_data')]
    operations = [migrations.RunPython(secure_unknown_passwords, migrations.RunPython.noop)]
