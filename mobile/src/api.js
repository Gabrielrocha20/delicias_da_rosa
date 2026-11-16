import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const KEYS = { token: 'mivi_token', user: 'mivi_user' };
let session = { token: '', user: null };
let onExpired = () => {};

export async function loadSession() {
  const [token, user] = await Promise.all([SecureStore.getItemAsync(KEYS.token), SecureStore.getItemAsync(KEYS.user)]);
  let parsed = null;
  try { parsed = user ? JSON.parse(user) : null; } catch { parsed = null; }
  session = { token: token || '', user: parsed };
  // Versões antigas guardavam o endereço do servidor digitado no login; agora ele é fixo.
  SecureStore.deleteItemAsync('mivi_server').catch(() => {});
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
    next.token ? SecureStore.setItemAsync(KEYS.token, next.token) : SecureStore.deleteItemAsync(KEYS.token),
    next.user ? SecureStore.setItemAsync(KEYS.user, JSON.stringify(next.user)) : SecureStore.deleteItemAsync(KEYS.user),
  ]);
}

export async function api(path, { method = 'GET', body, anonymous = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(session.token && !anonymous ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 && path !== '/auth/login') {
    await saveSession({ token: '', user: null });
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

export async function login(email, password) {
  const data = await api('/auth/login', { method: 'POST', body: { email, password }, anonymous: true });
  await saveSession({ token: data.token, user: data.user });
  return data.user;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* token já inválido */ }
  await saveSession({ token: '', user: null });
}

export async function changePassword(current, next) {
  const data = await api('/auth/password', { method: 'POST', body: { current_password: current, new_password: next } });
  await saveSession({ token: data.token, user: data.user });
}
