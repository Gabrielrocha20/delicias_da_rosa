import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { currency, dateShort, dayIso, number, quantity as fmtQty } from '../format';
import { colors } from '../theme';
import { Button, Card, Chips, Empty, Field, Input, Kpis, ListRow, Loading, Notice, Pill, Screen, Segmented, Select, Sheet, Text, useLoader, useToast } from '../ui';

const STATUS = { planned: ['Planejado', 'neutral'], in_progress: ['Em produção', 'warning'], completed: ['Concluído', 'positive'] };
const NEXT = { planned: ['in_progress', 'Iniciar', 'play'], in_progress: ['completed', 'Concluir', 'checkmark-done'] };
const DAYS = [['0', 'Hoje'], ['1', 'Amanhã'], ['2', 'Depois']];

function RecipeCheck({ productId, amount }) {
  const [recipe, setRecipe] = useState(null);
  useEffect(() => { setRecipe(null); if (productId) api(`/products/${productId}`).then(data => setRecipe(data.recipe || [])).catch(() => setRecipe([])); }, [productId]);
  if (!recipe) return null;
  if (!recipe.length) return <Notice tone="warn">Produto sem ficha técnica: nenhum insumo será baixado.</Notice>;
  const missing = recipe.filter(row => row.quantity * amount > row.stock).length;
  return <View style={{ backgroundColor: colors.raised, borderRadius: 8, padding: 12, gap: 6 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text weight="medium" size={14}>Insumos para {number(amount, 0)} un.</Text>
      <Text size={14} color={missing ? colors.negative : colors.positive}>{missing ? `${missing} em falta` : 'tudo disponível'}</Text>
    </View>
    {recipe.map(row => <View key={row.ingredient_id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text size={13} color={colors.muted} style={{ flex: 1 }} numberOfLines={1}>{row.name}</Text>
      <Text size={13} color={row.quantity * amount > row.stock ? colors.negative : colors.text}>{fmtQty(row.quantity * amount, row.unit)} de {fmtQty(row.stock, row.unit)}</Text>
    </View>)}
  </View>;
}

function BatchForm({ visible, preset, catalog, isAdmin, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setError('');
    setForm({ product_id: preset?.product_id || catalog.products[0]?.id || '', quantity: String(preset?.quantity || 20), producer_id: catalog.producers[0]?.id || '', status: 'planned', day: '0', notes: '' });
  }, [visible, preset, catalog]);
  if (!form) return null;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const amount = Number(form.quantity || 0);

  async function save() {
    if (!form.product_id || !(amount > 0)) { setError('Escolha o produto e a quantidade.'); return; }
    setSaving(true); setError('');
    try {
      await api('/production', { method: 'POST', body: { product_id: form.product_id, quantity: amount, status: form.status, produced_at: dayIso(Number(form.day)), notes: form.notes, ...(isAdmin ? { producer_id: form.producer_id } : {}) } });
      toast(form.status === 'completed' ? 'Lote concluído e insumos baixados' : 'Lote agendado');
      onSaved();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return <Sheet visible={visible} title="Novo lote" subtitle="Ao concluir, a receita sai do estoque." onClose={onClose}
    footer={<><Button title="Cancelar" onPress={onClose} style={{ flex: 1 }} /><Button title="Salvar lote" variant="primary" onPress={save} loading={saving} style={{ flex: 2 }} /></>}>
    <Notice tone="error">{error}</Notice>
    <Select label="Produto" value={form.product_id} options={catalog.products.map(row => ({ value: row.id, label: row.name }))} onChange={value => set('product_id', value)} />
    <Field label="Quantidade (unidades)"><Input value={form.quantity} onChangeText={value => set('quantity', value.replace(/\D/g, ''))} keyboardType="number-pad" /></Field>
    <Field label="Quando"><Segmented options={DAYS} value={form.day} onChange={value => set('day', value)} /></Field>
    <Field label="Situação"><Segmented options={Object.entries(STATUS).map(([key, [label]]) => [key, label])} value={form.status} onChange={value => set('status', value)} /></Field>
    {isAdmin && <Select label="Produtor" value={form.producer_id} options={catalog.producers.map(row => ({ value: row.id, label: row.name }))} onChange={value => set('producer_id', value)} />}
    <Field label="Observações"><Input value={form.notes} onChangeText={value => set('notes', value)} placeholder="Ex.: separar morangos" /></Field>
    {isAdmin && <RecipeCheck productId={form.product_id} amount={amount} />}
  </Sheet>;
}

export default function ProductionScreen({ route, user }) {
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [filter, setFilter] = useState('open');
  const [creating, setCreating] = useState(null);
  const { data, error, refreshing, refresh, reload } = useLoader(async () => {
    const [batches, products, producers] = await Promise.all([api('/production'), api('/products'), isAdmin ? api('/people?type=producer') : Promise.resolve([])]);
    return { batches, catalog: { products: products.filter(row => row.active), producers: producers.filter(row => row.active) } };
  }, [isAdmin]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => {
    if (route.params?.newProduct) setCreating({ product_id: route.params.newProduct, quantity: route.params.newQuantity });
  }, [route.params?.at]);

  const batches = data?.batches || [];
  const filtered = useMemo(() => batches.filter(row => (filter === 'open' ? row.status !== 'completed' : row.status === filter)).slice(0, 80), [batches, filter]);
  const since = Date.now() - 30 * 86400000;
  const done = batches.filter(row => row.status === 'completed' && new Date(row.produced_at).getTime() >= since);

  async function advance(batch) {
    const [next] = NEXT[batch.status];
    try { await api(`/production/${batch.id}`, { method: 'PATCH', body: { status: next } }); toast(next === 'completed' ? `${batch.quantity} un. de ${batch.product_name} prontas` : 'Lote em produção'); reload(); }
    catch (err) { Alert.alert('Não foi possível concluir', err.message); }
  }
  function remove(batch) {
    Alert.alert('Excluir lote?', batch.status === 'completed' ? 'Os insumos consumidos voltam para o estoque.' : 'O lote sai da agenda.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { try { await api(`/production/${batch.id}`, { method: 'DELETE' }); toast('Lote excluído'); reload(); } catch (err) { toast(err.message, 'error'); } } },
    ]);
  }

  return <Screen title={isAdmin ? 'Produção' : 'Minha produção'} subtitle={`${batches.filter(row => row.status !== 'completed').length} lotes em aberto`} refreshing={refreshing} onRefresh={refresh}
    action={<Button small variant="primary" title="Lote" icon="add" onPress={() => setCreating({})} disabled={!data?.catalog.products.length} />}>
    <Notice tone="error">{error}</Notice>
    {!data ? <Loading /> : <>
      <Kpis items={[
        { label: 'Concluído em 30 dias', value: `${number(done.reduce((s, r) => s + r.quantity, 0), 0)} un.`, note: `${done.length} lotes · ${currency(done.reduce((s, r) => s + r.total_cost, 0))}` },
        { label: 'Na fila', value: `${number(batches.filter(row => row.status !== 'completed').reduce((s, r) => s + r.quantity, 0), 0)} un.`, note: 'planejado + em produção' },
      ]} />
      <Chips value={filter} onChange={setFilter} items={[
        { key: 'open', label: 'Em aberto', count: batches.filter(row => row.status !== 'completed').length },
        { key: 'in_progress', label: 'Em produção', count: batches.filter(row => row.status === 'in_progress').length },
        { key: 'completed', label: 'Concluídos', count: batches.filter(row => row.status === 'completed').length },
      ]} />
      <Card padded={false}>
        {filtered.length ? filtered.map(batch => {
          const next = NEXT[batch.status];
          return <ListRow key={batch.id} title={batch.product_name} onPress={() => remove(batch)}
            subtitle={[dateShort(batch.produced_at), isAdmin ? batch.producer_name : null, batch.notes].filter(Boolean).join(' · ')}
            right={`${batch.quantity} un.`} rightSub={currency(batch.total_cost)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pill tone={STATUS[batch.status][1]}>{STATUS[batch.status][0]}</Pill>
              {next && <Button small title={next[1]} icon={next[2]} onPress={() => advance(batch)} />}
            </View>
          </ListRow>;
        }) : <Empty title="Nenhum lote aqui" text="Toque em “Lote” para agendar." />}
      </Card>
      <Text size={12} color={colors.muted}>Toque num lote para excluir. Edições completas ficam no painel web.</Text>
    </>}
    {data && <BatchForm visible={!!creating} preset={creating} catalog={data.catalog} isAdmin={isAdmin} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); reload(); }} />}
  </Screen>;
}
