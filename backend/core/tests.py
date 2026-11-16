from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from . import vault
from .models import (
    AssistantApiKey,
    CashMovement,
    Establishment,
    EstablishmentProduct,
    Ingredient,
    Person,
    Product,
    ProductionBatch,
    RecipeItem,
    Sale,
    StockMovement,
    User,
)
from .services import dashboard_data, transparency_data


class FinancialUnitTests(TestCase):
    def setUp(self):
        self.seller = User.objects.get(email='vendedor@docesmivi.com.br')
        self.producer = User.objects.get(email='produtor@docesmivi.com.br')
        self.ingredient = Ingredient.objects.create(
            name='Teste unitario', purchase_price=20, purchase_quantity=1000, unit='g'
        )
        self.product = Product.objects.create(
            name='Produto de teste', sale_price=20, packaging_cost=1, other_cost=.50,
            sales_fee=5, seller_commission=15, producer_commission=10, cash_percentage=20,
        )
        RecipeItem.objects.create(product=self.product, ingredient=self.ingredient, quantity=100)

    def test_product_cost_profit_and_margin_are_calculated_from_recipe(self):
        self.assertAlmostEqual(self.ingredient.unit_cost, .02)
        self.assertAlmostEqual(self.product.recipe_cost, 2)
        self.assertAlmostEqual(self.product.unit_cost, 3.5)

    def test_transparency_distribution_closes_exactly_to_revenue(self):
        Sale.objects.create(
            product=self.product, seller=self.seller.person, producer=self.producer.person,
            quantity=10, unit_price=20, partner_commission=0, channel='Teste', status='paid',
            sold_at=timezone.now(),
        )
        totals = transparency_data('30d')['totals']
        distributed = sum(totals[key] for key in (
            'product_cost', 'sales_fees', 'sellers', 'producers',
            'cash_reserve', 'partners', 'owner',
        ))
        self.assertAlmostEqual(distributed, totals['revenue'], places=7)
        self.assertAlmostEqual(totals['owner'], 65)
        self.assertAlmostEqual(totals['roi'], 65 / 35 * 100)

    def test_seller_dashboard_forecast_uses_only_their_sales(self):
        other_person = Person.objects.create(name='Outro vendedor', type='seller')
        other_user = User.objects.create_user(
            username='outro@example.com', email='outro@example.com', password='Senha#9271',
            display_name='Outro', role='seller', person=other_person,
        )
        Sale.objects.create(
            product=self.product, seller=self.seller.person, quantity=30, unit_price=20,
            channel='Direto', status='paid', sold_at=timezone.now(),
        )
        Sale.objects.create(
            product=self.product, seller=other_person, quantity=90, unit_price=20,
            channel='Direto', status='paid', sold_at=timezone.now(),
        )
        dashboard = dashboard_data(self.seller, '30d')
        other_dashboard = dashboard_data(other_user, '30d')
        self.assertEqual(dashboard['metrics']['unitsSold'], 30)
        self.assertAlmostEqual(dashboard['metrics']['profit'], 90)
        self.assertAlmostEqual(dashboard['forecast']['dailyVelocity'], 1)
        self.assertEqual(other_dashboard['metrics']['unitsSold'], 90)


class ApiSecurityBase(APITestCase):
    def setUp(self):
        self.admin = User.objects.get(email='admin@docesmivi.com.br')
        self.seller = User.objects.get(email='vendedor@docesmivi.com.br')
        self.producer = User.objects.get(email='produtor@docesmivi.com.br')
        self.product = Product.objects.first()
        self.other_seller_person = Person.objects.create(
            name='Vendedor secundario', type='seller', email='secundario@example.com', commission=15
        )
        self.other_seller = User.objects.create_user(
            username='secundario@example.com', email='secundario@example.com',
            password='Segura#9271', display_name='Vendedor secundario', role='seller',
            person=self.other_seller_person,
        )
        ProductionBatch.objects.create(
            product=self.product, producer=self.producer.person, quantity=50,
            status='completed', produced_at=timezone.now(),
        )

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')

    def sale_payload(self, **overrides):
        payload = {
            'product_id': self.product.id,
            'seller_id': self.seller.person_id,
            'producer_id': self.producer.person_id,
            'quantity': 2,
            'unit_price': self.product.sale_price,
            'channel': 'Direto',
            'status': 'paid',
            'sold_at': timezone.now().isoformat(),
        }
        payload.update(overrides)
        return payload


