"""Criptografia das chaves de API guardadas no banco.

A chave de criptografia é derivada da DJANGO_SECRET_KEY. Se ela mudar, as chaves salvas ficam
ilegíveis e precisam ser cadastradas de novo (decrypt devolve None em vez de quebrar).
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet():
    digest = hashlib.sha256(f'doces-mivi:assistant-keys:{settings.SECRET_KEY}'.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plain):
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token):
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None
