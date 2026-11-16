const API_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'mivi_token';
const USER_KEY = 'mivi_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export async function api(path, options = {}) {
  const token = getToken();
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  if (response.status === 401 && path !== '/auth/login') {
    clearSession();
    window.location.href = '/login';
    throw new Error('Sua sessão expirou.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Algo deu errado. Tente novamente.');
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão já inválida */ }
  clearSession();
}
