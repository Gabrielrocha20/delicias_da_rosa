import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, changePassword } from '../api';
import { SERVER_HOST } from '../config';
import { currency, dateShort, dayIso, number, parseDecimal, percent } from '../format';
import { colors } from '../theme';
import { Button, Card, Empty, Field, Input, Kpis, ListRow, Loading, Notice, Screen, Segmented, Sheet, Text, useLoader, useToast } from '../ui';

const ROLE = { admin: 'Administrador', seller: 'Vendedor', producer: 'Produtor' };

function MenuRow({ icon, title, subtitle, onPress, danger }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 60, borderTopWidth: 1, borderTopColor: colors.rule }, pressed && { backgroundColor: colors.raised }]}>
    <Ionicons name={icon} size={20} color={danger ? colors.negative : colors.muted} />
    <View style={{ flex: 1 }}>
      <Text weight="medium" color={danger ? colors.negative : colors.text}>{title}</Text>
      {!!subtitle && <Text size={13} color={colors.muted}>{subtitle}</Text>}
    </View>
    {!danger && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
  </Pressable>;
}

export function MoreScreen({ navigation, user, onLogout }) {
  return <Screen title="Mais" subtitle={`${user.name} · ${ROLE[user.role]}`}>
    <Card padded={false}>
      {user.role === 'admin' && <MenuRow icon="sparkles-outline" title="Assistente" subtitle="Alertas, lista de compras e perguntas" onPress={() => navigation.navigate('Assistente')} />}
      {user.role === 'admin' && <MenuRow icon="wallet-outline" title="Entradas e saídas" subtitle="Saldo e lançamentos do caixa" onPress={() => navigation.navigate('Caixa')} />}
      <MenuRow icon="scale-outline" title="Página da Verdade" subtitle="Para onde vai cada real vendido" onPress={() => navigation.navigate('Verdade')} />
      <MenuRow icon="key-outline" title="Trocar senha" onPress={() => navigation.navigate('Conta')} />
    </Card>
    <Card padded={false}>
      <MenuRow icon="log-out-outline" title="Sair da conta" danger onPress={() => Alert.alert('Sair da conta?', '', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: onLogout }])} />
    </Card>
    <Text size={12} color={colors.muted}>Conectado a {SERVER_HOST}. Cadastros de produtos, receitas, equipe e acessos ficam no painel web.</Text>
  </Screen>;
}

function BackButton({ navigation }) {
  return <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Voltar"><Ionicons name="close" size={26} color={colors.muted} /></Pressable>;
}

