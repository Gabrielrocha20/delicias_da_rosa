from collections import defaultdict
from datetime import timedelta
from django.db import models
from django.db.models import Sum
from django.utils import timezone
from .models import Establishment, Ingredient, Product, ProductionBatch, Sale


RANGE_DAYS = {'7d': 7, '30d': 30, '90d': 90, '12m': 365}


def period(range_key):
    days = RANGE_DAYS.get(range_key, 30)
    since = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    return days, since


def scoped_sales(user, since=None):
    sales = Sale.objects.exclude(status='cancelled').select_related('product', 'seller', 'producer', 'establishment')
    if since:
        sales = sales.filter(sold_at__gte=since)
    if user.role == 'seller':
        sales = sales.filter(seller=user.person)
    elif user.role == 'producer':
        sales = sales.filter(producer=user.person)
    return sales


def commission_for(sale, role):
    percentage = sale.product.seller_commission if role == 'seller' else sale.product.producer_commission
    return sale.quantity * sale.unit_price * percentage / 100


def filled_trend(sales, since, days, role):
    raw = defaultdict(lambda: {'revenue': 0, 'units': 0, 'earnings': 0})
    for sale in sales:
        day = timezone.localtime(sale.sold_at).date().isoformat()
        raw[day]['revenue'] += sale.quantity * sale.unit_price
        raw[day]['units'] += sale.quantity
        if role in ('seller', 'producer'):
            raw[day]['earnings'] += commission_for(sale, role)
    result, bucket = [], 7 if days > 90 else 1
    for offset in range(0, days, bucket):
        row = {'date': (since + timedelta(days=offset)).date().isoformat(), 'revenue': 0, 'units': 0, 'earnings': 0}
        for day_offset in range(bucket):
            if offset + day_offset >= days:
                break
            key = (since + timedelta(days=offset + day_offset)).date().isoformat()
            for field in ('revenue', 'units', 'earnings'):
                row[field] += raw[key][field]
        result.append(row)
    return result


def dashboard_data(user, range_key):
    days, since = period(range_key)
    sales = list(scoped_sales(user, since))
    revenue = sum(s.quantity * s.unit_price for s in sales)
    units = sum(s.quantity for s in sales)
    product_cost = sum(s.quantity * s.product.unit_cost for s in sales)
    personal_earnings = sum(commission_for(s, user.role) for s in sales) if user.role != 'admin' else 0
    deductions = sum(s.quantity * s.unit_price * (
        s.product.sales_fee + s.product.seller_commission + s.product.producer_commission
        + s.product.cash_percentage + s.partner_commission
    ) / 100 for s in sales)
    owner_profit = revenue - product_cost - deductions
    shown_profit = owner_profit if user.role == 'admin' else personal_earnings

    production = ProductionBatch.objects.filter(status='completed', produced_at__gte=since)
    if user.role == 'producer':
        production = production.filter(producer=user.person)
    produced = 0 if user.role == 'seller' else production.aggregate(total=Sum('quantity'))['total'] or 0

    products = defaultdict(lambda: {'units': 0, 'revenue': 0, 'profit': 0})
    channels = defaultdict(float)
    for sale in sales:
        row = products[sale.product.name]
        row['units'] += sale.quantity
        row['revenue'] += sale.quantity * sale.unit_price
        if user.role == 'admin':
            row['profit'] += sale.quantity * (sale.unit_price - sale.product.unit_cost - sale.unit_price * (
                sale.product.sales_fee + sale.product.seller_commission + sale.product.producer_commission
                + sale.product.cash_percentage + sale.partner_commission) / 100)
        else:
            row['profit'] += commission_for(sale, user.role)
        channels[sale.channel] += sale.quantity * sale.unit_price

    since30 = timezone.now() - timedelta(days=30)
    recent = list(scoped_sales(user, since30))
    recent_units = sum(s.quantity for s in recent)
    recent_earnings = sum(commission_for(s, user.role) for s in recent) if user.role != 'admin' else 0
    daily_velocity = recent_units / 30
    all_produced = ProductionBatch.objects.filter(status='completed').aggregate(total=Sum('quantity'))['total'] or 0
    all_sold = Sale.objects.exclude(status='cancelled').aggregate(total=Sum('quantity'))['total'] or 0
    available = max(0, all_produced - all_sold)

    planned = ProductionBatch.objects.exclude(status='completed').select_related('product', 'producer').order_by('produced_at')
    if user.role == 'producer':
        planned = planned.filter(producer=user.person)
    planned_data = [] if user.role == 'seller' else [{
        'id': item.id, 'quantity': item.quantity, 'produced_at': item.produced_at,
        'status': item.status, 'product_name': item.product.name,
        'producer_name': item.producer.name if item.producer else None,
    } for item in planned[:5]]

    return {
        'periodDays': days, 'personal': user.role != 'admin', 'role': user.role,
        'metrics': {
            'revenue': revenue, 'productCost': product_cost, 'profit': shown_profit,
            'margin': shown_profit / revenue * 100 if revenue else 0, 'unitsSold': units,
            'unitsProduced': produced, 'averageTicket': revenue / units if units else 0,
        },
        'trend': filled_trend(sales, since, days, user.role),
        'byProduct': [dict(name=name, **values) for name, values in sorted(products.items(), key=lambda x: x[1]['revenue'], reverse=True)],
        'byChannel': [{'name': name, 'value': value} for name, value in sorted(channels.items(), key=lambda x: x[1], reverse=True)],
        'lowStock': list(Ingredient.objects.filter(stock__lte=models.F('min_stock')).values('name', 'stock', 'min_stock', 'unit')[:6]) if user.role == 'admin' else [],
        'planned': planned_data,
        'forecast': {
            'availableStock': available, 'dailyVelocity': daily_velocity,
            'daysToSell': available / daily_velocity if daily_velocity else 0,
            'projected30Days': daily_velocity * 30,
            'projectedRevenue30Days': daily_velocity * 30 * (revenue / units if units else 0),
            'projectedEarnings30Days': recent_earnings,
        },
    }


