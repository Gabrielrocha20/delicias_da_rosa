import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { currency, dateTime, number, parseDecimal, purchaseUnits, quantity, unitCost } from '../format';
import { colors } from '../theme';
import { Button, Card, Chips, Empty, Field, Input, Kpis, ListRow, Loading, Meter, Notice, Pill, Screen, Segmented, Sheet, Text, useLoader, useToast } from '../ui';

const STATUS = { out: ['Em falta', 'negative'], low: ['Repor', 'warning'], ok: ['Em dia', 'positive'] };

function bestUnit(unit, amount) {
  const options = purchaseUnits[unit] || [[unit, 1]];
  return [...options].reverse().find(([, f]) => amount >= f && amount % f === 0) || options[0];
}

function PurchaseSheet({ item, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!item) return;
    const [unit, factor] = bestUnit(item.unit, item.purchase_quantity);
    setError('');
    setForm({ size: number(item.purchase_quantity / factor, 3), unit, packs: '1', price: number(item.purchase_price, 2), supplier: item.supplier || '', update_cost: true, register_expense: true });
  }, [item]);
  if (!item || !form) return null;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const factor = (purchaseUnits[item.unit] || []).find(([name]) => name === form.unit)?.[1] || 1;
  const amount = (parseDecimal(form.size) || 0) * factor * (Number(form.packs) || 0);
  const total = (parseDecimal(form.price) || 0) * (Number(form.packs) || 0);
  const newCost = amount ? total / amount : 0;
  const change = item.unit_cost ? (newCost / item.unit_cost - 1) * 100 : 0;

  async function save() {
    if (!(amount > 0)) { setError('Informe o tamanho da embalagem e quantas comprou.'); return; }
    setSaving(true); setError('');
    try {
      const saved = await api(`/ingredients/${item.id}/purchase`, { method: 'POST', body: { quantity: amount, total_price: total, supplier: form.supplier, update_cost: form.update_cost, register_expense: form.register_expense } });
      toast(`+${quantity(amount, item.unit)} de ${item.name}`);
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return <Sheet visible title={`Entrada de ${item.name}`} subtitle={`Estoque atual: ${quantity(item.stock, item.unit)}`} onClose={onClose}
    footer={<><Button title="Cancelar" onPress={onClose} style={{ flex: 1 }} /><Button title="Registrar entrada" variant="primary" onPress={save} loading={saving} style={{ flex: 2 }} /></>}>
    <Notice tone="error">{error}</Notice>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}><Field label="Embalagem"><Input value={form.size} onChangeText={value => set('size', value)} keyboardType="decimal-pad" /></Field></View>
      <View style={{ flex: 1 }}><Field label="Unidade"><Segmented options={(purchaseUnits[item.unit] || [[item.unit]]).map(([name]) => [name, name])} value={form.unit} onChange={value => set('unit', value)} /></Field></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}><Field label="Quantas"><Input value={form.packs} onChangeText={value => set('packs', value.replace(/\D/g, ''))} keyboardType="number-pad" /></Field></View>
      <View style={{ flex: 1 }}><Field label="Preço de cada"><Input prefix="R$" value={form.price} onChangeText={value => set('price', value)} keyboardType="decimal-pad" /></Field></View>
    </View>
    <Field label="Fornecedor"><Input value={form.supplier} onChangeText={value => set('supplier', value)} placeholder="Onde comprou" /></Field>
    <View style={{ backgroundColor: colors.raised, borderRadius: 8, padding: 12, gap: 6 }}>
      <Line label="Entra no estoque" value={`+${quantity(amount, item.unit)}`} />
      <Line label="Estoque depois" value={quantity(item.stock + amount, item.unit)} />
      <Line label={`Custo por ${item.unit}`} value={`${unitCost(newCost)}${item.unit_cost && Math.abs(change) >= 0.5 ? ` (${change > 0 ? '+' : ''}${number(change)}%)` : ''}`} color={change > 0.5 ? colors.negative : change < -0.5 ? colors.positive : undefined} />
      <Line label="Total" value={currency(total)} strong />
    </View>
    <Toggle label="Atualizar custo das receitas" value={form.update_cost} onChange={value => set('update_cost', value)} />
    <Toggle label={`Lançar saída de ${currency(total)} no caixa`} value={form.register_expense} onChange={value => set('register_expense', value)} />
  </Sheet>;
}

