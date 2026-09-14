from django.contrib import admin
from django.urls import include, path, re_path
from core.views import frontend_asset, frontend_index

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('api/', include('core.urls')),
    re_path(r'^assets/(?P<path>.*)$', frontend_asset),
    re_path(r'^(?!api/|django-admin/).+$', frontend_index),
    path('', frontend_index),
]
