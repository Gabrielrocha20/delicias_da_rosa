"""Cliente do Ollama Cloud com rodízio de chaves.

As chaves são usadas na ordem em que foram cadastradas. Quando uma atinge o limite (HTTP 429, ou 402/403 de
cota), ela fica de molho até a janela renovar e a próxima assume; quando uma é recusada (401), é marcada como
inválida. Erros do servidor (5xx) passam para a próxima chave sem penalizar a atual.
Usa só a biblioteca padrão: sem dependências extras para instalar no servidor.
"""

import json
import logging
import os
import re
import urllib.error
import urllib.request
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from . import vault
from .models import AssistantApiKey, AssistantConfig

logger = logging.getLogger(__name__)

BASE_URL = os.getenv('OLLAMA_BASE_URL', 'https://ollama.com').rstrip('/')
COOLDOWN = timedelta(minutes=int(os.getenv('OLLAMA_COOLDOWN_MINUTES', '60')))
MAX_COOLDOWN = timedelta(hours=24)
TIMEOUT = int(os.getenv('OLLAMA_TIMEOUT_SECONDS', '90'))
QUOTA_WORDS = re.compile(r'limit|quota|usage|exceed|exhaust|credit|too many', re.I)


class OllamaError(Exception):
    """Falha que não adianta resolver trocando de chave (modelo inexistente, sem rede...)."""


class NoKeyAvailable(OllamaError):
    """Nenhuma chave pronta para uso agora."""


def _call(method, path, *, key=None, body=None, timeout=TIMEOUT):
    """Devolve (status, dados_json, headers). Só levanta OllamaError se não houver conexão."""
    headers = {'Accept': 'application/json'}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    if key:
        headers['Authorization'] = f'Bearer {key}'
    request = urllib.request.Request(f'{BASE_URL}{path}', data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw, status, response_headers = response.read(), response.status, response.headers
    except urllib.error.HTTPError as error:
        raw, status, response_headers = error.read(), error.code, error.headers
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        logger.warning('Ollama inacessível: %s', error)
        raise OllamaError('Sem conexão com o Ollama Cloud. Tente de novo em instantes.') from error
    try:
        payload = json.loads(raw.decode('utf-8', 'replace')) if raw else {}
    except ValueError:
        payload = {'error': raw.decode('utf-8', 'replace')[:200]}
    return status, payload, response_headers


def _retry_after(headers):
    try:
        seconds = int(headers.get('Retry-After', ''))
    except (TypeError, ValueError):
        return COOLDOWN
    return min(max(timedelta(seconds=seconds), timedelta(minutes=1)), MAX_COOLDOWN)


def _message(payload):
    value = payload.get('error') if isinstance(payload, dict) else None
    return str(value)[:200] if value else ''


def attempt(key, model, messages):
    """Uma chamada com uma chave, atualizando o estado dela. Devolve (tipo, conteúdo).

    tipos: ok (texto) · exhausted (até quando) · invalid · server (tentar a próxima) · fatal (mensagem)."""
    secret = vault.decrypt(key.secret)
    if secret is None:
        key.invalid = True
        key.last_error = 'Chave ilegível (a chave secreta do servidor mudou). Cadastre-a de novo.'
        key.save(update_fields=['invalid', 'last_error'])
        return 'invalid', key.last_error

    status, payload, headers = _call('POST', '/api/chat', key=secret, body={
        'model': model, 'messages': messages, 'stream': False, 'options': {'temperature': 0.3},
    })
    detail = _message(payload)
    now = timezone.now()

    if status == 200:
        text = ((payload.get('message') or {}).get('content') or '').strip()
        key.last_used_at, key.last_error, key.exhausted_until = now, '', None
        key.requests_count += 1
        key.save(update_fields=['last_used_at', 'last_error', 'exhausted_until', 'requests_count'])
        if not text:
            return 'fatal', 'O modelo não devolveu resposta. Tente reformular a pergunta.'
        return 'ok', text

    if status == 429 or status == 402 or (status == 403 and QUOTA_WORDS.search(detail)):
        until = now + _retry_after(headers)
        key.exhausted_until = until
        key.last_error = (detail or 'Limite de uso atingido.')[:255]
        key.save(update_fields=['exhausted_until', 'last_error'])
        return 'exhausted', until

    if status in (401, 403):
        key.invalid = True
        key.last_error = 'Chave recusada pelo Ollama (revogada ou digitada errada).'
        key.save(update_fields=['invalid', 'last_error'])
        return 'invalid', key.last_error

    if status >= 500:
        key.last_error = f'Erro {status} no Ollama.'
        key.save(update_fields=['last_error'])
        return 'server', key.last_error

    if status == 404:
        return 'fatal', f'Modelo “{model}” não encontrado no Ollama Cloud. Escolha outro em Configurações.'
    return 'fatal', detail or f'O Ollama recusou o pedido (erro {status}).'


def usable_keys():
    now = timezone.now()
    return AssistantApiKey.objects.filter(active=True, invalid=False).filter(
        Q(exhausted_until__isnull=True) | Q(exhausted_until__lte=now)).order_by('id')


def _unavailable_reason():
    keys = list(AssistantApiKey.objects.all())
    if not keys:
        return 'Nenhuma chave do Ollama cadastrada. Cadastre uma em Configurações.'
    working = [key for key in keys if key.active and not key.invalid]
    if not working:
        return 'Todas as chaves do Ollama estão desativadas ou foram recusadas. Revise em Configurações.'
    soonest = min(key.exhausted_until for key in working if key.exhausted_until)
    return f'Todas as chaves atingiram o limite de uso. A primeira volta às {timezone.localtime(soonest):%H:%M}.'


def chat(messages):
    """Responde usando a primeira chave disponível e troca de chave quando uma não puder atender."""
    model = AssistantConfig.current().model
    server_error = None
    for key in list(usable_keys()):
        kind, content = attempt(key, model, messages)
        if kind == 'ok':
            return content
        if kind == 'fatal':
            raise OllamaError(content)
        if kind == 'server':
            server_error = content
        logger.info('Ollama: chave %s (%s) -> %s, tentando a próxima', key.id, key.name, kind)
    if server_error:
        raise OllamaError('O Ollama Cloud está instável no momento. Tente de novo em instantes.')
    raise NoKeyAvailable(_unavailable_reason())


def test_key(key):
    """Teste curto de uma chave específica. Devolve (ok, mensagem)."""
    model = AssistantConfig.current().model
    kind, content = attempt(key, model, [{'role': 'user', 'content': 'Responda apenas: OK'}])
    if kind == 'ok':
        return True, 'Chave funcionando.'
    if kind == 'exhausted':
        return False, f'Limite atingido; volta às {timezone.localtime(content):%H:%M}.'
    return False, content


def list_models():
    """Modelos de texto disponíveis no Ollama Cloud (lista pública, não precisa de chave)."""
    status, payload, _ = _call('GET', '/api/tags', timeout=20)
    if status != 200:
        raise OllamaError('Não foi possível carregar a lista de modelos.')
    names = [model.get('name') for model in payload.get('models', [])
             if 'completion' in (model.get('capabilities') or []) and model.get('name')]
    return sorted(names)
