from django.db import transaction
from django.db.models import Sum
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .models import Establishment, EstablishmentProduct, Ingredient, Person, Product, ProductionBatch, RecipeItem, Sale, User


class IngredientSerializer(serializers.ModelSerializer):
    unit_cost = serializers.FloatField(read_only=True)

    class Meta:
        model = Ingredient
        fields = ['id', 'name', 'category', 'purchase_price', 'purchase_quantity', 'unit', 'stock', 'min_stock', 'unit_cost', 'created_at']

    def validate_purchase_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('A quantidade comprada deve ser maior que zero.')
        return value


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ['id', 'name', 'type', 'phone', 'email', 'commission', 'active', 'created_at']


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='display_name')
    active = serializers.BooleanField(source='is_active', required=False)
    person_id = serializers.PrimaryKeyRelatedField(source='person', queryset=Person.objects.all(), allow_null=True, required=False)
    person_name = serializers.CharField(source='person.name', read_only=True, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'person_id', 'person_name', 'active', 'password', 'date_joined']

    def validate(self, attrs):
        role = attrs.get('role', getattr(self.instance, 'role', 'admin'))
        person = attrs.get('person', getattr(self.instance, 'person', None))
        if role != 'admin' and (not person or person.type != role or not person.active):
            raise serializers.ValidationError('Vincule o acesso a um funcionário ativo do mesmo cargo.')
        if role != 'admin':
            duplicate = User.objects.filter(person=person, is_active=True)
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError('Este funcionário já possui outro acesso ativo.')
        return attrs

    def validate_password(self, value):
        if not value:
            return value
        try:
            validate_password(value, self.instance)
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages)) from error
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        role = validated_data.get('role', 'admin')
        if not password:
            raise serializers.ValidationError('Informe uma senha com pelo menos 8 caracteres.')
        if role == 'admin':
            validated_data['person'] = None
        validated_data['username'] = validated_data['email'].lower()
        validated_data['email'] = validated_data['email'].lower()
        validated_data['is_staff'] = role == 'admin'
        validated_data['is_superuser'] = role == 'admin'
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        if validated_data.get('role', instance.role) == 'admin':
            validated_data['person'] = None
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.username = instance.email.lower()
        instance.is_staff = instance.role == 'admin'
        instance.is_superuser = instance.role == 'admin'
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class RecipeInputSerializer(serializers.Serializer):
    ingredient_id = serializers.PrimaryKeyRelatedField(source='ingredient', queryset=Ingredient.objects.all())
    quantity = serializers.FloatField(min_value=0.000001)


