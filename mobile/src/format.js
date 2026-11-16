// Formatação feita à mão para não depender do suporte a Intl de cada aparelho.
function group(integer) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function number(value, digits = 1) {
  const amount = Number(value || 0);
  const fixed = Math.abs(amount).toFixed(digits);
  let [integer, decimals] = fixed.split('.');
  if (decimals) decimals = decimals.replace(/0+$/, '');
  return `${amount < 0 ? '-' : ''}${group(integer)}${decimals ? `,${decimals}` : ''}`;
}

export function currency(value, digits = 2) {
  const amount = Number(value || 0);
  const [integer, decimals] = Math.abs(amount).toFixed(digits).split('.');
  return `${amount < 0 ? '-' : ''}R$ ${group(integer)},${decimals}`;
}

export const unitCost = value => currency(value, Number(value) > 0 && Number(value) < 1 ? 4 : 2);
export const percent = value => `${number(value, 1)}%`;

export function quantity(value, unit) {
  const amount = Number(value || 0);
  if (unit === 'g' && Math.abs(amount) >= 1000) return `${number(amount / 1000, 2)} kg`;
  if (unit === 'ml' && Math.abs(amount) >= 1000) return `${number(amount / 1000, 2)} l`;
  return `${number(amount, 2)} ${unit}`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function dateShort(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
export function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* Datas do formulário: "hoje", "ontem", "amanhã" → ISO ao meio-dia local. */
export function dayIso(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

export const purchaseUnits = {
  g: [['g', 1], ['kg', 1000]],
  kg: [['kg', 1]],
  ml: [['ml', 1], ['l', 1000]],
  l: [['l', 1]],
  un: [['un', 1], ['dúzia', 12], ['cento', 100]],
  pacote: [['pacote', 1]],
};

export function parseDecimal(text) {
  const clean = String(text ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = Number(clean);
  return Number.isFinite(value) ? value : NaN;
}
