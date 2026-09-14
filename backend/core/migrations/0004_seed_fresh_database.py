from django.contrib.auth.hashers import make_password
from django.db import migrations


def seed_fresh_database(apps, schema_editor):
    User = apps.get_model('core', 'User')
    if User.objects.exists():
        return
    Person = apps.get_model('core', 'Person')
    Ingredient = apps.get_model('core', 'Ingredient')
    Product = apps.get_model('core', 'Product')
    RecipeItem = apps.get_model('core', 'RecipeItem')

    seller = Person.objects.create(name='Vendedor Demo', type='seller', email='vendedor@rosascandy.com', commission=15)
    producer = Person.objects.create(name='Produtor Demo', type='producer', email='produtor@rosascandy.com', commission=15)
    accounts = [
        ('Rosa Admin', 'admin@rosascandy.com', 'admin123', 'admin', None),
        (seller.name, 'vendedor@rosascandy.com', 'vendedor123', 'seller', seller),
        (producer.name, 'produtor@rosascandy.com', 'produtor123', 'producer', producer),
    ]
    for name, email, password, role, person in accounts:
        is_admin = role == 'admin'
        User.objects.create(
            username=email, display_name=name, email=email, password=make_password(password), role=role,
            person=person, is_active=True, is_staff=is_admin, is_superuser=is_admin,
        )

    ingredients = [
        Ingredient.objects.create(name='Leite condensado', category='Laticínios', purchase_price=6.49, purchase_quantity=395, unit='g', stock=6320, min_stock=1580),
        Ingredient.objects.create(name='Creme de leite', category='Laticínios', purchase_price=3.29, purchase_quantity=200, unit='g', stock=3200, min_stock=800),
        Ingredient.objects.create(name='Chocolate 50%', category='Chocolates', purchase_price=18.90, purchase_quantity=500, unit='g', stock=2300, min_stock=500),
    ]
    product = Product.objects.create(
        name='Brigadeiro intenso', category='Bolo de pote', sale_price=14, packaging_cost=.76,
        other_cost=.35, sales_fee=3.5, seller_commission=15, producer_commission=15, cash_percentage=20,
    )
    for ingredient, quantity in zip(ingredients, [42, 28, 18]):
        RecipeItem.objects.create(product=product, ingredient=ingredient, quantity=quantity)


class Migration(migrations.Migration):
    dependencies = [('core', '0003_secure_legacy_passwords')]
    operations = [migrations.RunPython(seed_fresh_database, migrations.RunPython.noop)]
