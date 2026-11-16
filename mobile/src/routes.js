import { Alert } from 'react-native';

/* Traduz as rotas do painel web (usadas nas ações do assistente) para telas do app. */
export function openRoute(navigation, route, role) {
  if (!route) return;
  const [path, query = ''] = route.split('?');
  const params = Object.fromEntries(query.split('&').filter(Boolean).map(pair => pair.split('=').map(decodeURIComponent)));
  const tab = (screen, extra) => navigation.navigate('Tabs', { screen, params: { ...extra, at: Date.now() } });
  if (path.startsWith('/insumos') && role === 'admin') return tab('Insumos', { item: Number(params.item) || undefined, noMinimum: !!params.sem_minimo });
  if (path.startsWith('/producao')) return tab('Produção', params.novo ? { newProduct: Number(params.novo), newQuantity: Number(params.qtd) || 20 } : {});
  if (path.startsWith('/vendas')) return tab('Vendas', { status: params.status, openNew: !!params.novo });
  if (path.startsWith('/caixa')) return navigation.navigate('Caixa');
  if (path.startsWith('/assistente')) return navigation.navigate(role === 'admin' ? 'Assistente' : 'Tabs', role === 'admin' ? undefined : { screen: 'Assistente' });
  if (path.startsWith('/produtos')) return Alert.alert('Abra no painel web', 'Fichas técnicas e preços são editados no painel, em Produtos e receitas.');
  return null;
}