class ProductSerializer(serializers.ModelSerializer):
    recipe = RecipeInputSerializer(many=True, write_only=True, required=False)
    unit_cost = serializers.SerializerMethodField()
    unit_profit = serializers.SerializerMethodField()
    margin = serializers.SerializerMethodField()
    available_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ['id', 'name', 'category', 'sale_price', 'packaging_cost', 'other_cost', 'sales_fee',
                  'seller_commission', 'producer_commission', 'cash_percentage', 'active', 'created_at',
                  'recipe', 'unit_cost', 'unit_profit', 'margin', 'available_stock']

    def get_unit_cost(self, obj):
        return obj.unit_cost

    def get_unit_profit(self, obj):
        deductions = obj.sale_price * (obj.sales_fee + obj.seller_commission + obj.producer_commission + obj.cash_percentage) / 100
        return obj.sale_price - obj.unit_cost - deductions

    def get_margin(self, obj):
        return self.get_unit_profit(obj) / obj.sale_price * 100 if obj.sale_price else 0

    def get_available_stock(self, obj):
        produced = obj.production_batches.filter(status='completed').aggregate(total=Sum('quantity'))['total'] or 0
        sold = obj.sales.exclude(status='cancelled').aggregate(total=Sum('quantity'))['total'] or 0
        return produced - sold

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.context.get('detail'):
            data['recipe'] = [{
                'id': item.id, 'ingredient_id': item.ingredient_id, 'quantity': item.quantity,
                'name': item.ingredient.name, 'unit': item.ingredient.unit,
                'cost': item.quantity * item.ingredient.unit_cost,
            } for item in instance.recipe_items.select_related('ingredient').order_by('ingredient__name')]
        return data

    @transaction.atomic
    def create(self, validated_data):
        recipe = validated_data.pop('recipe', [])
        product = Product.objects.create(**validated_data)
        RecipeItem.objects.bulk_create([RecipeItem(product=product, **item) for item in recipe])
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        recipe = validated_data.pop('recipe', None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if recipe is not None:
            instance.recipe_items.all().delete()
            RecipeItem.objects.bulk_create([RecipeItem(product=instance, **item) for item in recipe])
        return instance


class ProductOperationalSerializer(serializers.ModelSerializer):
    """Dados mínimos necessários para lançar uma venda ou produção."""

    class Meta:
        model = Product
        fields = ['id', 'name', 'category', 'sale_price', 'active']


class EstablishmentProductInputSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(source='product', queryset=Product.objects.all())
    commission = serializers.FloatField(min_value=0, max_value=100)


class EstablishmentSerializer(serializers.ModelSerializer):
    products = EstablishmentProductInputSerializer(many=True, write_only=True, required=False)
    product_count = serializers.SerializerMethodField()
    product_ids = serializers.SerializerMethodField()
    revenue = serializers.SerializerMethodField()
    earnings = serializers.SerializerMethodField()
    units_sold = serializers.SerializerMethodField()

    class Meta:
        model = Establishment
        fields = ['id', 'name', 'contact_name', 'phone', 'address', 'active', 'created_at', 'products',
                  'product_count', 'product_ids', 'revenue', 'earnings', 'units_sold']

    def active_sales(self, obj):
        return obj.sales.exclude(status='cancelled')

    def get_product_count(self, obj):
        return obj.product_links.filter(active=True).count()

    def get_product_ids(self, obj):
        return ','.join(str(value) for value in obj.product_links.filter(active=True).values_list('product_id', flat=True))

    def get_revenue(self, obj):
        return sum(sale.quantity * sale.unit_price for sale in self.active_sales(obj))

    def get_earnings(self, obj):
        return sum(sale.quantity * sale.unit_price * sale.partner_commission / 100 for sale in self.active_sales(obj))

    def get_units_sold(self, obj):
        return sum(sale.quantity for sale in self.active_sales(obj))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.context.get('detail'):
            data['products'] = [{
                'product_id': link.product_id, 'commission': link.commission, 'active': link.active,
                'name': link.product.name, 'sale_price': link.product.sale_price,
            } for link in instance.product_links.select_related('product').order_by('product__name')]
        return data

    @transaction.atomic
    def create(self, validated_data):
        products = validated_data.pop('products', [])
        establishment = Establishment.objects.create(**validated_data)
        EstablishmentProduct.objects.bulk_create([EstablishmentProduct(establishment=establishment, **item) for item in products])
        return establishment

    @transaction.atomic
    def update(self, instance, validated_data):
        products = validated_data.pop('products', None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if products is not None:
            instance.product_links.all().delete()
            EstablishmentProduct.objects.bulk_create([EstablishmentProduct(establishment=instance, **item) for item in products])
        return instance


class EstablishmentOperationalSerializer(serializers.ModelSerializer):
    product_ids = serializers.SerializerMethodField()

    class Meta:
        model = Establishment
        fields = ['id', 'name', 'active', 'product_ids']

    def get_product_ids(self, obj):
        return ','.join(str(value) for value in obj.product_links.filter(active=True).values_list('product_id', flat=True))


class ProductionSerializer(serializers.ModelSerializer):
    product_id = serializers.PrimaryKeyRelatedField(source='product', queryset=Product.objects.filter(active=True))
    producer_id = serializers.PrimaryKeyRelatedField(source='producer', queryset=Person.objects.filter(type='producer', active=True), allow_null=True, required=False)
    product_name = serializers.CharField(source='product.name', read_only=True)
    producer_name = serializers.CharField(source='producer.name', read_only=True, allow_null=True)
    total_cost = serializers.SerializerMethodField()
    quantity = serializers.IntegerField(min_value=1)

    class Meta:
        model = ProductionBatch
        fields = ['id', 'product_id', 'producer_id', 'quantity', 'status', 'produced_at', 'notes', 'created_at', 'product_name', 'producer_name', 'total_cost']

    def get_total_cost(self, obj):
        return obj.product.unit_cost * obj.quantity


class SaleSerializer(serializers.ModelSerializer):
    product_id = serializers.PrimaryKeyRelatedField(source='product', queryset=Product.objects.filter(active=True))
    seller_id = serializers.PrimaryKeyRelatedField(source='seller', queryset=Person.objects.filter(type='seller', active=True), allow_null=True, required=False)
    producer_id = serializers.PrimaryKeyRelatedField(source='producer', queryset=Person.objects.filter(type='producer', active=True), allow_null=True, required=False)
    establishment_id = serializers.PrimaryKeyRelatedField(source='establishment', queryset=Establishment.objects.filter(active=True), allow_null=True, required=False)
    product_name = serializers.CharField(source='product.name', read_only=True)
    seller_name = serializers.CharField(source='seller.name', read_only=True, allow_null=True)
    producer_name = serializers.CharField(source='producer.name', read_only=True, allow_null=True)
    establishment_name = serializers.CharField(source='establishment.name', read_only=True, allow_null=True)
    total = serializers.SerializerMethodField()
    estimated_cost = serializers.SerializerMethodField()
    seller_earning = serializers.SerializerMethodField()
    quantity = serializers.IntegerField(min_value=1)

    class Meta:
        model = Sale
        fields = ['id', 'product_id', 'seller_id', 'producer_id', 'establishment_id', 'partner_commission',
                  'quantity', 'unit_price', 'channel', 'status', 'sold_at', 'created_at', 'product_name',
                  'seller_name', 'producer_name', 'establishment_name', 'total', 'estimated_cost', 'seller_earning']
        read_only_fields = ['partner_commission']

    def get_total(self, obj):
        return obj.quantity * obj.unit_price

    def get_estimated_cost(self, obj):
        return obj.quantity * obj.product.unit_cost

    def get_seller_earning(self, obj):
        return obj.quantity * obj.unit_price * obj.product.seller_commission / 100

    def validate(self, attrs):
        establishment = attrs.get('establishment')
        product = attrs.get('product', getattr(self.instance, 'product', None))
        if establishment and not EstablishmentProduct.objects.filter(establishment=establishment, product=product, active=True).exists():
            raise serializers.ValidationError('Este produto não está cadastrado para o estabelecimento selecionado.')
        return attrs

    def save(self, **kwargs):
        establishment = kwargs.get('establishment', self.validated_data.get('establishment'))
        product = kwargs.get('product', self.validated_data.get('product', getattr(self.instance, 'product', None)))
        if establishment:
            kwargs['partner_commission'] = EstablishmentProduct.objects.get(establishment=establishment, product=product, active=True).commission
        else:
            kwargs['partner_commission'] = 0
        return super().save(**kwargs)