function AdjustSheet({ item, onClose, onSaved }) {
  const toast = useToast();
  const [mode, setMode] = useState('adjustment');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (item) { setMode('adjustment'); setValue(number(item.stock, 3)); setNote(''); setError(''); } }, [item]);
  if (!item) return null;
  const typed = parseDecimal(value) || 0;
  const after = mode === 'adjustment' ? typed : item.stock - typed;
  async function save() {
    setSaving(true); setError('');
    try {
      const body = mode === 'adjustment' ? { type: mode, counted_stock: typed, note } : { type: mode, quantity: typed, note };
      const saved = await api(`/ingredients/${item.id}/adjust`, { method: 'POST', body });
      toast(mode === 'adjustment' ? 'Contagem registrada' : 'Perda registrada');
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <Sheet visible title={`Corrigir ${item.name}`} subtitle={`No sistema: ${quantity(item.stock, item.unit)}`} onClose={onClose}
    footer={<><Button title="Cancelar" onPress={onClose} style={{ flex: 1 }} /><Button title="Salvar" variant="primary" onPress={save} loading={saving} style={{ flex: 2 }} /></>}>
    <Notice tone="error">{error}</Notice>
    <Segmented options={[['adjustment', 'Contei'], ['loss', 'Perdi']]} value={mode} onChange={next => { setMode(next); setValue(next === 'adjustment' ? number(item.stock, 3) : ''); }} />
    <Field label={mode === 'adjustment' ? `Quanto tem (${item.unit})` : `Quanto perdeu (${item.unit})`}><Input value={value} onChangeText={setValue} keyboardType="decimal-pad" autoFocus /></Field>
    <Field label="Motivo"><Input value={note} onChangeText={setNote} placeholder={mode === 'adjustment' ? 'Contagem semanal' : 'Venceu, caiu…'} /></Field>
    <View style={{ backgroundColor: colors.raised, borderRadius: 8, padding: 12, gap: 6 }}>
      <Line label="Diferença" value={`${after - item.stock > 0 ? '+' : ''}${quantity(after - item.stock, item.unit)}`} />
      <Line label="Estoque depois" value={quantity(Math.max(after, 0), item.unit)} strong />
    </View>
  </Sheet>;
}

function DetailSheet({ item, onClose, onBuy, onAdjust }) {
  const [history, setHistory] = useState(null);
  useEffect(() => { if (item) { setHistory(null); api(`/ingredients/${item.id}/movements`).then(setHistory).catch(() => setHistory([])); } }, [item]);
  if (!item) return null;
  return <Sheet visible title={item.name} subtitle={[item.category, item.supplier].filter(Boolean).join(' · ')} onClose={onClose}
    footer={<><Button title="Corrigir" icon="scale-outline" onPress={onAdjust} style={{ flex: 1 }} /><Button title="Entrada" icon="cart-outline" variant="primary" onPress={onBuy} style={{ flex: 1 }} /></>}>
    <Kpis items={[
      { label: 'Estoque', value: quantity(item.stock, item.unit), note: `mínimo ${quantity(item.min_stock, item.unit)}` },
      { label: 'Dura', value: item.coverage_days == null ? '—' : `${Math.floor(item.coverage_days)} dias`, note: item.daily_usage ? `${quantity(item.daily_usage, item.unit)}/dia` : 'sem consumo recente' },
    ]} />
    {item.suggestion && <Notice tone="warn">Comprar {item.suggestion.packs} × {quantity(item.purchase_quantity, item.unit)} ({currency(item.suggestion.estimated_cost)}) cobre duas semanas{item.planned_need ? ' e os lotes agendados' : ''}.</Notice>}
    <View>
      <Line label="Custo" value={`${unitCost(item.unit_cost)} / ${item.unit}`} />
      <Line label="Valor em estoque" value={currency(item.stock_value)} />
      <Line label="Usado em" value={item.products_using ? `${item.products_using} produtos` : 'nenhuma receita'} />
    </View>
    <Text weight="semibold">Histórico</Text>
    {history === null ? <Loading /> : history.length ? history.slice(0, 30).map(row => <View key={row.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.rule }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text weight="medium" size={14}>{row.type_label}</Text>
        <Text weight="medium" size={14} color={row.quantity < 0 ? colors.negative : colors.positive}>{row.quantity > 0 ? '+' : ''}{quantity(row.quantity, item.unit)}</Text>
      </View>
      <Text size={12} color={colors.muted}>{[dateTime(row.occurred_at), row.batch_label, row.supplier, row.note].filter(Boolean).join(' · ')}</Text>
    </View>) : <Text size={14} color={colors.muted}>Sem movimentações ainda.</Text>}
  </Sheet>;
}

function Line({ label, value, strong, color }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
    <Text size={14} color={colors.muted}>{label}</Text>
    <Text size={14} weight={strong ? 'semibold' : 'medium'} color={color || colors.text}>{value}</Text>
  </View>;
}

function Toggle({ label, value, onChange }) {
  return <Pressable onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <Text size={14} style={{ flex: 1 }}>{label}</Text>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.positive, false: colors.control }} thumbColor="#fff" />
  </Pressable>;
}

