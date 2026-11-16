import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { currency, dateBR, inputDate, number, toIsoNoon } from '../lib/format';
import { Actions, Confirm, CountCards, Empty, ErrorNotice, Field, Kpi, KpiStrip, Loading, Modal, PageHeader, Pill, SearchBox, toast } from '../components/UI';

const STATUS = { paid: ['Pago', 'positive'], pending: ['A receber', 'warning'], cancelled: ['Cancelado', 'neutral'] };
const CHANNELS = ['WhatsApp', 'Instagram', 'Encomenda', 'Loja', 'iFood', 'Direto'];
const makeBlank = () => ({ product_id: '', seller_id: '', producer_id: '', establishment_id: '', quantity: 1, unit_price: '', channel: 'WhatsApp', status: 'paid', sold_at: inputDate() });

export default function Sales() {
  const user = getStoredUser();
  const isAdmin = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [producers, setProducers] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') || 'all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => Promise.all([api('/sales'), api('/products'), api('/establishments'), isAdmin ? api('/people') : Promise.resolve([])])
    .then(([sales, prods, places, people]) => {
      setItems(sales); setProducts(prods.filter(row => row.active)); setPartners(places.filter(row => row.active));
      setSellers(people.filter(row => row.active && row.type === 'seller')); setProducers(people.filter(row => row.active && row.type === 'producer'));
    }).catch(err => setError(err.message)).finally(() => setLoading(false)), [isAdmin]);
  useEffect(() => { load(); }, [load]);

  const open = useCallback(item => {
    setFormError('');
    if (item) {
      setEditing({ id: item.id, data: { ...item, product_id: String(item.product_id), seller_id: item.seller_id ? String(item.seller_id) : '', producer_id: item.producer_id ? String(item.producer_id) : '', establishment_id: item.establishment_id ? String(item.establishment_id) : '', sold_at: inputDate(item.sold_at) } });
    } else {
      const first = products[0];
      setEditing({ data: { ...makeBlank(), product_id: String(first?.id || ''), seller_id: String(sellers[0]?.id || ''), unit_price: first?.sale_price || '' } });
    }
  }, [products, sellers]);
  useEffect(() => {
    if (params.get('novo') && !loading) { open(); setParams({}, { replace: true }); }
  }, [params, loading, open, setParams]);

  const form = editing?.data || makeBlank();
  const set = (key, value) => setEditing(current => ({ ...current, data: { ...current.data, [key]: value } }));
  const productChanged = value => {
    const product = products.find(row => row.id === Number(value));
    setEditing(current => ({ ...current, data: { ...current.data, product_id: value, unit_price: product?.sale_price || '', establishment_id: '' } }));
  };
  const eligiblePartners = partners.filter(row => !form.product_id || String(row.product_ids || '').split(',').includes(String(form.product_id)));

  const inPeriod = useMemo(() => items.filter(row => { const day = inputDate(row.sold_at); return (!start || day >= start) && (!end || day <= end); }), [items, start, end]);
  const filtered = useMemo(() => inPeriod.filter(row => (status === 'all' || row.status === status)
    && `${row.product_name} ${row.seller_name || ''} ${row.channel} ${row.establishment_name || ''}`.toLowerCase().includes(search.toLowerCase())), [inPeriod, status, search]);
  const valid = inPeriod.filter(row => row.status !== 'cancelled');
  const revenue = valid.reduce((sum, row) => sum + row.total, 0);
  const units = valid.reduce((sum, row) => sum + row.quantity, 0);
  const pending = inPeriod.filter(row => row.status === 'pending');
  const pendingTotal = pending.reduce((sum, row) => sum + row.total, 0);
  const commission = valid.reduce((sum, row) => sum + (row.seller_earning || 0), 0);
  const cost = valid.reduce((sum, row) => sum + (row.estimated_cost || 0), 0);

  async function save(event) {
    event.preventDefault(); setSaving(true); setFormError('');
    try {
      await api(editing.id ? `/sales/${editing.id}` : '/sales', { method: editing.id ? 'PUT' : 'POST', body: { ...form, sold_at: toIsoNoon(form.sold_at) } });
      toast(editing.id ? 'Venda atualizada' : 'Venda registrada');
      setEditing(null); load();
    } catch (err) { setFormError(err.message); } finally { setSaving(false); }
  }
  async function markPaid(item) {
    try {
      await api(`/sales/${item.id}`, { method: 'PATCH', body: { status: 'paid' } });
      toast(`${currency(item.total)} recebidos`); load();
    } catch (err) { setError(err.message); }
  }
  async function remove() { await api(`/sales/${removing.id}`, { method: 'DELETE' }); toast('Venda excluída'); setRemoving(null); load(); }

  return <div className="page">
    <PageHeader title={isAdmin ? 'Vendas' : 'Minhas vendas'}
      description={isAdmin ? 'Cada venda atualiza faturamento, comissões, estoque pronto e caixa.' : 'Registre suas vendas e acompanhe sua comissão.'}
      actions={<button type="button" className="btn primary" onClick={() => open()} disabled={!products.length}><Plus />Nova venda</button>} />
    <ErrorNotice message={error} />
    <KpiStrip>
      <Kpi lead label={isAdmin ? 'Faturamento' : 'Faturamento que gerei'} value={currency(revenue)} note={`${number(units, 0)} unidades${start || end ? ' no período' : ''}`} />
      <Kpi label="A receber" value={currency(pendingTotal)} note={pending.length ? `${pending.length} ${pending.length === 1 ? 'venda pendente' : 'vendas pendentes'}` : 'nada pendente'} />
      <Kpi label={isAdmin ? 'Bruto depois do custo' : 'Minha comissão'} value={currency(isAdmin ? revenue - cost : commission)} note={isAdmin ? 'antes de taxas e comissões' : 'sobre vendas não canceladas'} />
    </KpiStrip>
    <section className="panel">
      <div className="panel-body" style={{ paddingBottom: 4 }}>
        <CountCards value={status} onChange={setStatus} items={[
          { key: 'all', label: 'Todas', count: inPeriod.length },
          { key: 'pending', label: 'A receber', count: pending.length },
          { key: 'paid', label: 'Pagas', count: inPeriod.filter(row => row.status === 'paid').length },
          { key: 'cancelled', label: 'Canceladas', count: inPeriod.filter(row => row.status === 'cancelled').length },
        ]} />
        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar produto, vendedor, canal" />
          <div className="date-range">
            <input type="date" value={start} onChange={e => setStart(e.target.value)} aria-label="Data inicial das vendas" />
            <span className="small muted">até</span>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} aria-label="Data final das vendas" />
          </div>
          {(start || end) && <button type="button" className="btn ghost small" onClick={() => { setStart(''); setEnd(''); }}>Limpar datas</button>}
        </div>
      </div>
      {loading ? <Loading rows={6} /> : filtered.length ? <div className="table-wrap"><table className="responsive">
        <thead><tr><th>Produto</th><th>Data</th>{isAdmin && <th>Vendedor</th>}<th>Canal</th><th className="num">Qtd.</th><th className="num">Total</th><th>Situação</th><th /></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.id} className={item.status === 'cancelled' ? 'dim' : ''}>
          <td className="primary"><strong>{item.product_name}</strong><span className="sub">{currency(item.unit_price)} cada{item.establishment_name ? ` · ${item.establishment_name}` : ''}</span></td>
          <td className="meta plain">{dateBR(item.sold_at)}</td>
          {isAdmin && <td className="meta" data-label="Vendedor">{item.seller_name || <span className="dash">—</span>}</td>}
          <td className="meta" data-label="Canal">{item.channel}</td>
          <td className="num meta" data-label="Qtd.">{item.quantity}</td>
          <td className="num lead"><strong>{currency(item.total)}</strong></td>
          <td className="status"><Pill tone={STATUS[item.status][1]}>{STATUS[item.status][0]}</Pill></td>
          <td className="actions"><div className="row-actions">
            {item.status === 'pending' && <button type="button" className="btn small" onClick={() => markPaid(item)}><Check />Recebi</button>}
            <Actions onEdit={() => open(item)} onDelete={() => setRemoving(item)} />
          </div></td>
        </tr>)}</tbody>
      </table></div> : <Empty title={items.length ? 'Nenhuma venda neste filtro' : 'Nenhuma venda registrada'} text={products.length ? 'Registre uma venda para alimentar os indicadores.' : 'Cadastre um produto antes de vender.'} />}
    </section>

    <Modal open={!!editing} onClose={() => setEditing(null)} onSubmit={save} title={editing?.id ? 'Editar venda' : 'Nova venda'} subtitle="A comissão do parceiro é aplicada automaticamente."
      footer={<><button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar venda'}</button></>}>
      <ErrorNotice message={formError} />
      <div className="form-grid">
        <Field label="Produto" span><select value={form.product_id} onChange={e => productChanged(e.target.value)} required><option value="">Selecione</option>{products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label="Quantidade"><input type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} required /></Field>
        <Field label="Preço por unidade"><div className="input-affix"><b>R$</b><input type="number" inputMode="decimal" min="0" step="0.01" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} required aria-label="Preço por unidade" /></div></Field>
        <Field label="Data"><input type="date" value={form.sold_at} onChange={e => set('sold_at', e.target.value)} required /></Field>
        <Field label="Situação"><select value={form.status} onChange={e => set('status', e.target.value)}>{Object.entries(STATUS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Canal"><select value={form.channel} onChange={e => set('channel', e.target.value)}>{CHANNELS.map(name => <option key={name}>{name}</option>)}</select></Field>
        <Field label="Parceiro"><select value={form.establishment_id} onChange={e => set('establishment_id', e.target.value)}><option value="">Venda direta</option>{eligiblePartners.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        {isAdmin && <Field label="Vendedor"><select value={form.seller_id} onChange={e => set('seller_id', e.target.value)} required><option value="">Selecione</option>{sellers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
        {isAdmin && <Field label="Produtor"><select value={form.producer_id} onChange={e => set('producer_id', e.target.value)}><option value="">Do último lote concluído</option>{producers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
      </div>
      <div className="preview-box"><div className="preview-line total"><span>Total desta venda</span><strong>{currency(Number(form.quantity || 0) * Number(form.unit_price || 0))}</strong></div></div>
    </Modal>
    <Confirm open={!!removing} title="Excluir esta venda?" confirmLabel="Excluir venda" text="O lançamento sai do histórico e os indicadores são recalculados. Para desfazer uma venda mantendo o registro, mude a situação para Cancelado." onCancel={() => setRemoving(null)} onConfirm={remove} />
  </div>;
}
