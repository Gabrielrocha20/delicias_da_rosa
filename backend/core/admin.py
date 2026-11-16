from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CashMovement, Establishment, EstablishmentProduct, Ingredient, Person, Product, ProductionBatch, ProductionConsumption, RecipeItem, Sale, StockMovement, User


@admin.register(User)
class MiviUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('Doces Mivi', {'fields': ('display_name', 'role', 'person')}),)
    list_display = ('username', 'display_name', 'email', 'role', 'person', 'is_active')


admin.site.register([Person, Ingredient, Product, RecipeItem, ProductionBatch, ProductionConsumption, Sale, Establishment, EstablishmentProduct, CashMovement, StockMovement])

admin.site.site_header = 'Doces Mivi · administração'
admin.site.site_title = 'Doces Mivi'
admin.site.index_title = 'Cadastros'
