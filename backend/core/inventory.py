"""Regras de estoque de insumos: consumo médio, cobertura e registro de movimentações."""

import math
from collections import defaultdict
from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone

from .models import Ingredient, ProductionBatch, ProductionConsumption, RecipeItem, StockMovement

USAGE_WINDOW_DAYS = 30
COVERAGE_TARGET_DAYS = 14
COVERAGE_ALERT_DAYS = 7


def daily_usage_map(days=USAGE_WINDOW_DAYS):
    """Consumo médio diário por insumo, a partir dos lotes concluídos no período."""
    since = timezone.now() - timedelta(days=days)
    rows = (ProductionConsumption.objects
            .filter(batch__status='completed', batch__produced_at__gte=since)
            .values('ingredient_id').annotate(total=Sum('quantity')))
    return {row['ingredient_id']: (row['total'] or 0) / days for row in rows}


def planned_requirements():
    """Quantidade de cada insumo que os lotes planejados/em produção ainda vão consumir."""
    required = defaultdict(float)
    pending = ProductionBatch.objects.exclude(status='completed').values('product_id', 'quantity')
    by_product = defaultdict(int)
    for batch in pending:
        by_product[batch['product_id']] += batch['quantity']
    if not by_product:
        return required
    for item in RecipeItem.objects.filter(product_id__in=by_product).values('product_id', 'ingredient_id', 'quantity'):
        required[item['ingredient_id']] += item['quantity'] * by_product[item['product_id']]
    return required


def products_using_map():
    rows = RecipeItem.objects.filter(product__active=True).values('ingredient_id').annotate(total=Count('id'))
    return {row['ingredient_id']: row['total'] for row in rows}


def ingredient_context():
    """Contexto calculado uma única vez para serializar a lista de insumos."""
    return {
        'daily_usage': daily_usage_map(),
        'planned': planned_requirements(),
        'products_using': products_using_map(),
    }


def stock_status(ingredient, daily_usage=0):
    if ingredient.stock <= 0:
        return 'out'
    if ingredient.stock <= ingredient.min_stock:
        return 'low'
    if daily_usage and ingredient.stock / daily_usage < COVERAGE_ALERT_DAYS:
        return 'low'
    return 'ok'


def suggested_purchase(ingredient, daily_usage=0, planned=0):
    """Quanto comprar para voltar a ter COVERAGE_TARGET_DAYS dias de cobertura além do planejado.

    Arredonda para embalagens inteiras (quantidade da última compra)."""
    target = max(ingredient.min_stock * 2, daily_usage * COVERAGE_TARGET_DAYS) + planned
    missing = target - ingredient.stock
    if missing <= 0:
        return None
    pack = ingredient.purchase_quantity or 1
    packs = math.ceil(missing / pack)
    return {
        'packs': packs,
        'quantity': packs * pack,
        'estimated_cost': packs * ingredient.purchase_price,
    }


def record_movement(ingredient, movement_type, quantity, *, occurred_at=None, user=None, **extra):
    """Altera o estoque e grava a movimentação. `ingredient` deve estar bloqueado (select_for_update)."""
    ingredient.stock = round(ingredient.stock + quantity, 6)
    fields = ['stock']
    if movement_type == StockMovement.PURCHASE:
        ingredient.last_purchase_at = occurred_at or timezone.now()
        fields.append('last_purchase_at')
    ingredient.save(update_fields=fields)
    return StockMovement.objects.create(
        ingredient=ingredient, type=movement_type, quantity=quantity, stock_after=ingredient.stock,
        occurred_at=occurred_at or timezone.now(), created_by=user if user and user.is_authenticated else None,
        **extra,
    )


def lock_ingredients(ids):
    return list(Ingredient.objects.select_for_update().filter(pk__in=ids).order_by('pk'))
