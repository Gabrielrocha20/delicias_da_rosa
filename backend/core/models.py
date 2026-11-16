from django.contrib.auth.models import AbstractUser
from django.db import models


class Person(models.Model):
    SELLER = 'seller'
    PRODUCER = 'producer'
    TYPE_CHOICES = [(SELLER, 'Vendedor'), (PRODUCER, 'Produtor')]

    name = models.CharField(max_length=160)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    commission = models.FloatField(default=0)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class User(AbstractUser):
    ADMIN = 'admin'
    SELLER = 'seller'
    PRODUCER = 'producer'
    ROLE_CHOICES = [(ADMIN, 'Administrador'), (SELLER, 'Vendedor'), (PRODUCER, 'Produtor')]

    display_name = models.CharField(max_length=160)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ADMIN)
    person = models.ForeignKey(Person, null=True, blank=True, on_delete=models.PROTECT, related_name='accesses')

    def __str__(self):
        return self.display_name or self.username


class Ingredient(models.Model):
    name = models.CharField(max_length=160)
    category = models.CharField(max_length=100, default='Ingredientes')
    purchase_price = models.FloatField(default=0)
    purchase_quantity = models.FloatField(default=1)
    unit = models.CharField(max_length=20, default='g')
    stock = models.FloatField(default=0)
    min_stock = models.FloatField(default=0)
    supplier = models.CharField(max_length=160, blank=True)
    brand = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    last_purchase_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def unit_cost(self):
        return self.purchase_price / self.purchase_quantity if self.purchase_quantity else 0

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=160)
    category = models.CharField(max_length=100, default='Bolo de pote')
    sale_price = models.FloatField(default=0)
    packaging_cost = models.FloatField(default=0)
    other_cost = models.FloatField(default=0)
    sales_fee = models.FloatField(default=0)
    seller_commission = models.FloatField(default=0)
    producer_commission = models.FloatField(default=0)
    cash_percentage = models.FloatField(default=20)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def recipe_cost(self):
        return sum(item.quantity * item.ingredient.unit_cost for item in self.recipe_items.all())

    @property
    def unit_cost(self):
        return self.recipe_cost + self.packaging_cost + self.other_cost

    def __str__(self):
        return self.name


class RecipeItem(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='recipe_items')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='recipe_items')
    quantity = models.FloatField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['product', 'ingredient'], name='unique_product_ingredient')]


class Establishment(models.Model):
    name = models.CharField(max_length=160)
    contact_name = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=255, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class EstablishmentProduct(models.Model):
    establishment = models.ForeignKey(Establishment, on_delete=models.CASCADE, related_name='product_links')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='establishment_links')
    commission = models.FloatField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['establishment', 'product'], name='unique_establishment_product')]


class ProductionBatch(models.Model):
    STATUS_CHOICES = [('planned', 'Planejada'), ('in_progress', 'Em produção'), ('completed', 'Concluída')]
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='production_batches')
    producer = models.ForeignKey(Person, null=True, on_delete=models.PROTECT, related_name='production_batches')
    quantity = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')
    produced_at = models.DateTimeField()
    notes = models.TextField(blank=True)
    ingredients_consumed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class ProductionConsumption(models.Model):
    """Snapshot dos insumos efetivamente baixados por um lote concluído."""

    batch = models.ForeignKey(ProductionBatch, on_delete=models.CASCADE, related_name='consumptions')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='production_consumptions')
    quantity = models.FloatField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['batch', 'ingredient'], name='unique_batch_ingredient_consumption')]


class Sale(models.Model):
    STATUS_CHOICES = [('paid', 'Pago'), ('pending', 'Pendente'), ('cancelled', 'Cancelado')]
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='sales')
    seller = models.ForeignKey(Person, null=True, on_delete=models.PROTECT, related_name='sales_as_seller')
    producer = models.ForeignKey(Person, null=True, on_delete=models.PROTECT, related_name='sales_as_producer')
    establishment = models.ForeignKey(Establishment, null=True, blank=True, on_delete=models.PROTECT, related_name='sales')
    partner_commission = models.FloatField(default=0)
    quantity = models.PositiveIntegerField()
    unit_price = models.FloatField()
    channel = models.CharField(max_length=60, default='Direto')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='paid')
    sold_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)


class CashMovement(models.Model):
    INCOME = 'income'
    EXPENSE = 'expense'
    TYPE_CHOICES = [(INCOME, 'Entrada'), (EXPENSE, 'Saída')]

    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    category = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    amount = models.FloatField()
    occurred_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-occurred_at', '-id']


class StockMovement(models.Model):
    """Histórico de tudo que entra e sai do estoque de um insumo (sempre na unidade de uso)."""

    PURCHASE = 'purchase'
    ADJUSTMENT = 'adjustment'
    LOSS = 'loss'
    PRODUCTION = 'production'
    TYPE_CHOICES = [
        (PURCHASE, 'Compra'), (ADJUSTMENT, 'Ajuste de inventário'),
        (LOSS, 'Perda'), (PRODUCTION, 'Consumo na produção'),
    ]

    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE, related_name='movements')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    quantity = models.FloatField(help_text='Positivo entra, negativo sai.')
    stock_after = models.FloatField(default=0)
    total_cost = models.FloatField(null=True, blank=True)
    supplier = models.CharField(max_length=160, blank=True)
    note = models.CharField(max_length=255, blank=True)
    batch = models.ForeignKey(ProductionBatch, null=True, blank=True, on_delete=models.CASCADE, related_name='stock_movements')
    cash_movement = models.ForeignKey(CashMovement, null=True, blank=True, on_delete=models.SET_NULL, related_name='stock_movements')
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='stock_movements')
    occurred_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-occurred_at', '-id']


class AssistantConfig(models.Model):
    """Configuração única do assistente (linha de id 1)."""

    model = models.CharField(max_length=120, default='gemma4:31b')

    @classmethod
    def current(cls):
        config, _ = cls.objects.get_or_create(pk=1)
        return config


class AssistantApiKey(models.Model):
    """Chave do Ollama Cloud. O segredo fica criptografado; a API nunca o devolve."""

    name = models.CharField(max_length=120)
    secret = models.TextField()
    last4 = models.CharField(max_length=8, blank=True)
    active = models.BooleanField(default=True)
    invalid = models.BooleanField(default=False)
    exhausted_until = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=255, blank=True)
    requests_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    @property
    def status(self):
        from django.utils import timezone
        if self.invalid:
            return 'invalid'
        if not self.active:
            return 'inactive'
        if self.exhausted_until and self.exhausted_until > timezone.now():
            return 'exhausted'
        return 'ok'

    def __str__(self):
        return self.name
