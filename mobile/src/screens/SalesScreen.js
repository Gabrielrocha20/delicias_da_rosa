import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api';
import { currency, dateShort, dayIso, number, parseDecimal } from '../format';
import { colors } from '../theme';
import { Button, Card, Chips, Empty, Field, Input, Kpis, ListRow, Loading, Notice, Pill, Screen, Segmented, Select, Sheet, Text, useLoader, useToast } from '../ui';

const STATUS = { paid: ['Pago', 'positive'], pending: ['A receber', 'warning'], cancelled: ['Cancelado', 'neutral'] };
const CHANNELS = ['WhatsApp', 'Instagram', 'Encomenda', 'Loja', 'iFood', 'Direto'];
const DAYS = [['0', 'Hoje'], ['-1', 'Ontem'], ['-2', 'Anteontem']];

function SaleForm({ visible, sale, catalog, isAdmin, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setError('');
    const first = catalog.products[0];
    setForm(sale ? {
      product_id: sale.product_id, quantity: String(sale.quantity), unit_price: String(sale.unit_price).replace('.', ','), channel: sale.channel,
      status: sale.status, establishment_id: sale.establishment_id || '', seller_id: sale.seller_id || '', day: null, sold_at: sale.sold_at,
    } : {
      product_id: first?.id || '', quantity: '1', unit_price: String(first?.sale_price ?? '').replace('.', ','), channel: 'WhatsApp',
      status: 'paid', establishment_id: '', seller_id: catalog.sellers[0]?.id || '', day: '0',
    });
  }, [visible, sale, catalog]);
  if (!form) return null;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const quantity = Number(form.quantity || 0);
  const price = parseDecimal(form.unit_price);
  const partners = catalog.partners.filter(row => String(row.product_ids || '').split(',').includes(String(form.product_id)));

  async function save() {
    if (!form.product_id || !(quantity > 0) || !(price >= 0)) { setError('Confira produto, quantidade e preço.'); return; }
    setSaving(true); setError('');
    const body = {
      product_id: form.product_id, quantity, unit_price: price, channel: form.channel, status: form.status,
      establishment_id: form.establishment_id || null, sold_at: form.day !== null ? dayIso(Number(form.day)) : form.sold_at,
      ...(isAdmin ? { seller_id: form.seller_id || null } : {}),
    };
    try {
      await api(sale ? `/sales/${sale.id}` : '/sales', { method: sale ? 'PATCH' : 'POST', body });
      toast(sale ? 'Venda atualizada' : `Venda de ${currency(quantity * price)} registrada`);
      onSaved();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return <Sheet visible={visible} title={sale ? 'Editar venda' : 'Nova venda'} onClose={onClose}
    footer={<><Button title="Cancelar" onPress={onClose} style={{ flex: 1 }} /><Button title={`Salvar · ${currency((quantity || 0) * (price || 0))}`} variant="primary" onPress={save} loading={saving} style={{ flex: 2 }} /></>}>
    <Notice tone="error">{error}</Notice>
    <Select label="Produto" value={form.product_id} options={catalog.products.map(row => ({ value: row.id, label: row.name, note: currency(row.sale_price) }))}
      onChange={value => { const product = catalog.products.find(row => row.id === value); setForm(current => ({ ...current, product_id: value, unit_price: String(product?.sale_price ?? '').replace('.', ','), establishment_id: '' })); }} />
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}><Field label="Quantidade">
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={() => set('quantity', String(Math.max(1, quantity - 1)))} style={stepper} accessibilityLabel="Menos um"><Ionicons name="remove" size={20} color={colors.text} /></Pressable>
          <Input style={{ flex: 1 }} value={form.quantity} onChangeText={value => set('quantity', value.replace(/\D/g, ''))} keyboardType="number-pad" textAlign="center" />
          <Pressable onPress={() => set('quantity', String(quantity + 1))} style={stepper} accessibilityLabel="Mais um"><Ionicons name="add" size={20} color={colors.text} /></Pressable>
        </View>
      </Field></View>
      <View style={{ flex: 1 }}><Field label="Preço cada"><Input prefix="R$" value={form.unit_price} onChangeText={value => set('unit_price', value)} keyboardType="decimal-pad" /></Field></View>
    </View>
    {!sale && <Field label="Quando"><Segmented options={DAYS} value={form.day} onChange={value => set('day', value)} /></Field>}
    <Field label="Situação"><Segmented options={Object.entries(STATUS).map(([key, [label]]) => [key, label])} value={form.status} onChange={value => set('status', value)} /></Field>
    <Select label="Canal" value={form.channel} options={CHANNELS.map(name => ({ value: name, label: name }))} onChange={value => set('channel', value)} />
    {partners.length > 0 && <Select label="Parceiro" value={form.establishment_id} options={[{ value: '', label: 'Venda direta' }, ...partners.map(row => ({ value: row.id, label: row.name }))]} onChange={value => set('establishment_id', value)} />}
    {isAdmin && <Select label="Vendedor" value={form.seller_id} options={catalog.sellers.map(row => ({ value: row.id, label: row.name }))} onChange={value => set('seller_id', value)} />}
  </Sheet>;
}
const stepper = { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.control, alignItems: 'center', justifyContent: 'center' };

