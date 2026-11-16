import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Play, Plus } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { currency, dateBR, inputDate, number, quantity, toIsoNoon } from '../lib/format';
import { Actions, Confirm, CountCards, Empty, ErrorNotice, Field, Kpi, KpiStrip, Loading, Modal, Notice, PageHeader, Pill, SearchBox, toast } from '../components/UI';

const STATUS = { planned: ['Planejado', 'neutral'], in_progress: ['Em produção', 'warning'], completed: ['Concluído', 'positive'] };
const NEXT = { planned: ['in_progress', 'Iniciar', Play], in_progress: ['completed', 'Concluir', CheckCircle2] };
const makeBlank = () => ({ product_id: '', producer_id: '', quantity: 20, status: 'planned', produced_at: inputDate(), notes: '' });

function RecipeCheck({ productId, amount }) {
  const [recipe, setRecipe] = useState(null);
  useEffect(() => {
    setRecipe(null);
    if (productId) api(`/products/${productId}`).then(data => setRecipe(data.recipe || [])).catch(() => setRecipe([]));
  }, [productId]);
  if (!productId || recipe === null) return null;
  if (!recipe.length) return <Notice tone="warn">Este produto está sem ficha técnica, então nenhum insumo será baixado do estoque.</Notice>;
  const rows = recipe.map(row => ({ ...row, need: row.quantity * Number(amount || 0) }));
  const missing = rows.filter(row => row.need > row.stock);
  return <div className="preview-box">
    <div className="preview-line"><strong>Insumos para {number(amount, 0)} un.</strong><span className={missing.length ? 'negative' : 'positive'}>{missing.length ? `${missing.length} em falta` : 'tudo disponível'}</span></div>
    {rows.map(row => <div className="preview-line" key={row.ingredient_id}>
      <span>{row.name}</span>
      <strong className={row.need > row.stock ? 'negative' : ''}>{quantity(row.need, row.unit)} <span className="muted">de {quantity(row.stock, row.unit)}</span></strong>
    </div>)}
  </div>;
}

