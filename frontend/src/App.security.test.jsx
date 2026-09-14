import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { setSession } from './lib/api';


vi.mock('./pages/Login', () => ({ default: () => <div>pagina-login</div> }));
vi.mock('./pages/Dashboard', () => ({ default: () => <div>pagina-dashboard</div> }));
vi.mock('./pages/Ingredients', () => ({ default: () => <div>pagina-insumos</div> }));
vi.mock('./pages/Products', () => ({ default: () => <div>pagina-produtos</div> }));
vi.mock('./pages/People', () => ({ default: () => <div>pagina-equipe</div> }));
vi.mock('./pages/Production', () => ({ default: () => <div>pagina-producao</div> }));
vi.mock('./pages/Sales', () => ({ default: () => <div>pagina-vendas</div> }));
vi.mock('./pages/Accesses', () => ({ default: () => <div>pagina-acessos</div> }));
vi.mock('./pages/Establishments', () => ({ default: () => <div>pagina-parceiros</div> }));
vi.mock('./pages/Transparency', () => ({ default: () => <div>pagina-verdade</div> }));


function renderAs(role, path) {
  setSession({ token: 'token-valido', user: { name: 'Pessoa Teste', role } });
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}


describe('protecoes de rota por cargo', () => {
  beforeEach(() => localStorage.clear());

  it('redireciona quem nao esta autenticado para o login', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByText('pagina-login')).toBeInTheDocument();
  });

  it('vendedor nao ve nem abre telas administrativas', async () => {
    renderAs('seller', '/acessos');
    expect(await screen.findByText('pagina-dashboard')).toBeInTheDocument();
    expect(document.querySelector('a[href="/acessos"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/vendas"]')).toBeInTheDocument();
  });

  it('produtor abre producao mas nao ve vendas', async () => {
    renderAs('producer', '/producao');
    expect(await screen.findByText('pagina-producao')).toBeInTheDocument();
    expect(document.querySelector('a[href="/vendas"]')).not.toBeInTheDocument();
  });

  it('administrador acessa os cadastros restritos', async () => {
    renderAs('admin', '/acessos');
    await waitFor(() => expect(screen.getByText('pagina-acessos')).toBeInTheDocument());
    expect(document.querySelector('a[href="/acessos"]')).toBeInTheDocument();
  });
});
