from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [('core', '0005_production_inventory')]

    operations = [
        migrations.CreateModel(
            name='CashMovement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type', models.CharField(choices=[('income', 'Entrada'), ('expense', 'Saída')], max_length=10)),
                ('category', models.CharField(max_length=100)),
                ('description', models.CharField(blank=True, max_length=255)),
                ('amount', models.FloatField()),
                ('occurred_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['-occurred_at', '-id']},
        ),
    ]
