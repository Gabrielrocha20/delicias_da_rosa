from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Establishment, EstablishmentProduct, Ingredient, Person, Product, ProductionBatch, ProductionConsumption, RecipeItem, Sale, User


@admin.register(User)
class RosaUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('Rosa’s Candy', {'fields': ('display_name', 'role', 'person')}),)
    list_display = ('username', 'display_name', 'email', 'role', 'person', 'is_active')


admin.site.register([Person, Ingredient, Product, RecipeItem, ProductionBatch, ProductionConsumption, Sale, Establishment, EstablishmentProduct])
