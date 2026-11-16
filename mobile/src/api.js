import * as SecureStore from 'expo-secure-store';

const KEYS = { server: 'mivi_server', token: 'mivi_token', user: 'mivi_user' };
let session = { server: '', token: '', user: null };
let onExpired = () => {};

/* Aceita "painel.seudominio.com.br", "https://…" ou "http://192.168.0.10:3333" e devolve a base da API. */
export function normalizeServer(input) {
  let value = String(input || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  if (!/\/api$/i.test(value)) value = `${value}/api`;
  return value;
}

export async function loadSession() {
  const [server, token, user] = await Promise.all([
    SecureStore.getItemAsync(KEYS.server), SecureStore.getItemAsync(KEYS.token), SecureStore.getItemAsync(KEYS.user),
  ]);
  let parsed = null;
  try { parsed = user ? JSON.parse(user) : null; } catch { parsed = null; }
  session = { server: server || '', token: token || '', user: parsed };
  return session;
}

export function getSession() {
  return session;
}

export function setExpiredHandler(handler) {
  onExpired = handler;
}

async function saveSession(next) {
  session = next;
  await Promise.all([
    SecureStore.setItemAsync(KEYS.server, next.server || ''),
    next.token ? SecureStore.setItemAsync(KEYS.token, next.token) : SecureStore.deleteItemAsync(KEYS.token),
    next.user ? SecureStore.setItemAsync(KEYS.user, JSON.stringify(next.user)) : SecureStore.deleteItemAsync(KEYS.user),
  ]);
}

export async function api(path, { method = 'GET', body, server } = {}) {
  const base = server || session.server;
  if (!base) throw new Error('Informe o endereço do servidor.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(session.token && !server ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Confira a internet e o endereço.');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 && path !== '/auth/login') {
    await saveSession({ ...session, token: '', user: null });
    onExpired();
    throw new Error('Sua sessão expirou. Entre de novo.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Erro ${response.status} no servidor.`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function login(serverInput, email, password) {
  const server = normalizeServer(serverInput);
  await api('/health', { server });
  const data = await api('/auth/login', { method: 'POST', body: { email, password }, server });
  await saveSession({ server, token: data.token, user: data.user });
  return data.user;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* token já inválido */ }
  await saveSession({ ...session, token: '', user: null });
}

export async function changePassword(current, next) {
  const data = await api('/auth/password', { method: 'POST', body: { current_password: current, new_password: next } });
  await saveSession({ ...session, token: data.token, user: data.user });
}
