"""Assistente da Doces Mivi.

`insights(user)` lê os cadastros e devolve recomendações práticas calculadas por regras
(sempre disponível, sem custo). `ask(user, question, history)` responde perguntas livres
com o Claude quando ANTHROPIC_API_KEY estiver configurada no servidor.
"""

import json
import logging
import math
import os
from collections import defaultdict
from datetime import timedelta

from django.db.models import F, Sum
from django.utils import timezone

from .inventory import (COVERAGE_ALERT_DAYS, daily_usage_map, planned_requirements, stock_status,
                        suggested_purchase)
from .models import CashMovement, Ingredient, Product, ProductionBatch, Sale

logger = logging.getLogger(__name__)

TARGET_MARGIN = 25
LOW_MARGIN = 10
FINISHED_STOCK_ALERT_DAYS = 3
FINISHED_STOCK_TARGET_DAYS = 7
SEVERITY_ORDER = {'critical': 0, 'warning': 1, 'opportunity': 2, 'info': 3}


def _fmt(value):
    return f'{value:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def _qty(value):
    return f'{value:,.0f}'.replace(',', '.') if abs(value) >= 10 else f'{value:g}'.replace('.', ',')


def money(value):
    return f'R$ {_fmt(value)}'


def _deduction_rate(product):
    return (product.sales_fee + product.seller_commission + product.producer_commission + product.cash_percentage) / 100


def _price_for_margin(product, margin):
    rate = _deduction_rate(product) + margin / 100
    return product.unit_cost / (1 - rate) if rate < 1 else None


