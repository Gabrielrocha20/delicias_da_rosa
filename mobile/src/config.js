// Endereço do servidor da Doces Mivi. É o mesmo do painel web; a API fica em /api.
// Para apontar o app para outro servidor (ex.: testes no seu computador), defina antes de abrir/compilar:
//   EXPO_PUBLIC_API_URL=http://192.168.0.10:3333
const DEFAULT_SERVER = 'https://yroshiii.pythonanywhere.com';

function normalize(input) {
  let value = String(input || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  if (!/\/api$/i.test(value)) value = `${value}/api`;
  return value;
}

export const API_URL = normalize(process.env.EXPO_PUBLIC_API_URL || DEFAULT_SERVER);
export const SERVER_HOST = API_URL.replace(/^https?:\/\//i, '').replace(/\/api$/i, '');
