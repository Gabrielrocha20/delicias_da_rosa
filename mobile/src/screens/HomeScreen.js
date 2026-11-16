import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { currency, dateShort, number, percent } from '../format';
import { openRoute } from '../routes';
import { colors } from '../theme';
import { Card, Empty, Kpis, ListRow, Loading, Meter, Notice, Pill, Screen, Segmented, Text, useLoader } from '../ui';
import InsightList from './InsightList';

const RANGES = [['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias']];

export default function HomeScreen({ navigation, user }) {
  const [range, setRange] = useState('30d');
  const { data, error, refreshing, refresh, reload } = useLoader(async () => {
    const [dashboard, assistant] = await Promise.all([api(`/dashboard?range=${range}`), api('/assistant/insights').catch(() => ({ insights: [] }))]);
    return { dashboard, assistant };
  }, [range]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const d = data?.dashboard;
  const m = d?.metrics || {};
  const personal = d?.personal;
  const insights = data?.assistant?.insights || [];
  const urgent = insights.filter(item => item.severity === 'critical').length;
  const products = d?.byProduct || [];
  const maxProfit = Math.max(1, ...products.map(row => Math.abs(row.profit)));
  const label = RANGES.find(([key]) => key === range)[1];

  return <Screen title={`Olá, ${user.name.split(' ')[0]}`} subtitle={d ? `${currency(m.revenue)} em ${number(m.unitsSold, 0)} un. nos últimos ${label}${urgent ? ` · ${urgent} urgente${urgent > 1 ? 's' : ''}` : ''}` : 'Carregando…'}
    refreshing={refreshing} onRefresh={refresh}>
    <Segmented options={RANGES} value={range} onChange={setRange} />
    <Notice tone="error">{error}</Notice>
    {!d ? <Loading /> : <>
      <Kpis items={[
        { label: personal ? 'Faturamento que gerei' : 'Faturamento', value: currency(m.revenue), note: `ticket ${currency(m.averageTicket)}` },
        { label: personal ? 'Minha comissão' : 'Resultado', value: currency(m.profit), note: m.revenue ? `${percent(m.margin)} do faturado` : 'sem vendas', color: m.profit < 0 ? colors.negative : undefined },
        ...(d.role !== 'seller' ? [{ label: d.role === 'producer' ? 'Minha produção' : 'Produzido', value: `${number(m.unitsProduced, 0)} un.`, note: label }] : []),
        { label: 'Ritmo de venda', value: `${number(d.forecast.dailyVelocity)} /dia`, note: personal ? `${currency(d.forecast.projectedEarnings30Days)} em 30 dias` : `${number(d.forecast.availableStock, 0)} un. prontas` },
      ]} />

      <Card title="Assistente" subtitle="O que pede atenção hoje" padded={false}
        right={<Pressable onPress={() => openRoute(navigation, '/assistente', user.role)} hitSlop={8}><Text size={14} weight="medium" color={colors.accentInk}>Ver tudo</Text></Pressable>}>
        <InsightList items={insights} limit={4} onAction={route => openRoute(navigation, route, user.role)} />
      </Card>

      <Card title={personal ? 'Comissão por produto' : 'Resultado por produto'} subtitle={label}>
        {products.length ? products.slice(0, 5).map((row, index) => <View key={row.name} style={{ paddingVertical: 8, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1 }} numberOfLines={1}>{row.name}</Text>
            <Text weight="medium" color={row.profit < 0 ? colors.negative : colors.text}>{currency(row.profit)}</Text>
          </View>
          <Meter value={Math.abs(row.profit)} max={maxProfit} tone={row.profit < 0 ? 'low' : index === 0 ? 'accent' : undefined} />
          <Text size={12} color={colors.muted}>{number(row.units, 0)} un. · {currency(row.revenue)}</Text>
        </View>) : <Text color={colors.muted}>Nenhuma venda no período.</Text>}
      </Card>

      {d.role !== 'seller' && <Card title="Próximas produções" padded={false}>
        {d.planned.length ? d.planned.map(item => <ListRow key={item.id} title={item.product_name} subtitle={`${item.producer_name || 'Sem responsável'} · ${dateShort(item.produced_at)}`}
          right={`${item.quantity} un.`} onPress={() => navigation.navigate('Tabs', { screen: 'Produção' })}>
          <Pill tone={item.status === 'planned' ? 'neutral' : 'warning'}>{item.status === 'planned' ? 'Planejado' : 'Em produção'}</Pill>
        </ListRow>) : <Empty title="Nenhum lote agendado" />}
      </Card>}
    </>}
  </Screen>;
}
