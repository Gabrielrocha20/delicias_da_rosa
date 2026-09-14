from django.contrib.auth.hashers import make_password
from django.db import migrations


def rows(cursor, table):
    cursor.execute(f'SELECT * FROM "{table}"')
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, values)) for values in cursor.fetchall()]


def import_legacy(apps, schema_editor):
    connection = schema_editor.connection
    tables = set(connection.introspection.table_names())
    if 'users' not in tables or 'products' not in tables:
        return

    User = apps.get_model('core', 'User')
    Person = apps.get_model('core', 'Person')
    Ingredient = apps.get_model('core', 'Ingredient')
    Product = apps.get_model('core', 'Product')
    RecipeItem = apps.get_model('core', 'RecipeItem')
    ProductionBatch = apps.get_model('core', 'ProductionBatch')
    Establishment = apps.get_model('core', 'Establishment')
    EstablishmentProduct = apps.get_model('core', 'EstablishmentProduct')
    Sale = apps.get_model('core', 'Sale')
    if User.objects.exists() or Product.objects.exists():
        return

    with connection.cursor() as cursor:
        for item in rows(cursor, 'people'):
            Person.objects.create(
                id=item['id'], name=item['name'], type=item['type'], phone=item.get('phone') or '',
                email=item.get('email') or '', commission=item.get('commission') or 0,
                active=bool(item.get('active', 1)),
            )

        for item in rows(cursor, 'ingredients'):
            Ingredient.objects.create(
                id=item['id'], name=item['name'], category=item.get('category') or 'Ingredientes',
                purchase_price=item.get('purchase_price') or 0,
                purchase_quantity=item.get('purchase_quantity') or 1, unit=item.get('unit') or 'g',
                stock=item.get('stock') or 0, min_stock=item.get('min_stock') or 0,
            )

        for item in rows(cursor, 'products'):
            Product.objects.create(
                id=item['id'], name=item['name'], category=item.get('category') or 'Bolo de pote',
                sale_price=item.get('sale_price') or 0, packaging_cost=item.get('packaging_cost') or 0,
                other_cost=item.get('other_cost') or 0, sales_fee=item.get('sales_fee') or 0,
                seller_commission=item.get('seller_commission') or 0,
                producer_commission=item.get('producer_commission') or 0,
                cash_percentage=item.get('cash_percentage', 20), active=bool(item.get('active', 1)),
            )

        for item in rows(cursor, 'recipe_items'):
            RecipeItem.objects.create(
                id=item['id'], product_id=item['product_id'], ingredient_id=item['ingredient_id'],
                quantity=item.get('quantity') or 0,
            )

        if 'establishments' in tables:
            for item in rows(cursor, 'establishments'):
                Establishment.objects.create(
                    id=item['id'], name=item['name'], contact_name=item.get('contact_name') or '',
                    phone=item.get('phone') or '', address=item.get('address') or '',
                    active=bool(item.get('active', 1)),
                )

        if 'establishment_products' in tables:
            for item in rows(cursor, 'establishment_products'):
                EstablishmentProduct.objects.create(
                    id=item['id'], establishment_id=item['establishment_id'], product_id=item['product_id'],
                    commission=item.get('commission') or 0, active=bool(item.get('active', 1)),
                )

        for item in rows(cursor, 'production_batches'):
            ProductionBatch.objects.create(
                id=item['id'], product_id=item['product_id'], producer_id=item.get('producer_id'),
                quantity=item['quantity'], status=item.get('status') or 'planned',
                produced_at=item['produced_at'], notes=item.get('notes') or '',
            )

        for item in rows(cursor, 'sales'):
            Sale.objects.create(
                id=item['id'], product_id=item['product_id'], seller_id=item.get('seller_id'),
                producer_id=item.get('producer_id'), establishment_id=item.get('establishment_id'),
                partner_commission=item.get('partner_commission') or 0, quantity=item['quantity'],
                unit_price=item['unit_price'], channel=item.get('channel') or 'Direto',
                status=item.get('status') or 'paid', sold_at=item['sold_at'],
            )

        demo_passwords = {
            'admin@rosascandy.com': 'admin123',
            'vendedor@rosascandy.com': 'vendedor123',
            'produtor@rosascandy.com': 'produtor123',
        }
        for item in rows(cursor, 'users'):
            email = (item.get('email') or '').lower()
            is_admin = item.get('role') == 'admin'
            User.objects.create(
                id=item['id'], username=email, display_name=item.get('name') or email,
                email=email, role=item.get('role') or 'admin', person_id=item.get('person_id'),
                is_active=bool(item.get('active', 1)), is_staff=is_admin, is_superuser=is_admin,
                password=make_password(demo_passwords[email]) if email in demo_passwords else make_password(None),
            )


class Migration(migrations.Migration):
    dependencies = [('core', '0001_initial')]
    operations = [migrations.RunPython(import_legacy, migrations.RunPython.noop)]
