export const currency = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const number = (value, digits = 1) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });
export const percent = value => `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const dateBR = value => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
export const dateShort = value => value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '—';
export const dateTime = value => value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
export const inputDate = value => {
  const date = value ? new Date(value) : new Date();
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
};
export const toIsoNoon = day => new Date(`${day}T12:00:00`).toISOString();

/* Custo unitário pequeno (R$ 0,0164 por g) precisa de mais casas. */
export const unitCost = value => {
  const amount = Number(value || 0);
  const digits = amount > 0 && amount < 1 ? 4 : 2;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });
};

/* Mostra 2500 g como "2,5 kg" e 1500 ml como "1,5 l" quando fica mais legível. */
export const quantity = (value, unit) => {
  const amount = Number(value || 0);
  if (unit === 'g' && Math.abs(amount) >= 1000) return `${number(amount / 1000, 2)} kg`;
  if (unit === 'ml' && Math.abs(amount) >= 1000) return `${number(amount / 1000, 2)} l`;
  return `${number(amount, amount % 1 ? 2 : 0)} ${unit}`;
};

export const relativeDays = value => {
  if (!value) return 'nunca';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
};

/* Unidades de compra que convertem para a unidade de uso. */
export const purchaseUnits = {
  g: [['g', 1], ['kg', 1000]],
  kg: [['kg', 1]],
  ml: [['ml', 1], ['l', 1000]],
  l: [['l', 1]],
  un: [['un', 1], ['dúzia', 12], ['cento', 100]],
  pacote: [['pacote', 1]],
};