export default function IngredientsScreen({ route }) {
  const [filter, setFilter] = useState('attention');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [buying, setBuying] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const { data: items, setData, error, refreshing, refresh, reload } = useLoader(() => api('/ingredients'), []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => {
    if (route.params?.item) setDetailId(route.params.item);
    if (route.params?.noMinimum) setFilter('nomin');
  }, [route.params?.at]);

  const list = items || [];
  const replace = saved => setData(current => current.map(row => (row.id === saved.id ? saved : row)));
  const filtered = useMemo(() => list.filter(row => (filter === 'all' || (filter === 'attention' ? row.status !== 'ok' : filter === 'nomin' ? !(row.min_stock > 0) : row.status === filter))
    && `${row.name} ${row.category} ${row.supplier}`.toLowerCase().includes(search.toLowerCase())), [list, filter, search]);
  const detail = list.find(row => row.id === detailId) || null;
  const attention = list.filter(row => row.status !== 'ok').length;

  return <Screen title="Insumos" subtitle={items ? (attention ? `${attention} para repor · ${currency(list.reduce((s, r) => s + (r.suggestion?.estimated_cost || 0), 0))} em compras` : 'Tudo abastecido') : 'Carregando…'}
    refreshing={refreshing} onRefresh={refresh}>
    <Notice tone="error">{error}</Notice>
    {!items ? <Loading /> : <>
      <Input value={search} onChangeText={setSearch} placeholder="Buscar insumo ou fornecedor" autoCorrect={false} />
      <Chips value={filter} onChange={setFilter} items={[
        { key: 'attention', label: 'Repor', count: attention, alert: true },
        { key: 'out', label: 'Em falta', count: list.filter(row => row.status === 'out').length, alert: true },
        { key: 'ok', label: 'Em dia', count: list.filter(row => row.status === 'ok').length },
        { key: 'all', label: 'Todos', count: list.length },
        { key: 'nomin', label: 'Sem mínimo', count: list.filter(row => !(row.min_stock > 0)).length, alert: true },
      ]} />
      {filter === 'nomin' && <Notice tone="warn">Sem estoque mínimo o assistente só avisa quando o insumo acaba. Defina o mínimo na ficha de cada insumo, pelo painel web.</Notice>}
      <Card padded={false}>
        {filtered.length ? filtered.map(item => <ListRow key={item.id} title={item.name} onPress={() => setDetailId(item.id)}
          subtitle={[item.coverage_days != null ? `dura ${Math.floor(item.coverage_days)} dias` : null, `${unitCost(item.unit_cost)}/${item.unit}`, item.supplier].filter(Boolean).join(' · ')}
          right={quantity(item.stock, item.unit)}>
          {item.min_stock > 0 ? <Meter value={item.stock} max={Math.max(item.min_stock * 2, item.stock, 1)} tone={item.status !== 'ok' ? 'low' : 'accent'} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pill tone={STATUS[item.status][1]}>{STATUS[item.status][0]}</Pill>
            <Button small title="Entrada" icon="cart-outline" onPress={() => setBuying(item)} />
          </View>
        </ListRow>) : <Empty title={filter === 'attention' ? 'Nada para repor' : 'Nenhum insumo encontrado'} text={filter === 'attention' ? 'Todos os insumos estão acima do mínimo.' : 'Cadastre insumos pelo painel web.'} />}
      </Card>
      <Text size={12} color={colors.muted}>Cadastro e edição da ficha de cada insumo ficam no painel web.</Text>
    </>}
    <DetailSheet item={detail} onClose={() => setDetailId(null)} onBuy={() => { setBuying(detail); setDetailId(null); }} onAdjust={() => { setAdjusting(detail); setDetailId(null); }} />
    <PurchaseSheet item={buying} onClose={() => setBuying(null)} onSaved={saved => { setBuying(null); replace(saved); reload(); }} />
    <AdjustSheet item={adjusting} onClose={() => setAdjusting(null)} onSaved={saved => { setAdjusting(null); replace(saved); reload(); }} />
  </Screen>;
}
