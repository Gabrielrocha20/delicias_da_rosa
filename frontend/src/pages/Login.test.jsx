import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import Login from './Login';
import { api, setSession } from '../lib/api';


vi.mock('../lib/api', () => ({
  api: vi.fn(),
  setSession: vi.fn(),
}));


beforeEach(() => {
  api.mockReset();
  setSession.mockReset();
});


it('mostra erro de autenticacao sem criar uma sessao', async () => {
  const user = userEvent.setup();
  api.mockRejectedValue(new Error('E-mail ou senha incorretos.'));
  render(<MemoryRouter><Login /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /entrar no painel/i }));

  expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  expect(setSession).not.toHaveBeenCalled();
});


it('salva somente a sessao devolvida pelo backend', async () => {
  const user = userEvent.setup();
  const session = { token: 'token', user: { role: 'admin' } };
  api.mockResolvedValue(session);
  render(<MemoryRouter><Login /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /entrar no painel/i }));

  expect(api).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ method: 'POST' }));
  expect(setSession).toHaveBeenCalledWith(session);
});
