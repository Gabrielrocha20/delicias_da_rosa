from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    message = 'Seu cargo não possui permissão para esta operação.'

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role == 'admin')


class IsAdminOrSeller(BasePermission):
    message = 'Seu cargo não possui permissão para esta operação.'

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role in ('admin', 'seller'))


class IsAdminOrProducer(BasePermission):
    message = 'Seu cargo não possui permissão para esta operação.'

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role in ('admin', 'producer'))