class AuthenticationSecurityTests(ApiSecurityBase):
    def test_protected_endpoints_reject_missing_and_invalid_tokens(self):
        self.assertEqual(self.client.get('/api/dashboard').status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer token-invalido')
        self.assertEqual(self.client.get('/api/dashboard').status_code, 401)

    def test_inactive_account_token_is_rejected(self):
        self.authenticate(self.seller)
        self.seller.is_active = False
        self.seller.save(update_fields=['is_active'])
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_login_does_not_reveal_whether_email_exists(self):
        missing = self.client.post(
            '/api/auth/login', {'email': 'nao-existe@example.com', 'password': 'errada'}, format='json'
        )
        existing = self.client.post(
            '/api/auth/login', {'email': self.seller.email, 'password': 'errada'}, format='json'
        )
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(existing.status_code, 401)
        self.assertEqual(missing.json(), existing.json())

    def test_created_password_is_hashed_and_weak_password_is_rejected(self):
        person = Person.objects.create(name='Nova vendedora', type='seller')
        self.authenticate(self.admin)
        weak = self.client.post('/api/users', {
            'name': 'Nova vendedora', 'email': 'nova@example.com', 'role': 'seller',
            'person_id': person.id, 'password': '12345678',
        }, format='json')
        self.assertEqual(weak.status_code, 400)

        strong = self.client.post('/api/users', {
            'name': 'Nova vendedora', 'email': 'nova@example.com', 'role': 'seller',
            'person_id': person.id, 'password': 'Forte#9271-doce',
        }, format='json')
        self.assertEqual(strong.status_code, 201, strong.json())
        created = User.objects.get(email='nova@example.com')
        self.assertNotEqual(created.password, 'Forte#9271-doce')
        self.assertTrue(created.check_password('Forte#9271-doce'))


class AuthorizationSecurityTests(ApiSecurityBase):
    def test_seller_cannot_use_admin_or_production_endpoints(self):
        self.authenticate(self.seller)
        for endpoint in ('/api/users', '/api/ingredients', '/api/people', '/api/production'):
            self.assertEqual(self.client.get(endpoint).status_code, 403, endpoint)
        self.assertEqual(
            self.client.post('/api/products', {'name': 'Nao autorizado'}, format='json').status_code,
            403,
        )

    def test_producer_cannot_access_sales_or_admin_endpoints(self):
        self.authenticate(self.producer)
        self.assertEqual(self.client.get('/api/sales').status_code, 403)
        self.assertEqual(self.client.get('/api/users').status_code, 403)

    def test_seller_cannot_spoof_owner_or_read_another_sellers_sale(self):
        other_sale = Sale.objects.create(
            product=self.product, seller=self.other_seller_person, producer=self.producer.person,
            quantity=1, unit_price=self.product.sale_price, channel='Direto', status='paid',
            sold_at=timezone.now(),
        )
        self.authenticate(self.seller)
        response = self.client.post(
            '/api/sales', self.sale_payload(seller_id=self.other_seller_person.id), format='json'
        )
        self.assertEqual(response.status_code, 201, response.json())
        self.assertEqual(response.json()['seller_id'], self.seller.person_id)
        self.assertEqual(self.client.get(f'/api/sales/{other_sale.id}').status_code, 404)
        self.assertEqual(
            self.client.patch(f'/api/sales/{other_sale.id}', {'quantity': 99}, format='json').status_code,
            404,
        )

    def test_producer_cannot_spoof_production_owner(self):
        other_producer = Person.objects.create(name='Outro produtor', type='producer')
        self.authenticate(self.producer)
        response = self.client.post('/api/production', {
            'product_id': self.product.id, 'producer_id': other_producer.id,
            'quantity': 5, 'status': 'completed', 'produced_at': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        self.assertEqual(response.json()['producer_id'], self.producer.person_id)

    def test_non_admin_product_list_never_exposes_financial_cost_fields(self):
        self.authenticate(self.seller)
        product = self.client.get('/api/products').json()[0]
        for confidential_field in (
            'unit_cost', 'packaging_cost', 'other_cost', 'sales_fee',
            'seller_commission', 'producer_commission', 'cash_percentage',
        ):
            self.assertNotIn(confidential_field, product)


class InputValidationSecurityTests(ApiSecurityBase):
    def test_partner_commission_is_server_controlled(self):
        establishment = Establishment.objects.create(name='Parceiro seguro')
        EstablishmentProduct.objects.create(
            establishment=establishment, product=self.product, commission=12
        )
        self.authenticate(self.seller)
        response = self.client.post('/api/sales', self.sale_payload(
            establishment_id=establishment.id, partner_commission=99,
        ), format='json')
        self.assertEqual(response.status_code, 201, response.json())
        self.assertEqual(response.json()['partner_commission'], 12)

    def test_sale_rejects_product_not_authorized_for_partner(self):
        establishment = Establishment.objects.create(name='Parceiro sem produto')
        self.authenticate(self.seller)
        response = self.client.post('/api/sales', self.sale_payload(
            establishment_id=establishment.id,
        ), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Sale.objects.filter(establishment=establishment).exists())

    def test_invalid_quantities_are_rejected(self):
        self.authenticate(self.seller)
        self.assertEqual(
            self.client.post('/api/sales', self.sale_payload(quantity=0), format='json').status_code,
            400,
        )
        self.authenticate(self.admin)
        self.assertEqual(self.client.post('/api/ingredients', {
            'name': 'Insumo invalido', 'purchase_price': 10, 'purchase_quantity': 0,
            'unit': 'g', 'stock': 0, 'min_stock': 0,
        }, format='json').status_code, 400)


class ProductionInventoryTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.get(email='admin@docesmivi.com.br')
        self.producer = User.objects.get(email='produtor@docesmivi.com.br').person
        self.ingredient = Ingredient.objects.create(
            name='Insumo para baixa', purchase_price=10, purchase_quantity=100, unit='g', stock=1000,
        )
        self.product = Product.objects.create(name='Produto para baixa', sale_price=20)
        RecipeItem.objects.create(product=self.product, ingredient=self.ingredient, quantity=10)
        token, _ = Token.objects.get_or_create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')

    def payload(self, **overrides):
        data = {
            'product_id': self.product.id,
            'producer_id': self.producer.id,
            'quantity': 10,
            'status': 'completed',
            'produced_at': timezone.now().isoformat(),
        }
        data.update(overrides)
        return data

    def test_completed_production_consumes_and_restores_recipe_ingredients(self):
        response = self.client.post('/api/production', self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.json())
        batch_id = response.json()['id']
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.stock, 900)
        self.assertEqual(ProductionBatch.objects.get(pk=batch_id).consumptions.get().quantity, 100)

        response = self.client.patch(f'/api/production/{batch_id}', self.payload(quantity=6), format='json')
        self.assertEqual(response.status_code, 200, response.json())
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.stock, 940)

        response = self.client.delete(f'/api/production/{batch_id}')
        self.assertEqual(response.status_code, 204)
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.stock, 1000)

    def test_insufficient_stock_does_not_create_or_consume_batch(self):
        self.ingredient.stock = 20
        self.ingredient.save(update_fields=['stock'])

        response = self.client.post('/api/production', self.payload(quantity=3), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Estoque insuficiente', str(response.json()))
        self.assertFalse(ProductionBatch.objects.filter(product=self.product).exists())
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.stock, 20)


class IngredientStockTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.get(email='admin@docesmivi.com.br')
        self.seller = User.objects.get(email='vendedor@docesmivi.com.br')
        self.ingredient = Ingredient.objects.create(
            name='Leite em pó', category='Laticínios', purchase_price=30, purchase_quantity=1000, unit='g',
            stock=200, min_stock=500,
        )
        self.auth(self.admin)

    def auth(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')

    def test_purchase_adds_stock_updates_cost_and_registers_expense(self):
        response = self.client.post(f'/api/ingredients/{self.ingredient.id}/purchase', {
            'quantity': 2000, 'total_price': 50, 'supplier': 'Atacadão',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.stock, 2200)
        self.assertAlmostEqual(self.ingredient.unit_cost, 0.025)
        self.assertEqual(self.ingredient.supplier, 'Atacadão')
        self.assertIsNotNone(self.ingredient.last_purchase_at)
        movement = StockMovement.objects.get(ingredient=self.ingredient, type='purchase')
        self.assertEqual(movement.stock_after, 2200)
        self.assertEqual(movement.cash_movement.amount, 50)
        self.assertEqual(CashMovement.objects.filter(category='Compra de insumos').count(), 1)

    def test_purchase_without_expense_or_cost_update(self):
        response = self.client.post(f'/api/ingredients/{self.ingredient.id}/purchase', {
            'quantity': 100, 'total_price': 10, 'update_cost': False, 'register_expense': False,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.ingredient.refresh_from_db()
        self.assertAlmostEqual(self.ingredient.unit_cost, 0.03)
        self.assertFalse(CashMovement.objects.exists())

    def test_inventory_count_and_loss(self):
        response = self.client.post(f'/api/ingredients/{self.ingredient.id}/adjust', {
            'type': 'adjustment', 'counted_stock': 150, 'note': 'Contagem semanal',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        self.assertEqual(response.json()['stock'], 150)

        response = self.client.post(f'/api/ingredients/{self.ingredient.id}/adjust', {
            'type': 'loss', 'quantity': 500,
        }, format='json')
        self.assertEqual(response.status_code, 400)

        response = self.client.post(f'/api/ingredients/{self.ingredient.id}/adjust', {
            'type': 'loss', 'quantity': 50, 'note': 'Pacote rasgado',
        }, format='json')
        self.assertEqual(response.json()['stock'], 100)
        history = self.client.get(f'/api/ingredients/{self.ingredient.id}/movements').json()
        self.assertEqual([row['quantity'] for row in history], [-50, -50])

    def test_list_reports_status_and_purchase_suggestion_in_whole_packs(self):
        row = next(item for item in self.client.get('/api/ingredients').json() if item['id'] == self.ingredient.id)
        self.assertEqual(row['status'], 'low')
        self.assertEqual(row['suggestion']['packs'], 1)
        self.assertEqual(row['suggestion']['quantity'], 1000)
        self.assertEqual(row['suggestion']['estimated_cost'], 30)
        self.assertEqual(row['stock_value'], 6)

    def test_production_writes_stock_history_and_removes_it_on_delete(self):
        product = Product.objects.create(name='Pote ninho', sale_price=15)
        RecipeItem.objects.create(product=product, ingredient=self.ingredient, quantity=20)
        producer = User.objects.get(email='produtor@docesmivi.com.br').person
        response = self.client.post('/api/production', {
            'product_id': product.id, 'producer_id': producer.id, 'quantity': 5,
            'status': 'completed', 'produced_at': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        movement = StockMovement.objects.get(ingredient=self.ingredient, type='production')
        self.assertEqual(movement.quantity, -100)
        self.client.delete(f"/api/production/{response.json()['id']}")
        self.assertFalse(StockMovement.objects.filter(type='production').exists())
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.stock, 200)

    def test_product_reports_how_many_units_stock_allows(self):
        product = Product.objects.create(name='Pote capacidade', sale_price=15)
        RecipeItem.objects.create(product=product, ingredient=self.ingredient, quantity=30)
        row = next(item for item in self.client.get('/api/products').json() if item['id'] == product.id)
        self.assertEqual(row['max_producible'], 6)
        self.assertEqual(row['bottleneck'], 'Leite em pó')

    def test_seller_cannot_move_stock(self):
        self.auth(self.seller)
        response = self.client.post(f'/api/ingredients/{self.ingredient.id}/purchase', {'quantity': 1, 'total_price': 1}, format='json')
        self.assertEqual(response.status_code, 403)


class AssistantTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.get(email='admin@docesmivi.com.br')
        self.seller = User.objects.get(email='vendedor@docesmivi.com.br')
        self.producer = User.objects.get(email='produtor@docesmivi.com.br')

    def auth(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')

    def test_admin_gets_shortage_for_planned_batch_and_shopping_list(self):
        ingredient = Ingredient.objects.create(name='Morango', purchase_price=12, purchase_quantity=500, unit='g', stock=100)
        product = Product.objects.create(name='Pote morango', sale_price=16)
        RecipeItem.objects.create(product=product, ingredient=ingredient, quantity=40)
        ProductionBatch.objects.create(product=product, producer=self.producer.person, quantity=10,
                                       status='planned', produced_at=timezone.now())
        self.auth(self.admin)
        data = self.client.get('/api/assistant/insights').json()
        titles = [item['title'] for item in data['insights']]
        self.assertIn('Falta Morango para os lotes agendados', titles)
        self.assertEqual(data['insights'][0]['severity'], 'critical')
        row = next(item for item in data['shopping_list'] if item['name'] == 'Morango')
        self.assertGreaterEqual(row['quantity'], 300)
        self.assertEqual(row['quantity'] % 500, 0)
        self.assertFalse(data['ai_enabled'])

    def test_negative_margin_product_is_flagged_with_target_price(self):
        ingredient = Ingredient.objects.create(name='Chocolate nobre', purchase_price=100, purchase_quantity=1000, unit='g', stock=5000)
        product = Product.objects.create(name='Pote caro', sale_price=10, seller_commission=15, producer_commission=15, cash_percentage=20)
        RecipeItem.objects.create(product=product, ingredient=ingredient, quantity=80)
        self.auth(self.admin)
        data = self.client.get('/api/assistant/insights').json()
        item = next(row for row in data['insights'] if row['title'] == 'Pote caro dá prejuízo')
        self.assertIn('25% de margem', item['detail'])

    def test_non_admin_insights_hide_business_data(self):
        for user in (self.seller, self.producer):
            self.auth(user)
            data = self.client.get('/api/assistant/insights').json()
            self.assertEqual(data['shopping_list'], [])
            self.assertEqual(data['producible'], [])

    def test_ask_without_ollama_key_returns_clear_error(self):
        self.auth(self.admin)
        response = self.client.post('/api/assistant/ask', {'question': 'O que devo produzir?'}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertIn('Nenhuma chave', response.json()['message'])


class AccountTests(APITestCase):
    def test_logout_revokes_token_and_password_change_rotates_it(self):
        user = User.objects.get(email='admin@docesmivi.com.br')
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')
        response = self.client.post('/api/auth/password', {'current_password': 'errada', 'new_password': 'x'}, format='json')
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/auth/password', {
            'current_password': 'admin123', 'new_password': 'Bolo-de-pote-2026!'}, format='json')
        self.assertEqual(response.status_code, 200, response.json())
        new_token = response.json()['token']
        self.assertNotEqual(new_token, token.key)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_token}')
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 204)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)


class AssistantSetupAndPartialUpdateTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.get(email='admin@docesmivi.com.br')
        token, _ = Token.objects.get_or_create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')

    def test_ingredients_in_recipes_without_minimum_are_flagged(self):
        ingredient = Ingredient.objects.create(name='Farinha sem mínimo', purchase_price=5, purchase_quantity=1000, unit='g', stock=3000)
        product = Product.objects.create(name='Pote com farinha', sale_price=15)
        RecipeItem.objects.create(product=product, ingredient=ingredient, quantity=10)
        data = self.client.get('/api/assistant/insights').json()
        item = next(row for row in data['insights'] if row['kind'] == 'setup')
        self.assertIn('Farinha sem mínimo', item['detail'])
        self.assertEqual(item['action']['route'], '/insumos?sem_minimo=1')

    def test_marking_sale_paid_keeps_partner_commission_and_producer(self):
        seller = Person.objects.create(name='Vendedora', type='seller')
        producer = Person.objects.create(name='Produtora', type='producer')
        other = Person.objects.create(name='Outra produtora', type='producer')
        product = Product.objects.create(name='Pote parceiro', sale_price=10)
        place = Establishment.objects.create(name='Café da esquina')
        EstablishmentProduct.objects.create(establishment=place, product=product, commission=20)
        response = self.client.post('/api/sales', {
            'product_id': product.id, 'seller_id': seller.id, 'producer_id': producer.id, 'establishment_id': place.id,
            'quantity': 2, 'unit_price': 10, 'status': 'pending', 'sold_at': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        ProductionBatch.objects.create(product=product, producer=other, quantity=5, status='completed', produced_at=timezone.now())
        sale_id = response.json()['id']
        response = self.client.patch(f'/api/sales/{sale_id}', {'status': 'paid'}, format='json')
        self.assertEqual(response.status_code, 200, response.json())
        sale = Sale.objects.get(pk=sale_id)
        self.assertEqual(sale.status, 'paid')
        self.assertEqual(sale.partner_commission, 20)
        self.assertEqual(sale.producer, producer)
        self.assertEqual(sale.establishment, place)


class OllamaKeyRotationTests(APITestCase):
    KEY_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.AAAAAAAAAAAAAAAA'
    KEY_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.BBBBBBBBBBBBBBBB'
    KEY_C = 'cccccccccccccccccccccccccccccccc.CCCCCCCCCCCCCCCC'

    def setUp(self):
        self.admin = User.objects.get(email='admin@docesmivi.com.br')
        self.seller = User.objects.get(email='vendedor@docesmivi.com.br')
        self.auth(self.admin)

    def auth(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')

    def add(self, name, key):
        response = self.client.post('/api/assistant/keys', {'name': name, 'key': key}, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()

    def fake(self, behaviour):
        """Troca a chamada de rede: behaviour(chave) -> (status, payload, headers)."""
        calls = []

        def call(method, path, *, key=None, body=None, timeout=0):
            calls.append(key)
            return behaviour(key)

        return mock.patch('core.ollama._call', side_effect=call), calls

    def ok(self, text='Compre leite condensado.'):
        return 200, {'message': {'role': 'assistant', 'content': text}}, {}

    def test_key_is_encrypted_masked_and_never_returned(self):
        created = self.add('Conta 1', self.KEY_A)
        self.assertNotIn('key', created)
        self.assertEqual(created['masked'], '••••AAAA')
        self.assertNotIn(self.KEY_A, str(self.client.get('/api/assistant/keys').json()))
        stored = AssistantApiKey.objects.get(pk=created['id'])
        self.assertNotIn('AAAAAAAA', stored.secret)
        self.assertEqual(vault.decrypt(stored.secret), self.KEY_A)

    def test_duplicate_and_short_keys_are_rejected(self):
        self.add('Conta 1', self.KEY_A)
        duplicate = self.client.post('/api/assistant/keys', {'name': 'Repetida', 'key': self.KEY_A}, format='json')
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('já está cadastrada', duplicate.json()['message'])
        short = self.client.post('/api/assistant/keys', {'name': 'Curta', 'key': 'abc'}, format='json')
        self.assertEqual(short.status_code, 400)

    def test_only_admin_manages_keys_and_settings(self):
        self.auth(self.seller)
        self.assertEqual(self.client.get('/api/assistant/keys').status_code, 403)
        self.assertEqual(self.client.post('/api/assistant/keys', {'name': 'x', 'key': self.KEY_A}, format='json').status_code, 403)
        self.assertEqual(self.client.put('/api/assistant/settings', {'model': 'gemma4:31b'}, format='json').status_code, 403)

    def test_uses_first_key_until_it_hits_the_limit_then_switches(self):
        first, second = self.add('Conta 1', self.KEY_A), self.add('Conta 2', self.KEY_B)
        patcher, calls = self.fake(lambda key: self.ok() if key == self.KEY_A else self.ok('Segunda chave.'))
        with patcher:
            answer = self.client.post('/api/assistant/ask', {'question': 'O que comprar?'}, format='json').json()['answer']
            self.assertEqual(answer, 'Compre leite condensado.')
            self.assertEqual(calls, [self.KEY_A])

        patcher, calls = self.fake(lambda key: (429, {'error': 'weekly usage limit reached'}, {}) if key == self.KEY_A else self.ok('Segunda chave.'))
        with patcher:
            answer = self.client.post('/api/assistant/ask', {'question': 'E agora?'}, format='json').json()['answer']
        self.assertEqual(answer, 'Segunda chave.')
        self.assertEqual(calls, [self.KEY_A, self.KEY_B])
        first_row = AssistantApiKey.objects.get(pk=first['id'])
        self.assertEqual(first_row.status, 'exhausted')
        self.assertIn('limit', first_row.last_error)

        # Enquanto a primeira descansa, a segunda atende sozinha, sem nem tentar a primeira.
        patcher, calls = self.fake(lambda key: self.ok('De novo a segunda.'))
        with patcher:
            self.client.post('/api/assistant/ask', {'question': 'Mais uma?'}, format='json')
        self.assertEqual(calls, [self.KEY_B])
        self.assertEqual(AssistantApiKey.objects.get(pk=second['id']).requests_count, 2)

    def test_exhausted_key_comes_back_after_the_cooldown(self):
        created = self.add('Conta 1', self.KEY_A)
        AssistantApiKey.objects.filter(pk=created['id']).update(exhausted_until=timezone.now() - timedelta(minutes=1))
        patcher, calls = self.fake(lambda key: self.ok())
        with patcher:
            self.assertEqual(self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json').status_code, 200)
        self.assertEqual(calls, [self.KEY_A])
        self.assertEqual(AssistantApiKey.objects.get(pk=created['id']).status, 'ok')

    def test_retry_after_header_sets_the_cooldown(self):
        created = self.add('Conta 1', self.KEY_A)
        patcher, _ = self.fake(lambda key: (429, {'error': 'rate limited'}, {'Retry-After': '7200'}))
        with patcher:
            self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json')
        until = AssistantApiKey.objects.get(pk=created['id']).exhausted_until
        self.assertAlmostEqual((until - timezone.now()).total_seconds(), 7200, delta=30)

    def test_rejected_key_is_marked_invalid_and_skipped(self):
        bad, good = self.add('Revogada', self.KEY_A), self.add('Boa', self.KEY_B)
        patcher, calls = self.fake(lambda key: (401, {'error': 'Unauthorized'}, {}) if key == self.KEY_A else self.ok())
        with patcher:
            self.assertEqual(self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json').status_code, 200)
        self.assertEqual(AssistantApiKey.objects.get(pk=bad['id']).status, 'invalid')
        patcher, calls = self.fake(lambda key: self.ok())
        with patcher:
            self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json')
        self.assertEqual(calls, [self.KEY_B])

    def test_all_keys_exhausted_says_when_the_first_returns(self):
        self.add('Conta 1', self.KEY_A)
        self.add('Conta 2', self.KEY_B)
        patcher, calls = self.fake(lambda key: (429, {'error': 'limit'}, {}))
        with patcher:
            response = self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(calls, [self.KEY_A, self.KEY_B])
        self.assertIn('atingiram o limite', response.json()['message'])
        self.assertIn(':', response.json()['message'])

    def test_server_error_moves_to_next_key_without_penalizing_the_first(self):
        first = self.add('Conta 1', self.KEY_A)
        self.add('Conta 2', self.KEY_B)
        patcher, calls = self.fake(lambda key: (503, {'error': 'overloaded'}, {}) if key == self.KEY_A else self.ok())
        with patcher:
            self.assertEqual(self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json').status_code, 200)
        self.assertEqual(AssistantApiKey.objects.get(pk=first['id']).status, 'ok')

    def test_unknown_model_does_not_burn_through_the_keys(self):
        self.add('Conta 1', self.KEY_A)
        self.add('Conta 2', self.KEY_B)
        patcher, calls = self.fake(lambda key: (404, {'error': 'model not found'}, {}))
        with patcher:
            response = self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(len(calls), 1)
        self.assertIn('não encontrado', response.json()['message'])
        self.assertEqual({row.status for row in AssistantApiKey.objects.all()}, {'ok'})

    def test_no_keys_returns_a_clear_message_and_ai_is_off(self):
        response = self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertIn('Nenhuma chave', response.json()['message'])
        self.assertFalse(self.client.get('/api/assistant/insights').json()['ai_enabled'])
        self.add('Conta 1', self.KEY_A)
        self.assertTrue(self.client.get('/api/assistant/insights').json()['ai_enabled'])

    def test_unreadable_key_after_secret_change_is_flagged_not_crashing(self):
        created = self.add('Conta 1', self.KEY_A)
        with override_settings(SECRET_KEY='outra-chave-secreta-totalmente-diferente-0123456789'):
            patcher, calls = self.fake(lambda key: self.ok())
            with patcher:
                response = self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(calls, [])
        self.assertEqual(AssistantApiKey.objects.get(pk=created['id']).status, 'invalid')

    def test_test_endpoint_reset_and_model_setting(self):
        created = self.add('Conta 1', self.KEY_A)
        patcher, _ = self.fake(lambda key: self.ok('OK'))
        with patcher:
            result = self.client.post(f"/api/assistant/keys/{created['id']}/test").json()
        self.assertTrue(result['ok'])
        AssistantApiKey.objects.filter(pk=created['id']).update(exhausted_until=timezone.now() + timedelta(hours=1))
        reset = self.client.post(f"/api/assistant/keys/{created['id']}/reset").json()
        self.assertEqual(reset['status'], 'ok')
        self.assertEqual(self.client.put('/api/assistant/settings', {'model': 'gpt-oss:20b'}, format='json').json()['model'], 'gpt-oss:20b')
        self.assertEqual(self.client.put('/api/assistant/settings', {'model': 'a b; rm'}, format='json').status_code, 400)
        patcher, _ = self.fake(lambda key: self.ok())
        with patcher, mock.patch('core.ollama._call') as call:
            call.return_value = self.ok()
            self.client.post('/api/assistant/ask', {'question': 'Oi'}, format='json')
            self.assertEqual(call.call_args.kwargs['body']['model'], 'gpt-oss:20b')

    def test_replacing_the_key_clears_the_invalid_flag(self):
        created = self.add('Conta 1', self.KEY_A)
        AssistantApiKey.objects.filter(pk=created['id']).update(invalid=True, last_error='Chave recusada')
        response = self.client.patch(f"/api/assistant/keys/{created['id']}", {'key': self.KEY_C}, format='json')
        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(response.json()['status'], 'ok')
        self.assertEqual(response.json()['masked'], '••••CCCC')
