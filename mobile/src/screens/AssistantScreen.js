import { useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api';
import { currency, number, quantity } from '../format';
import { openRoute } from '../routes';
import { colors } from '../theme';
import { Button, Card, Empty, Input, ListRow, Loading, Meter, Notice, Screen, Text, useLoader } from '../ui';
import InsightList from './InsightList';

const QUESTIONS = {
  admin: ['O que devo produzir esta semana?', 'Qual produto tem a pior margem?', 'Quanto vou gastar de insumos em 15 dias?'],
  seller: ['O que tenho pronto para vender?', 'Quanto tenho para receber?'],
  producer: ['O que tenho para produzir?', 'Falta insumo para os meus lotes?'],
};

function Chat({ role }) {
  const [log, setLog] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef(log);
  logRef.current = log;

  async function ask(text) {
    const value = (text ?? question).trim();
    if (!value || busy) return;
    setQuestion(''); setError(''); setBusy(true);
    const history = logRef.current.map(({ role: r, content }) => ({ role: r, content }));
    setLog(current => [...current, { role: 'user', content: value }]);
    try {
      const { answer } = await api('/assistant/ask', { method: 'POST', body: { question: value, history } });
      setLog(current => [...current, { role: 'assistant', content: answer }]);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return <View style={{ gap: 10 }}>
    {log.map((row, index) => <View key={index} style={{ alignSelf: row.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: 10, borderRadius: 12, backgroundColor: row.role === 'user' ? colors.primary : colors.raised }}>
      <Text size={14} color={row.role === 'user' ? '#fff' : colors.text}>{row.content}</Text>
    </View>)}
    {busy && <Text size={14} color={colors.muted}>Pensando nos seus números…</Text>}
    {!log.length && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {(QUESTIONS[role] || QUESTIONS.admin).map(text => <Pressable key={text} onPress={() => ask(text)} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
        <Text size={13} color={colors.muted}>{text}</Text>
      </Pressable>)}
    </View>}
    <Notice tone="error">{error}</Notice>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Input style={{ flex: 1 }} value={question} onChangeText={setQuestion} placeholder="Pergunte sobre estoque, preço…" onSubmitEditing={() => ask()} returnKeyType="send" maxLength={1000} />
      <Pressable onPress={() => ask()} disabled={busy || !question.trim()} accessibilityLabel="Enviar pergunta"
        style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !question.trim() ? 0.5 : 1 }}>
        <Ionicons name="send" size={18} color="#fff" />
      </Pressable>
    </View>
  </View>;
}

export default function AssistantScreen({ navigation, user }) {
  const { data, error, refreshing, refresh } = useLoader(() => api('/assistant/insights'), []);
  const shopping = data?.shopping_list || [];
  const total = shopping.reduce((sum, row) => sum + row.estimated_cost, 0);
  const capacity = data?.producible || [];
  const maxCapacity = Math.max(1, ...capacity.map(row => row.max_producible || 0));
  const urgent = (data?.insights || []).filter(item => item.severity === 'critical').length;

  const share = () => Share.share({
    message: `Lista de compras · Doces Mivi\n${shopping.map(row => `• ${row.name}: ${row.packs} × ${quantity(row.pack_size, row.unit)} ≈ ${currency(row.estimated_cost)}${row.supplier ? ` (${row.supplier})` : ''}`).join('\n')}\n\nTotal estimado: ${currency(total)}`,
  });

  return <Screen title="Assistente" subtitle={data ? (urgent ? `${urgent} assunto${urgent > 1 ? 's' : ''} urgente${urgent > 1 ? 's' : ''}` : 'Nada urgente agora') : 'Lendo os números…'} refreshing={refreshing} onRefresh={refresh}
    action={navigation.canGoBack() ? <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Voltar"><Ionicons name="close" size={26} color={colors.muted} /></Pressable> : null}>
    <Notice tone="error">{error}</Notice>
    {!data ? <Loading /> : <>
      <Card title="O que fazer agora" padded={false}><InsightList items={data.insights} onAction={route => openRoute(navigation, route, user.role)} /></Card>
      <Card title="Pergunte">{data.ai_enabled ? <Chat role={user.role} /> : <Text size={14} color={colors.muted}>O chat com IA está desligado no servidor (falta ANTHROPIC_API_KEY). Os alertas acima funcionam sem ele.</Text>}</Card>
      {user.role === 'admin' && <Card title="Lista de compras" subtitle={shopping.length ? `${shopping.length} itens · ${currency(total)}` : 'Para duas semanas e os lotes agendados'} padded={false}
        right={shopping.length ? <Button small title="Enviar" icon="share-social-outline" onPress={share} /> : null}>
        {shopping.length ? shopping.map(row => <ListRow key={row.ingredient_id} title={row.name} subtitle={`${row.packs} × ${quantity(row.pack_size, row.unit)}${row.supplier ? ` · ${row.supplier}` : ''}`}
          right={currency(row.estimated_cost)} onPress={() => openRoute(navigation, `/insumos?item=${row.ingredient_id}`, user.role)} />) : <Empty title="Nada para comprar agora" />}
      </Card>}
      {user.role === 'admin' && <Card title="Dá para produzir agora" subtitle="Pelo estoque de insumos de hoje">
        {capacity.length ? capacity.map(row => <View key={row.id} style={{ paddingVertical: 8, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ flex: 1 }} numberOfLines={1}>{row.name}</Text><Text weight="medium">{number(row.max_producible, 0)} un.</Text></View>
          <Meter value={row.max_producible} max={maxCapacity} tone={row.max_producible === 0 ? 'low' : 'accent'} />
          <Text size={12} color={colors.muted}>{row.max_producible === 0 ? `Sem ${row.bottleneck}` : `${row.bottleneck} limita`} · {row.finished_stock > 0 ? `${row.finished_stock} prontos` : 'nenhum pronto'}</Text>
        </View>) : <Text color={colors.muted}>Nenhuma receita cadastrada.</Text>}
      </Card>}
    </>}
  </Screen>;
}
