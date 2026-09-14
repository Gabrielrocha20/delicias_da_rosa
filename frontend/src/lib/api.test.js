import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, clearSession, getStoredUser, getToken, setSession } from './api';


function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  };
}


describe('sessao local', () => {
  it('salva, le e remove token e usuario', () => {
    setSession({ token: 'token-seguro', user: { id: 7, role: 'seller' } });
    expect(getToken()).toBe('token-seguro');
    expect(getStoredUser()).toEqual({ id: 7, role: 'seller' });

    clearSession();
    expect(getToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it('nao quebra quando os dados locais foram adulterados', () => {
    localStorage.setItem('rosas_user', '{json-invalido');
    expect(getStoredUser()).toBeNull();
  });
});


describe('cliente HTTP', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('envia JSON e o token Bearer nas chamadas autenticadas', async () => {
    setSession({ token: 'abc123', user: { role: 'admin' } });
    fetch.mockResolvedValue(jsonResponse({ id: 10 }, 201));

    await expect(api('/ingredients', {
      method: 'POST', body: { name: 'Chocolate', purchase_quantity: 200 },
    })).resolves.toEqual({ id: 10 });

    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/ingredients$/), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Chocolate', purchase_quantity: 200 }),
      headers: expect.objectContaining({
        Authorization: 'Bearer abc123',
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('propaga a mensagem segura devolvida pela API', async () => {
    fetch.mockResolvedValue(jsonResponse({ message: 'Dados invalidos.' }, 400));
    await expect(api('/ingredients')).rejects.toThrow('Dados invalidos.');
  });
});
