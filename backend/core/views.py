from pathlib import Path

from django.conf import settings
from django.db import models, transaction
from django.contrib.auth import authenticate
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.views.static import serve
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from .models import CashMovement, Establishment, Ingredient, Person, Product, ProductionBatch, ProductionConsumption, Sale, User
from .permissions import IsAdminOrProducer, IsAdminOrSeller, IsAdminRole
from .serializers import (
    EstablishmentSerializer,
    CashMovementSerializer,
    EstablishmentOperationalSerializer,
    IngredientSerializer,
    PersonSerializer,
    ProductSerializer,
    ProductOperationalSerializer,
    ProductionSerializer,
    SaleSerializer,
    UserSerializer,
)
from .services import dashboard_data, transparency_data


def user_payload(user):
    return {
        'id': user.id,
        'name': user.display_name,
        'email': user.email,
        'role': user.role,
        'person_id': user.person_id,
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'ok': True, 'service': 'Rosa’s Candy Django API'})


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    email = str(request.data.get('email', '')).strip().lower()
    password = str(request.data.get('password', ''))
    try:
        account = User.objects.get(email__iexact=email, is_active=True)
    except User.DoesNotExist:
        account = None
    user = authenticate(request, username=account.username, password=password) if account else None
    if not user:
        return Response({'message': 'E-mail ou senha incorretos.'}, status=status.HTTP_401_UNAUTHORIZED)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': user_payload(user)})


@api_view(['GET'])
def me(request):
    return Response({'user': user_payload(request.user)})


