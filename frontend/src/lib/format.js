export const currency = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const number = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export const percent = value => `${number(value)}%`;
export const dateBR = value => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
export const inputDate = value => {
  const date = value ? new Date(value) : new Date();
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
};
