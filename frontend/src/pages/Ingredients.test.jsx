import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import Ingredients from './Ingredients';
import { api } from '../lib/api';


vi.mock('../lib/api', () => ({ api: vi.fn() }));

const leite = {
  id: 7, name: 'Leite condensado', category: 'Laticínios', purchase_price: 6.49, purchase_quantity: 395, unit: 'g',
  stock: 200, min_stock: 790, supplier: 'Atacadão', brand: '', notes: '', last_purchase_at: null, unit_cost: 6.49 / 395,
  daily_usage: 0, coverage_days: null, planned_need: 0, products_using: 1, stock_value: 3.29, status: 'low',
  suggestion: { packs: 4, quantity: 1580, estimated_cost: 25.96 }, created_at: '2026-01-01T00:00:00Z',
};

function renderPage() {
  return render(<MemoryRouter><Ingredients /></MemoryRouter>);
}

beforeEach(() => {
  api.mockReset();
});


it('converte a compra em kg para gramas ao cadastrar', async () => {
  api.mockImplementation((path, options) => {
    if (options) return Promise.resolve({ id: 1 });
    return Promise.resolve(path === '/ingredients/categories' ? [] : []);
  });
  const user = userEvent.setup();
  renderPage();
  await screen.findByText('Nenhum insumo cadastrado');

  await user.click(screen.getAllByRole('button', { name: /novo insumo/i })[0]);
  await user.type(screen.getByLabelText('Nome'), 'Chocolate 50%');
  await user.type(screen.getByLabelText('Quantidade da compra'), '2');
  await user.selectOptions(screen.getByLabelText('Unidade da compra'), 'kg');
  await user.type(screen.getByLabelText('Preço pago'), '37.80');
  expect(screen.getByText('R$ 0,0189')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /salvar insumo/i }));

  await waitFor(() => expect(api).toHaveBeenCalledWith('/ingredients', expect.objectContaining({
    method: 'POST',
    body: expect.objectContaining({ name: 'Chocolate 50%', unit: 'g', purchase_quantity: 2000, purchase_price: 37.8, stock: 0 }),
  })));
});


it('registra uma entrada de compra com várias embalagens e lança no caixa', async () => {
  api.mockImplementation((path, options) => {
    if (options) return Promise.resolve({ ...leite, stock: 200 + 790 });
    if (path === '/ingredients/categories') return Promise.resolve(['Laticínios']);
    return Promise.resolve([leite]);
  });
  const user = userEvent.setup();
  renderPage();
  expect(await screen.findByText('Leite condensado')).toBeInTheDocument();
  expect(screen.getAllByText('Repor').length).toBeGreaterThan(1);

  await user.click(screen.getByRole('button', { name: /^entrada$/i }));
  const packs = screen.getByLabelText('Quantas embalagens');
  await user.clear(packs);
  await user.type(packs, '2');
  expect(screen.getByText('+790 g')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /registrar entrada/i }));

  await waitFor(() => expect(api).toHaveBeenCalledWith('/ingredients/7/purchase', expect.objectContaining({
    method: 'POST',
    body: expect.objectContaining({ quantity: 790, total_price: 12.98, register_expense: true, update_cost: true }),
  })));
});
