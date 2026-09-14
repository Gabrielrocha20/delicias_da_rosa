from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import (
    Establishment,
    EstablishmentProduct,
    Ingredient,
    Person,
    Product,
    ProductionBatch,
    RecipeItem,
    Sale,
    User,
)
from .services import dashboard_data, transparency_data


class FinancialUnitTests(TestCase):
    def setUp(self):
        self.seller = User.objects.get(email='vendedor@rosascandy.com')
        self.producer = User.objects.get(email='produtor@rosascandy.com')
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
        self.admin = User.objects.get(email='admin@rosascandy.com')
        self.seller = User.objects.get(email='vendedor@rosascandy.com')
        self.producer = User.objects.get(email='produtor@rosascandy.com')
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
        self.admin = User.objects.get(email='admin@rosascandy.com')
        self.producer = User.objects.get(email='produtor@rosascandy.com').person
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