export function CashScreen({ navigation }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, error: loadError, refreshing, refresh, reload } = useLoader(() => api('/cash-movements'), []);
  async function save() {
    const amount = parseDecimal(form.amount);
    if (!(amount > 0)) { setError('Informe um valor maior que zero.'); return; }
    setSaving(true); setError('');
    try {
      await api('/cash-movements', { method: 'POST', body: { type: form.type, category: form.category || 'Outros', description: form.description, amount, occurred_at: dayIso(0) } });
      toast('Lançamento salvo'); setForm(null); reload();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <Screen title="Entradas e saídas" subtitle={data ? `Saldo ${currency(data.balance)}` : 'Carregando…'} refreshing={refreshing} onRefresh={refresh} action={<BackButton navigation={navigation} />}>
    <Notice tone="error">{loadError}</Notice>
    {!data ? <Loading /> : <>
      <Kpis items={[
        { label: 'Saldo', value: currency(data.balance), color: data.balance < 0 ? colors.negative : undefined },
        { label: 'Vendas pagas', value: currency(data.sales_income) },
        { label: 'Outras entradas', value: currency(data.manual_income) },
        { label: 'Saídas', value: currency(data.expenses) },
      ]} />
      <Button title="Novo lançamento" icon="add" variant="primary" onPress={() => { setError(''); setForm({ type: 'expense', category: '', description: '', amount: '' }); }} />
      <Card title="Lançamentos" padded={false}>
        {data.movements.length ? data.movements.slice(0, 60).map(row => <ListRow key={row.id} title={row.description || row.category} subtitle={`${row.category} · ${dateShort(row.occurred_at)}`}
          right={<Text weight="medium" color={row.type === 'income' ? colors.positive : colors.text}>{row.type === 'income' ? '+' : '−'}{currency(row.amount)}</Text>} />) : <Empty title="Nenhum lançamento" />}
      </Card>
    </>}
    {form && <Sheet visible title="Novo lançamento" onClose={() => setForm(null)}
      footer={<><Button title="Cancelar" onPress={() => setForm(null)} style={{ flex: 1 }} /><Button title="Salvar" variant="primary" onPress={save} loading={saving} style={{ flex: 2 }} /></>}>
      <Notice tone="error">{error}</Notice>
      <Segmented options={[['expense', 'Saída'], ['income', 'Entrada']]} value={form.type} onChange={type => setForm({ ...form, type })} />
      <Field label="Valor"><Input prefix="R$" value={form.amount} onChangeText={amount => setForm({ ...form, amount })} keyboardType="decimal-pad" autoFocus /></Field>
      <Field label="Categoria" hint="Ex.: Aluguel, Energia e gás, Embalagens"><Input value={form.category} onChangeText={category => setForm({ ...form, category })} /></Field>
      <Field label="Descrição"><Input value={form.description} onChangeText={description => setForm({ ...form, description })} placeholder="Opcional" /></Field>
    </Sheet>}
  </Screen>;
}

export function TruthScreen({ navigation }) {
  const [range, setRange] = useState('30d');
  const { data, error, refreshing, refresh } = useLoader(() => api(`/transparency?range=${range}`), [range]);
  const t = data?.totals || {};
  const lines = [['Ingredientes e embalagens', t.product_cost], ['Vendedores', t.sellers], ['Produtores', t.producers], ['Reserva de caixa', t.cash_reserve], ['Parceiros', t.partners], ['Taxas de venda', t.sales_fees]];
  return <Screen title="Página da Verdade" subtitle={data ? `De ${currency(t.revenue)} vendidos, ${currency(t.owner)} ficaram com o proprietário` : 'Carregando…'} refreshing={refreshing} onRefresh={refresh} action={<BackButton navigation={navigation} />}>
    <Segmented options={[['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias'], ['12m', '12 meses']]} value={range} onChange={setRange} />
    <Notice tone="error">{error}</Notice>
    {!data ? <Loading /> : <>
      <Card title="Fechamento do período">
        <Row label="Faturamento bruto" value={currency(t.revenue)} strong />
        {lines.map(([label, value]) => <Row key={label} label={`− ${label}`} value={currency(value)} note={t.revenue ? percent((value / t.revenue) * 100) : null} />)}
        <View style={{ marginTop: 8, padding: 12, borderRadius: 8, backgroundColor: t.owner < 0 ? colors.pill.negative[0] : colors.pill.positive[0] }}>
          <Row label="= Resultado do proprietário" value={currency(t.owner)} strong color={t.owner < 0 ? colors.pill.negative[1] : colors.pill.positive[1]} />
        </View>
      </Card>
      <Card title="Quanto cada pessoa ganhou" padded={false}>
        {data.people.length ? data.people.map(person => <ListRow key={`${person.type}-${person.id}`} title={person.name} subtitle={`${person.type === 'seller' ? 'Vendedor' : 'Produtor'} · ${number(person.units, 0)} un.`} right={currency(person.earnings)} />) : <Empty title="Nenhuma comissão no período" />}
      </Card>
    </>}
  </Screen>;
}

function Row({ label, value, note, strong, color = colors.text }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: strong ? 0 : 1, borderBottomColor: colors.rule }}>
    <Text size={14} color={strong ? color : colors.muted} weight={strong ? 'medium' : 'regular'} style={{ flex: 1 }}>{label}</Text>
    {note && <Text size={13} color={colors.muted}>{note}</Text>}
    <Text size={14} weight={strong ? 'semibold' : 'regular'} color={color} style={{ minWidth: 92, textAlign: 'right' }}>{value}</Text>
  </View>;
}

export function AccountScreen({ navigation }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setError('');
    try { await changePassword(current, next); toast('Senha alterada'); navigation.goBack(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <Screen title="Trocar senha" subtitle="Os outros aparelhos conectados saem da conta" action={<BackButton navigation={navigation} />}>
    <Notice tone="error">{error}</Notice>
    <Field label="Senha atual"><Input value={current} onChangeText={setCurrent} secureTextEntry autoComplete="password" /></Field>
    <Field label="Nova senha" hint="Pelo menos 8 caracteres, sem ser só números."><Input value={next} onChangeText={setNext} secureTextEntry autoComplete="password-new" /></Field>
    <Button title="Salvar nova senha" variant="primary" onPress={save} loading={saving} disabled={!current || next.length < 8} />
  </Screen>;
}
