import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import Ingredients from './Ingredients';
import { api } from '../lib/api';


vi.mock('../lib/api', () => ({ api: vi.fn() }));


beforeEach(() => {
  api.mockReset();
  api.mockImplementation((_path, options) => Promise.resolve(options ? { id: 1 } : []));
});


it('aceita 200 g como quantidade valida e envia o cadastro', async () => {
  const user = userEvent.setup();
  render(<Ingredients />);
  await screen.findByText('Nenhum insumo encontrado');

  await user.click(screen.getByRole('button', { name: /novo insumo/i }));
  await user.type(screen.getByLabelText('Nome'), 'Chocolate');
  await user.type(screen.getByLabelText('Preço pago (R$)'), '18.90');
  const quantity = screen.getByLabelText('Quantidade comprada (g)');
  await user.type(quantity, '200');

  expect(quantity).toBeValid();
  await user.click(screen.getByRole('button', { name: /salvar insumo/i }));

  await waitFor(() => expect(api).toHaveBeenCalledWith('/ingredients', expect.objectContaining({
    method: 'POST',
    body: expect.objectContaining({ purchase_quantity: '200', stock: '0', min_stock: '0' }),
  })));
});