export default function Production() {
  const user = getStoredUser();
  const isAdmin = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => Promise.all([api('/production'), api('/products'), isAdmin ? api('/people?type=producer') : Promise.resolve([])])
    .then(([batches, prods, producers]) => { setItems(batches); setProducts(prods.filter(row => row.active)); setPeople(producers.filter(row => row.active)); })
    .catch(err => setError(err.message)).finally(() => setLoading(false)), [isAdmin]);
  useEffect(() => { load(); }, [load]);

  const open = useCallback((item, preset = {}) => {
    setFormError('');
    if (item) setEditing({ id: item.id, data: { ...item, product_id: String(item.product_id), producer_id: item.producer_id ? String(item.producer_id) : '', produced_at: inputDate(item.produced_at) } });
    else setEditing({ data: { ...makeBlank(), product_id: String(products[0]?.id || ''), producer_id: String(people[0]?.id || ''), ...preset } });
  }, [products, people]);
  useEffect(() => {
    const productId = params.get('novo');
    if (productId && !loading) {
      open(null, { product_id: productId, quantity: Number(params.get('qtd')) || 20 });
      setParams({}, { replace: true });
    }
  }, [params, loading, open, setParams]);

  const form = editing?.data || makeBlank();
  const set = (key, value) => setEditing(current => ({ ...current, data: { ...current.data, [key]: value } }));
  const filtered = useMemo(() => items.filter(row => (status === 'all' || (status === 'open' ? row.status !== 'completed' : row.status === status))
    && `${row.product_name} ${row.producer_name || ''} ${row.notes}`.toLowerCase().includes(search.toLowerCase())), [items, status, search]);
  const sum = key => items.filter(row => row.status === key).reduce((total, row) => total + row.quantity, 0);
  const since = Date.now() - 30 * 86400000;
  const done30 = items.filter(row => row.status === 'completed' && new Date(row.produced_at).getTime() >= since);

  async function save(event) {
    event.preventDefault(); setSaving(true); setFormError('');
    try {
      await api(editing.id ? `/production/${editing.id}` : '/production', { method: editing.id ? 'PUT' : 'POST', body: { ...form, produced_at: toIsoNoon(form.produced_at) } });
      toast(form.status === 'completed' ? 'Lote concluído e insumos baixados' : 'Lote salvo');
      setEditing(null); load();
    } catch (err) { setFormError(err.message); } finally { setSaving(false); }
  }
  async function advance(item) {
    const [next] = NEXT[item.status];
    try {
      await api(`/production/${item.id}`, { method: 'PATCH', body: { status: next } });
      toast(next === 'completed' ? `${item.quantity} un. de ${item.product_name} prontas` : 'Lote em produção');
      load();
    } catch (err) { setError(err.message); }
  }
  async function remove() { await api(`/production/${removing.id}`, { method: 'DELETE' }); toast('Lote excluído'); setRemoving(null); load(); }

  return <div className="page">
    <PageHeader title={isAdmin ? 'Produção' : 'Minha produção'}
      description="Ao concluir um lote, os insumos da receita saem do estoque automaticamente e o produto fica pronto para vender."
      actions={<button type="button" className="btn primary" onClick={() => open()} disabled={!products.length}><Plus />Novo lote</button>} />
    <ErrorNotice message={error} />
    <KpiStrip>
      <Kpi lead label="Concluído em 30 dias" value={number(done30.reduce((total, row) => total + row.quantity, 0), 0)} unit="un." note={`${done30.length} lotes · ${currency(done30.reduce((total, row) => total + row.total_cost, 0))} de custo`} />
      <Kpi label="Planejado" value={number(sum('planned'), 0)} unit="un." note="aguardando início" />
      <Kpi label="Em produção" value={number(sum('in_progress'), 0)} unit="un." note="na cozinha agora" />
    </KpiStrip>
    <section className="panel">
      <div className="panel-body" style={{ paddingBottom: 4 }}>
        <CountCards value={status} onChange={setStatus} items={[
          { key: 'open', label: 'Em aberto', count: items.filter(row => row.status !== 'completed').length },
          { key: 'planned', label: 'Planejados', count: items.filter(row => row.status === 'planned').length },
          { key: 'in_progress', label: 'Em produção', count: items.filter(row => row.status === 'in_progress').length },
          { key: 'completed', label: 'Concluídos', count: items.filter(row => row.status === 'completed').length },
        ]} />
        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}><SearchBox value={search} onChange={setSearch} placeholder="Buscar produto ou responsável" /></div>
      </div>
      {loading ? <Loading rows={5} /> : filtered.length ? <div className="table-wrap"><table className="responsive">
        <thead><tr><th>Lote</th><th>Data</th>{isAdmin && <th>Responsável</th>}<th className="num">Quantidade</th><th className="num">Custo</th><th>Situação</th><th /></tr></thead>
        <tbody>{filtered.map(item => {
          const next = NEXT[item.status];
          return <tr key={item.id}>
            <td className="primary"><strong>{item.product_name}</strong><span className="sub">{item.notes || `Lote #${item.id}`}</span></td>
            <td className="meta plain">{dateBR(item.produced_at)}</td>
            {isAdmin && <td className="meta" data-label="Responsável">{item.producer_name || <span className="dash">—</span>}</td>}
            <td className="num lead">{item.quantity} un.</td>
            <td className="num meta" data-label="Custo">{currency(item.total_cost)}</td>
            <td className="status"><Pill tone={STATUS[item.status][1]}>{STATUS[item.status][0]}</Pill></td>
            <td className="actions"><div className="row-actions">
              {next && <button type="button" className="btn small" onClick={() => advance(item)}>{(() => { const Icon = next[2]; return <Icon />; })()}{next[1]}</button>}
              <Actions onEdit={() => open(item)} onDelete={() => setRemoving(item)} />
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty title={items.length ? 'Nenhum lote neste filtro' : 'Nenhum lote ainda'} text="Agende um lote para organizar a cozinha." />}
    </section>

    <Modal open={!!editing} onClose={() => setEditing(null)} onSubmit={save} title={editing?.id ? `Editar lote #${editing.id}` : 'Novo lote'} subtitle="Planeje, acompanhe e conclua para baixar os insumos."
      footer={<><button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar lote'}</button></>}>
      <ErrorNotice message={formError} />
      <div className="form-grid">
        <Field label="Produto" span><select value={form.product_id} onChange={e => set('product_id', e.target.value)} required><option value="">Selecione</option>{products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label="Quantidade (unidades)"><input type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} required /></Field>
        <Field label="Data"><input type="date" value={form.produced_at} onChange={e => set('produced_at', e.target.value)} required /></Field>
        {isAdmin && <Field label="Produtor"><select value={form.producer_id} onChange={e => set('producer_id', e.target.value)} required><option value="">Selecione</option>{people.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
        <Field label="Situação"><select value={form.status} onChange={e => set('status', e.target.value)}>{Object.entries(STATUS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Observações" span><textarea rows="2" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ex.: separar morangos pela manhã" /></Field>
      </div>
      {isAdmin && <RecipeCheck productId={form.product_id} amount={form.quantity} />}
    </Modal>
    <Confirm open={!!removing} title="Excluir este lote?" confirmLabel="Excluir lote" text="Se o lote já foi concluído, os insumos consumidos voltam para o estoque." onCancel={() => setRemoving(null)} onConfirm={remove} />
  </div>;
}