export default function SalesScreen({ route, navigation, user }) {
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const { data, error, refreshing, refresh, reload } = useLoader(async () => {
    const [sales, products, partners, people] = await Promise.all([api('/sales'), api('/products'), api('/establishments'), isAdmin ? api('/people?type=seller') : Promise.resolve([])]);
    return { sales, catalog: { products: products.filter(row => row.active), partners: partners.filter(row => row.active), sellers: people.filter(row => row.active) } };
  }, [isAdmin]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => {
    if (route.params?.status) setFilter(route.params.status);
    if (route.params?.openNew) setEditing({});
  }, [route.params?.at]);

  const sales = data?.sales || [];
  const since = Date.now() - 30 * 86400000;
  const recent = sales.filter(row => new Date(row.sold_at).getTime() >= since && row.status !== 'cancelled');
  const pending = sales.filter(row => row.status === 'pending');
  const filtered = useMemo(() => sales.filter(row => filter === 'all' || row.status === filter).slice(0, 80), [sales, filter]);

  async function markPaid(sale) {
    try { await api(`/sales/${sale.id}`, { method: 'PATCH', body: { status: 'paid' } }); toast(`${currency(sale.total)} recebidos`); reload(); }
    catch (err) { toast(err.message, 'error'); }
  }
  function actions(sale) {
    Alert.alert(sale.product_name, `${sale.quantity} un. · ${currency(sale.total)}`, [
      ...(sale.status === 'pending' ? [{ text: 'Marcar como recebido', onPress: () => markPaid(sale) }] : []),
      { text: 'Editar', onPress: () => setEditing(sale) },
      { text: 'Excluir', style: 'destructive', onPress: () => Alert.alert('Excluir venda?', 'Os indicadores serão recalculados.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: async () => { try { await api(`/sales/${sale.id}`, { method: 'DELETE' }); toast('Venda excluída'); reload(); } catch (err) { toast(err.message, 'error'); } } }]) },
      { text: 'Fechar', style: 'cancel' },
    ]);
  }

  return <Screen title={isAdmin ? 'Vendas' : 'Minhas vendas'} subtitle={pending.length ? `${currency(pending.reduce((s, r) => s + r.total, 0))} a receber` : 'Nada pendente'}
    refreshing={refreshing} onRefresh={refresh}
    action={<Button small variant="primary" title="Venda" icon="add" onPress={() => setEditing({})} disabled={!data?.catalog.products.length} />}>
    <Notice tone="error">{error}</Notice>
    {!data ? <Loading /> : <>
      <Kpis items={[
        { label: 'Últimos 30 dias', value: currency(recent.reduce((s, r) => s + r.total, 0)), note: `${number(recent.reduce((s, r) => s + r.quantity, 0), 0)} unidades` },
        { label: isAdmin ? 'A receber' : 'Minha comissão', value: isAdmin ? currency(pending.reduce((s, r) => s + r.total, 0)) : currency(recent.reduce((s, r) => s + (r.seller_earning || 0), 0)), note: isAdmin ? `${pending.length} vendas` : '30 dias' },
      ]} />
      <Chips value={filter} onChange={setFilter} items={[
        { key: 'all', label: 'Todas', count: sales.length },
        { key: 'pending', label: 'A receber', count: pending.length, alert: true },
        { key: 'paid', label: 'Pagas', count: sales.filter(row => row.status === 'paid').length },
        { key: 'cancelled', label: 'Canceladas', count: sales.filter(row => row.status === 'cancelled').length },
      ]} />
      <Card padded={false}>
        {filtered.length ? filtered.map(sale => <ListRow key={sale.id} onPress={() => actions(sale)} title={sale.product_name}
          subtitle={[dateShort(sale.sold_at), `${sale.quantity} × ${currency(sale.unit_price)}`, sale.channel, isAdmin ? sale.seller_name : null, sale.establishment_name].filter(Boolean).join(' · ')}
          right={<Text weight="medium" color={sale.status === 'cancelled' ? colors.muted : colors.text}>{currency(sale.total)}</Text>}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pill tone={STATUS[sale.status][1]}>{STATUS[sale.status][0]}</Pill>
            {sale.status === 'pending' && <Button small title="Recebi" icon="checkmark" onPress={() => markPaid(sale)} />}
          </View>
        </ListRow>) : <Empty title="Nenhuma venda aqui" text="Toque em “Venda” para registrar." />}
      </Card>
    </>}
    {data && <SaleForm visible={!!editing} sale={editing?.id ? editing : null} catalog={data.catalog} isAdmin={isAdmin} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
  </Screen>;
}