class DeactivateMixin:
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.active = False
        instance.save(update_fields=['active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class IngredientViewSet(ModelViewSet):
    queryset = Ingredient.objects.all().order_by('name')
    serializer_class = IngredientSerializer
    permission_classes = [IsAdminRole]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.recipe_items.exists():
            return Response({'message': 'Este insumo faz parte de uma receita e não pode ser removido.'}, status=409)
        return super().destroy(request, *args, **kwargs)


class PersonViewSet(DeactivateMixin, ModelViewSet):
    serializer_class = PersonSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        queryset = Person.objects.all().order_by('-active', 'name')
        person_type = self.request.query_params.get('type')
        return queryset.filter(type=person_type) if person_type else queryset


class UserViewSet(ModelViewSet):
    queryset = User.objects.select_related('person').all().order_by('-is_active', 'display_name')
    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.pk == request.user.pk:
            return Response({'message': 'Você não pode desativar seu próprio acesso.'}, status=400)
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        Token.objects.filter(user=instance).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductViewSet(DeactivateMixin, ModelViewSet):
    queryset = Product.objects.prefetch_related('recipe_items__ingredient').all().order_by('-active', 'name')
    serializer_class = ProductSerializer

    def get_permissions(self):
        return [IsAuthenticated()] if self.action == 'list' else [IsAdminRole()]

    def get_serializer_class(self):
        if self.action == 'list' and self.request.user.role != 'admin':
            return ProductOperationalSerializer
        return ProductSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['detail'] = self.action == 'retrieve'
        return context


class EstablishmentViewSet(DeactivateMixin, ModelViewSet):
    queryset = Establishment.objects.prefetch_related('product_links__product', 'sales__product').all().order_by('-active', 'name')
    serializer_class = EstablishmentSerializer

    def get_permissions(self):
        return [IsAuthenticated()] if self.action == 'list' else [IsAdminRole()]

    def get_serializer_class(self):
        if self.action == 'list' and self.request.user.role != 'admin':
            return EstablishmentOperationalSerializer
        return EstablishmentSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['detail'] = self.action == 'retrieve'
        return context


class ProductionViewSet(ModelViewSet):
    serializer_class = ProductionSerializer
    permission_classes = [IsAdminOrProducer]

    def get_queryset(self):
        queryset = ProductionBatch.objects.select_related('product', 'producer').order_by('-produced_at')
        return queryset if self.request.user.role == 'admin' else queryset.filter(producer=self.request.user.person)

    def consume_ingredients(self, batch):
        recipe = list(batch.product.recipe_items.values('ingredient_id', 'quantity'))
        required = {item['ingredient_id']: item['quantity'] * batch.quantity for item in recipe}
        ingredients = list(Ingredient.objects.select_for_update().filter(pk__in=required).order_by('pk'))
        unavailable = [
            f"{ingredient.name} ({ingredient.stock:g} {ingredient.unit}; precisa de {required[ingredient.id]:g} {ingredient.unit})"
            for ingredient in ingredients if ingredient.stock < required[ingredient.id]
        ]
        if unavailable:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'status': 'Estoque insuficiente para concluir a produção: ' + ', '.join(unavailable) + '.'})
        for ingredient in ingredients:
            ingredient.stock -= required[ingredient.id]
            ingredient.save(update_fields=['stock'])
        ProductionConsumption.objects.bulk_create([
            ProductionConsumption(batch=batch, ingredient_id=ingredient_id, quantity=quantity)
            for ingredient_id, quantity in required.items()
        ])
        batch.ingredients_consumed = True
        batch.save(update_fields=['ingredients_consumed'])

    def restore_ingredients(self, batch):
        consumptions = list(batch.consumptions.values('ingredient_id', 'quantity'))
        quantities = {item['ingredient_id']: item['quantity'] for item in consumptions}
        ingredients = Ingredient.objects.select_for_update().filter(pk__in=quantities).order_by('pk')
        for ingredient in ingredients:
            ingredient.stock += quantities[ingredient.id]
            ingredient.save(update_fields=['stock'])
        batch.consumptions.all().delete()
        batch.ingredients_consumed = False
        batch.save(update_fields=['ingredients_consumed'])

    @transaction.atomic
    def perform_create(self, serializer):
        producer = self.request.user.person if self.request.user.role == 'producer' else serializer.validated_data.get('producer')
        if not producer:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Informe o produtor responsável.')
        batch = serializer.save(producer=producer)
        if batch.status == 'completed':
            self.consume_ingredients(batch)

    @transaction.atomic
    def perform_update(self, serializer):
        producer = self.request.user.person if self.request.user.role == 'producer' else serializer.validated_data.get('producer', serializer.instance.producer)
        batch = serializer.instance
        if batch.ingredients_consumed:
            self.restore_ingredients(batch)
        batch = serializer.save(producer=producer)
        if batch.status == 'completed':
            self.consume_ingredients(batch)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        batch = self.get_object()
        if batch.ingredients_consumed:
            self.restore_ingredients(batch)
        batch.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SaleViewSet(ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [IsAdminOrSeller]

    def get_queryset(self):
        queryset = Sale.objects.select_related('product', 'seller', 'producer', 'establishment').order_by('-sold_at')
        return queryset if self.request.user.role == 'admin' else queryset.filter(seller=self.request.user.person)

    def resolved_producer(self, serializer):
        producer = serializer.validated_data.get('producer')
        if producer:
            return producer
        product = serializer.validated_data.get('product', getattr(serializer.instance, 'product', None))
        latest = ProductionBatch.objects.filter(
            product=product, status='completed', producer__isnull=False
        ).order_by('-produced_at').first()
        return latest.producer if latest else None

    def perform_create(self, serializer):
        seller = self.request.user.person if self.request.user.role == 'seller' else serializer.validated_data.get('seller')
        if not seller:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Informe o vendedor responsável.')
        serializer.save(seller=seller, producer=self.resolved_producer(serializer))

    def perform_update(self, serializer):
        seller = self.request.user.person if self.request.user.role == 'seller' else serializer.validated_data.get('seller', serializer.instance.seller)
        serializer.save(seller=seller, producer=self.resolved_producer(serializer))


class CashMovementViewSet(ModelViewSet):
    queryset = CashMovement.objects.all()
    serializer_class = CashMovementSerializer
    permission_classes = [IsAdminRole]

    def list(self, request, *args, **kwargs):
        paid_sales = Sale.objects.filter(status='paid').aggregate(total=models.Sum(models.F('quantity') * models.F('unit_price')))['total'] or 0
        income = CashMovement.objects.filter(type=CashMovement.INCOME).aggregate(total=models.Sum('amount'))['total'] or 0
        expenses = CashMovement.objects.filter(type=CashMovement.EXPENSE).aggregate(total=models.Sum('amount'))['total'] or 0
        return Response({
            'balance': paid_sales + income - expenses,
            'sales_income': paid_sales,
            'manual_income': income,
            'expenses': expenses,
            'movements': self.get_serializer(self.get_queryset(), many=True).data,
        })


class DashboardView(APIView):
    def get(self, request):
        return Response(dashboard_data(request.user, request.query_params.get('range'), request.query_params.get('start'), request.query_params.get('end')))


class TransparencyView(APIView):
    def get(self, request):
        return Response(transparency_data(request.query_params.get('range'), request.query_params.get('start'), request.query_params.get('end')))


def frontend_asset(request, path):
    root = Path(settings.BASE_DIR).parent / 'frontend' / 'dist' / 'assets'
    return serve(request, path, document_root=root)


def frontend_index(request):
    index = Path(settings.BASE_DIR).parent / 'frontend' / 'dist' / 'index.html'
    if not index.exists():
        raise Http404('Execute npm run build para gerar o frontend.')
    return FileResponse(index.open('rb'), content_type='text/html')
