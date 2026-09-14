const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export function getToken() {
  return localStorage.getItem('rosas_token');
}

export function setSession(data) {
  localStorage.setItem('rosas_token', data.token);
  localStorage.setItem('rosas_user', JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem('rosas_token');
  localStorage.removeItem('rosas_user');
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('rosas_user')); } catch { return null; }
}

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers,
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
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