def transparency_data(range_key):
    days, since = period(range_key)
    sales = list(Sale.objects.exclude(status='cancelled').filter(sold_at__gte=since).select_related(
        'product', 'seller', 'producer', 'establishment'))
    totals = {'revenue': 0, 'product_cost': 0, 'sales_fees': 0, 'sellers': 0, 'producers': 0,
              'cash_reserve': 0, 'partners': 0, 'units': 0}
    people = defaultdict(lambda: {'earnings': 0, 'units': 0, 'type': '', 'id': None})
    partners = defaultdict(lambda: {'earnings': 0, 'revenue': 0, 'units': 0, 'id': None})
    products = defaultdict(lambda: {'units': 0, 'revenue': 0, 'cost': 0, 'owner': 0})

    for sale in sales:
        gross = sale.quantity * sale.unit_price
        cost = sale.quantity * sale.product.unit_cost
        seller_value = gross * sale.product.seller_commission / 100
        producer_value = gross * sale.product.producer_commission / 100
        cash = gross * sale.product.cash_percentage / 100
        fees = gross * sale.product.sales_fee / 100
        partner_value = gross * sale.partner_commission / 100
        owner = gross - cost - seller_value - producer_value - cash - fees - partner_value
        totals['revenue'] += gross; totals['product_cost'] += cost; totals['sales_fees'] += fees
        totals['sellers'] += seller_value; totals['producers'] += producer_value
        totals['cash_reserve'] += cash; totals['partners'] += partner_value; totals['units'] += sale.quantity
        if sale.seller:
            person = people[sale.seller.name]; person.update(id=sale.seller_id, type='seller')
            person['earnings'] += seller_value; person['units'] += sale.quantity
        if sale.producer:
            person = people[sale.producer.name]; person.update(id=sale.producer_id, type='producer')
            person['earnings'] += producer_value; person['units'] += sale.quantity
        if sale.establishment:
            partner = partners[sale.establishment.name]; partner['id'] = sale.establishment_id
            partner['earnings'] += partner_value; partner['revenue'] += gross; partner['units'] += sale.quantity
        product = products[sale.product.name]
        product['units'] += sale.quantity; product['revenue'] += gross; product['cost'] += cost; product['owner'] += owner

    owner = totals['revenue'] - sum(totals[key] for key in ('product_cost', 'sales_fees', 'sellers', 'producers', 'cash_reserve', 'partners'))
    totals.update(owner=owner, roi=owner / totals['product_cost'] * 100 if totals['product_cost'] else 0,
                  distributed=totals['revenue'] - owner)
    return {
        'periodDays': days, 'totals': totals,
        'people': [dict(name=name, **values) for name, values in sorted(people.items(), key=lambda x: x[1]['earnings'], reverse=True)],
        'partners': [dict(name=name, **values) for name, values in sorted(partners.items(), key=lambda x: x[1]['earnings'], reverse=True)],
        'byProduct': [dict(name=name, **values) for name, values in sorted(products.items(), key=lambda x: x[1]['revenue'], reverse=True)],
    }
