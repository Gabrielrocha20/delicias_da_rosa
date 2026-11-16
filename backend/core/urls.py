from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import (
    AssistantAskView,
    AssistantInsightsView,
    DashboardView,
    EstablishmentViewSet,
    CashMovementViewSet,
    IngredientViewSet,
    PersonViewSet,
    ProductViewSet,
    ProductionViewSet,
    SaleViewSet,
    TransparencyView,
    UserViewSet,
    health,
    login,
    me,
    logout,
    change_password,
)

router = SimpleRouter(trailing_slash=False)
router.register('ingredients', IngredientViewSet, basename='ingredients')
router.register('people', PersonViewSet, basename='people')
router.register('users', UserViewSet, basename='users')
router.register('products', ProductViewSet, basename='products')
router.register('establishments', EstablishmentViewSet, basename='establishments')
router.register('production', ProductionViewSet, basename='production')
router.register('sales', SaleViewSet, basename='sales')
router.register('cash-movements', CashMovementViewSet, basename='cash-movements')

urlpatterns = [
    path('health', health),
    path('auth/login', login),
    path('auth/me', me),
    path('auth/logout', logout),
    path('auth/password', change_password),
    path('assistant/insights', AssistantInsightsView.as_view()),
    path('assistant/ask', AssistantAskView.as_view()),
    path('dashboard', DashboardView.as_view()),
    path('transparency', TransparencyView.as_view()),
] + router.urls
