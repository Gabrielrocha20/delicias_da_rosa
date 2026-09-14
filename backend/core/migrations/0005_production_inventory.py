from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_seed_fresh_database'),
    ]

    operations = [
        migrations.AddField(
            model_name='productionbatch',
            name='ingredients_consumed',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='ProductionConsumption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.FloatField()),
                ('batch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='consumptions', to='core.productionbatch')),
                ('ingredient', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='production_consumptions', to='core.ingredient')),
            ],
        ),
        migrations.AddConstraint(
            model_name='productionconsumption',
            constraint=models.UniqueConstraint(fields=('batch', 'ingredient'), name='unique_batch_ingredient_consumption'),
        ),
    ]