def _capacity(product):
    items = [item for item in product.recipe_items.all() if item.quantity > 0]
    if not items:
        return None, None
    return min((int(max(item.ingredient.stock, 0) // item.quantity), item.ingredient.name) for item in items)


def _finished_stock():
    produced = dict(ProductionBatch.objects.filter(status='completed').values('product_id')
                    .annotate(total=Sum('quantity')).values_list('product_id', 'total'))
    sold = dict(Sale.objects.exclude(status='cancelled').values('product_id')
                .annotate(total=Sum('quantity')).values_list('product_id', 'total'))
    return {pid: (produced.get(pid) or 0) - (sold.get(pid) or 0) for pid in set(produced) | set(sold)}


def _sales_velocity(days=30, **filters):
    since = timezone.now() - timedelta(days=days)
    rows = (Sale.objects.exclude(status='cancelled').filter(sold_at__gte=since, **filters)
            .values('product_id').annotate(total=Sum('quantity')))
    return {row['product_id']: (row['total'] or 0) / days for row in rows}


def _insight(kind, severity, title, detail, action=None, route=None, data=None):
    return {'kind': kind, 'severity': severity, 'title': title, 'detail': detail,
            'action': {'label': action, 'route': route} if action else None, 'data': data or {}}


def admin_snapshot():
    """Dados agregados usados pelas regras e enviados como contexto para a IA."""
    usage = daily_usage_map()
    planned = planned_requirements()
    ingredients = list(Ingredient.objects.all().order_by('name'))
    products = list(Product.objects.filter(active=True).prefetch_related('recipe_items__ingredient').order_by('name'))
    finished = _finished_stock()
    velocity = _sales_velocity()

    stock_rows = []
    for ing in ingredients:
        daily = usage.get(ing.id, 0)
        need = planned.get(ing.id, 0)
        stock_rows.append({
            'id': ing.id, 'name': ing.name, 'category': ing.category, 'unit': ing.unit,
            'stock': ing.stock, 'min_stock': ing.min_stock, 'unit_cost': ing.unit_cost,
            'daily_usage': daily, 'coverage_days': ing.stock / daily if daily else None,
            'planned_need': need, 'status': stock_status(ing, daily), 'supplier': ing.supplier,
            'suggestion': suggested_purchase(ing, daily, need) if (stock_status(ing, daily) != 'ok' or ing.stock < need) else None,
            'purchase_quantity': ing.purchase_quantity, 'purchase_price': ing.purchase_price,
        })

    product_rows = []
    for product in products:
        cost = product.unit_cost
        profit = product.sale_price - cost - product.sale_price * _deduction_rate(product)
        capacity, bottleneck = _capacity(product)
        product_rows.append({
            'id': product.id, 'name': product.name, 'category': product.category, 'sale_price': product.sale_price,
            'unit_cost': cost, 'unit_profit': profit,
            'margin': profit / product.sale_price * 100 if product.sale_price else 0,
            'finished_stock': finished.get(product.id, 0), 'daily_sales': velocity.get(product.id, 0),
            'max_producible': capacity, 'bottleneck': bottleneck, 'has_recipe': capacity is not None,
            'price_for_target': _price_for_margin(product, TARGET_MARGIN),
        })

    since30 = timezone.now() - timedelta(days=30)
    pending = Sale.objects.filter(status='pending')
    pending_total = pending.aggregate(total=Sum(F('quantity') * F('unit_price')))['total'] or 0
    paid = Sale.objects.filter(status='paid').aggregate(total=Sum(F('quantity') * F('unit_price')))['total'] or 0
    income = CashMovement.objects.filter(type='income').aggregate(total=Sum('amount'))['total'] or 0
    expenses = CashMovement.objects.filter(type='expense').aggregate(total=Sum('amount'))['total'] or 0
    revenue30 = (Sale.objects.exclude(status='cancelled').filter(sold_at__gte=since30)
                 .aggregate(total=Sum(F('quantity') * F('unit_price')))['total'] or 0)
    upcoming = [{
        'id': batch.id, 'product': batch.product.name, 'quantity': batch.quantity, 'status': batch.status,
        'date': timezone.localtime(batch.produced_at).date().isoformat(),
        'producer': batch.producer.name if batch.producer else None,
    } for batch in ProductionBatch.objects.exclude(status='completed').select_related('product', 'producer').order_by('produced_at')[:10]]

    return {
        'recipe_usage': [{'ingredient_id': item.ingredient_id} for product in products for item in product.recipe_items.all()],
        'today': timezone.localdate().isoformat(),
        'ingredients': stock_rows, 'products': product_rows, 'upcoming_batches': upcoming,
        'cash': {'balance': paid + income - expenses, 'pending_sales_count': pending.count(),
                 'pending_sales_total': pending_total, 'revenue_last_30_days': revenue30},
    }


def admin_insights(snapshot):
    items = []
    ingredients = snapshot['ingredients']
    products = snapshot['products']

    # 1. Estoque de insumos
    used_ids = {item['ingredient_id'] for item in snapshot.get('recipe_usage', [])}
    shopping = []
    for ing in ingredients:
        short_for_plan = ing['planned_need'] > ing['stock']
        if ing['status'] == 'out':
            items.append(_insight('stock', 'critical', f"{ing['name']} acabou",
                                  'Sem estoque, nenhuma receita que usa este insumo pode ser concluída.',
                                  'Registrar compra', f"/insumos?item={ing['id']}", {'ingredient_id': ing['id']}))
        elif short_for_plan:
            missing = ing['planned_need'] - ing['stock']
            items.append(_insight('stock', 'critical', f"Falta {ing['name']} para os lotes agendados",
                                  f"Os lotes planejados precisam de {_qty(ing['planned_need'])} {ing['unit']} e há {_qty(ing['stock'])} {ing['unit']}. "
                                  f"Compre pelo menos {_qty(missing)} {ing['unit']} antes de começar.",
                                  'Registrar compra', f"/insumos?item={ing['id']}", {'ingredient_id': ing['id']}))
        elif ing['status'] == 'low':
            cover = ing['coverage_days']
            when = f"dura cerca de {math.floor(cover)} dias no ritmo atual" if cover is not None else 'está abaixo do mínimo definido'
            items.append(_insight('stock', 'warning', f"{ing['name']} está acabando",
                                  f"Restam {_qty(ing['stock'])} {ing['unit']} (mínimo {_qty(ing['min_stock'])} {ing['unit']}); {when}.",
                                  'Ver insumo', f"/insumos?item={ing['id']}", {'ingredient_id': ing['id']}))
        if ing['suggestion']:
            shopping.append({**ing['suggestion'], 'ingredient_id': ing['id'], 'name': ing['name'], 'unit': ing['unit'],
                             'supplier': ing['supplier'], 'pack_size': ing['purchase_quantity']})
    no_minimum = [ing for ing in ingredients if ing['min_stock'] <= 0 and ing['id'] in used_ids and ing['status'] != 'out']
    if no_minimum:
        names = ', '.join(ing['name'] for ing in no_minimum[:3]) + ('…' if len(no_minimum) > 3 else '')
        items.append(_insight('setup', 'warning', f'{len(no_minimum)} insumos sem estoque mínimo',
                              f'Sem o mínimo, o assistente só avisa quando o insumo acabar ({names}). '
                              'Defina na ficha de cada um; uma boa regra é o consumo de uma semana.',
                              'Definir mínimos', '/insumos?sem_minimo=1'))
    if shopping:
        total = sum(row['estimated_cost'] for row in shopping)
        items.append(_insight('shopping', 'opportunity', f'Lista de compras pronta: {len(shopping)} itens',
                              f'Para cobrir as próximas duas semanas e os lotes agendados, a compra estimada é de {money(total)}.',
                              'Ver lista', '/assistente#compras'))

    # 2. Margens
    for product in products:
        if not product['has_recipe']:
            items.append(_insight('recipe', 'warning', f"{product['name']} está sem ficha técnica",
                                  'Sem receita o custo fica zerado e a margem mostrada não é real.',
                                  'Montar ficha', f"/produtos?item={product['id']}"))
            continue
        if product['margin'] < LOW_MARGIN:
            target = product['price_for_target']
            hint = f" Para chegar a {TARGET_MARGIN}% de margem, o preço seria {money(target)}." if target else ''
            severity = 'critical' if product['unit_profit'] < 0 else 'warning'
            title = (f"{product['name']} dá prejuízo" if product['unit_profit'] < 0
                     else f"Margem baixa em {product['name']}")
            items.append(_insight('margin', severity, title,
                                  f"Cada unidade deixa {money(product['unit_profit'])} ({product['margin']:.1f}%).{hint}",
                                  'Revisar preço', f"/produtos?item={product['id']}"))

    # 3. O que produzir
    for product in products:
        velocity = product['daily_sales']
        if velocity <= 0:
            continue
        stock = max(product['finished_stock'], 0)
        days_left = stock / velocity
        if days_left < FINISHED_STOCK_ALERT_DAYS:
            wanted = math.ceil(velocity * FINISHED_STOCK_TARGET_DAYS - stock)
            capacity = product['max_producible']
            possible = min(wanted, capacity) if capacity is not None else wanted
            limit = ''
            if capacity is not None and capacity < wanted:
                limit = f" O estoque de insumos permite só {capacity} un. ({product['bottleneck']} limita)."
            items.append(_insight('production', 'opportunity' if possible > 0 else 'warning',
                                  f"Produzir {possible or wanted} un. de {product['name']}",
                                  f"Vende {velocity:.1f} un./dia e restam {stock} prontas (≈{days_left:.0f} dias).{limit}",
                                  'Agendar lote', f"/producao?novo={product['id']}&qtd={possible or wanted}"))

    # 4. Parado no estoque
    for product in products:
        if product['finished_stock'] > 0 and product['daily_sales'] == 0:
            items.append(_insight('idle', 'info', f"{product['finished_stock']} un. de {product['name']} sem venda há 30 dias",
                                  'Considere uma promoção, oferecer a um parceiro ou pausar a produção.', 'Ver vendas', '/vendas'))

    # 5. Caixa
    cash = snapshot['cash']
    if cash['pending_sales_count']:
        items.append(_insight('cash', 'warning', f"{money(cash['pending_sales_total'])} a receber",
                              f"{cash['pending_sales_count']} vendas estão pendentes de pagamento.", 'Ver pendentes', '/vendas?status=pending'))
    if cash['balance'] < 0:
        items.append(_insight('cash', 'critical', 'Caixa negativo',
                              f"O saldo está em {money(cash['balance'])}. Segure compras que não são urgentes.", 'Ver caixa', '/caixa'))

    # 6. Destaque
    best = max(products, key=lambda row: row['daily_sales'] * row['unit_profit'], default=None)
    if best and best['daily_sales'] > 0 and best['unit_profit'] > 0:
        items.append(_insight('highlight', 'info', f"{best['name']} é o que mais gera lucro",
                              f"≈{best['daily_sales'] * 30:.0f} un. em 30 dias, {money(best['unit_profit'])} de lucro por unidade."))

    items.sort(key=lambda row: SEVERITY_ORDER[row['severity']])
    shopping.sort(key=lambda row: -row['estimated_cost'])
    producible = sorted(
        [{'id': p['id'], 'name': p['name'], 'max_producible': p['max_producible'], 'bottleneck': p['bottleneck'],
          'finished_stock': p['finished_stock'], 'daily_sales': p['daily_sales']} for p in products if p['has_recipe']],
        key=lambda row: row['name'])
    return items, shopping, producible


def producer_insights(user):
    person = user.person
    batches = list(ProductionBatch.objects.exclude(status='completed').filter(producer=person)
                   .select_related('product').prefetch_related('product__recipe_items__ingredient').order_by('produced_at'))
    items = []
    for batch in batches:
        missing = [f"{item.ingredient.name} (precisa {_qty(item.quantity * batch.quantity)} {item.ingredient.unit}, há {_qty(item.ingredient.stock)})"
                   for item in batch.product.recipe_items.all() if item.ingredient.stock < item.quantity * batch.quantity]
        day = timezone.localtime(batch.produced_at).strftime('%d/%m')
        if missing:
            items.append(_insight('stock', 'critical', f'Lote de {batch.product.name} ({day}) sem insumo suficiente',
                                  'Avise a administração: ' + '; '.join(missing) + '.', 'Ver produção', '/producao'))
        else:
            items.append(_insight('production', 'info', f'{batch.quantity} un. de {batch.product.name} para {day}',
                                  'Todos os insumos da receita estão disponíveis.', 'Ver produção', '/producao'))
    if not items:
        items.append(_insight('production', 'info', 'Nenhum lote pendente com você', 'Quando a administração agendar um lote, ele aparece aqui.'))
    return items


def seller_insights(user):
    person = user.person
    items = []
    pending = Sale.objects.filter(status='pending', seller=person)
    total = pending.aggregate(total=Sum(F('quantity') * F('unit_price')))['total'] or 0
    if pending.exists():
        items.append(_insight('cash', 'warning', f'{money(total)} para receber dos seus clientes',
                              f'{pending.count()} vendas suas estão pendentes.', 'Ver vendas', '/vendas?status=pending'))
    finished = _finished_stock()
    names = dict(Product.objects.filter(active=True).values_list('id', 'name'))
    ready = sorted([(qty, names[pid]) for pid, qty in finished.items() if qty > 0 and pid in names], reverse=True)
    if ready:
        items.append(_insight('highlight', 'opportunity', 'Pronto para vender agora',
                              ' · '.join(f'{name}: {qty} un.' for qty, name in ready[:5]), 'Registrar venda', '/vendas?novo=1'))
    if not items:
        items.append(_insight('highlight', 'info', 'Tudo em dia', 'Nenhuma venda pendente e nenhum alerta para você.'))
    return items


def insights(user):
    if user.role == 'admin':
        snapshot = admin_snapshot()
        items, shopping, producible = admin_insights(snapshot)
        return {'insights': items, 'shopping_list': shopping, 'producible': producible,
                'ai_enabled': ai_enabled(), 'generated_at': timezone.now()}
    items = producer_insights(user) if user.role == 'producer' else seller_insights(user)
    return {'insights': items, 'shopping_list': [], 'producible': [], 'ai_enabled': ai_enabled(), 'generated_at': timezone.now()}


# ---------------------------------------------------------------------------
# Perguntas livres com o Claude (opcional)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Você é a assistente da Doces Mivi, uma pequena fábrica de bolos de pote e doces no Brasil.
Responda em português do Brasil, de forma curta e prática, como uma gerente experiente de confeitaria.
Use somente os dados do JSON fornecido sobre o negócio; se algo não estiver nos dados, diga que não sabe.
Valores em reais no formato R$ 1.234,56. Quantidades de insumos estão na unidade indicada em cada item.
Quando sugerir uma ação (comprar, produzir, ajustar preço), diga quanto e por quê, mostrando a conta em uma linha.
Não invente clientes, vendas ou números."""


def ai_enabled():
    return bool(os.getenv('ANTHROPIC_API_KEY', '').strip())


def _context_for(user):
    if user.role == 'admin':
        snapshot = admin_snapshot()
        items, shopping, _ = admin_insights(snapshot)
        return {'perfil': 'administrador', 'dados': snapshot, 'alertas': items, 'lista_de_compras': shopping}
    items = producer_insights(user) if user.role == 'producer' else seller_insights(user)
    return {'perfil': 'produtor' if user.role == 'producer' else 'vendedor', 'alertas': items}


class AssistantUnavailable(Exception):
    pass


def ask(user, question, history=None):
    if not ai_enabled():
        raise AssistantUnavailable('O chat com IA não está configurado no servidor (defina ANTHROPIC_API_KEY).')
    import anthropic

    context = json.dumps(_context_for(user), ensure_ascii=False, default=str)
    messages = []
    for turn in (history or [])[-8:]:
        role = turn.get('role')
        text = str(turn.get('content', ''))[:4000]
        if role in ('user', 'assistant') and text:
            messages.append({'role': role, 'content': text})
    messages.append({'role': 'user', 'content': f'<dados_do_negocio>\n{context}\n</dados_do_negocio>\n\nPergunta: {question}'})
    while messages and messages[0]['role'] != 'user':
        messages.pop(0)

    client = anthropic.Anthropic(timeout=60.0)
    try:
        response = client.beta.messages.create(
            model=os.getenv('ASSISTANT_MODEL', 'claude-opus-5-5'),
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            output_config={'effort': os.getenv('ASSISTANT_EFFORT', 'low')},
            betas=['server-side-fallback-2026-07-01'],
            fallbacks='default',
            messages=messages,
        )
    except anthropic.RateLimitError as error:
        raise AssistantUnavailable('Muitas perguntas em pouco tempo. Tente de novo em instantes.') from error
    except anthropic.APIStatusError as error:
        logger.warning('Falha na API do Claude: %s', error.status_code)
        raise AssistantUnavailable('A IA não respondeu agora. Os alertas automáticos continuam funcionando.') from error
    except anthropic.APIConnectionError as error:
        raise AssistantUnavailable('Sem conexão com o serviço de IA.') from error

    if response.stop_reason == 'refusal':
        return 'Não consigo ajudar com essa pergunta. Tente perguntar sobre estoque, produção, vendas ou preços.'
    return ''.join(block.text for block in response.content if block.type == 'text').strip()
