import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { currency, number, percent, unitCost } from '../lib/format';
import { Actions, Confirm, Empty, ErrorNotice, Field, Kpi, KpiStrip, Loading, Modal, PageHeader, Pill, SearchBox, Segmented, toast } from '../components/UI';

const blank = () => ({ name: '', category: 'Bolo de pote', sale_price: 14, packaging_cost: 0.76, other_cost: 0, sales_fee: 3.5, seller_commission: 15, producer_commission: 15, cash_percentage: 20, active: true, recipe: [] });
const CATEGORIES = ['Bolo de pote', 'Bolo inteiro', 'Fatia', 'Doce', 'Torta', 'Kit'];

function ProductForm({ open, initial, ingredients, onClose, onSaved }) {
  const [form, setForm] = useState(blank());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setError(''); setForm(initial ? { ...blank(), ...initial, recipe: (initial.recipe || []).map(row => ({ ingredient_id: row.ingredient_id, quantity: row.quantity })) } : blank()); } }, [open, initial]);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const byId = useMemo(() => Object.fromEntries(ingredients.map(row => [row.id, row])), [ingredients]);
  const recipeCost = form.recipe.reduce((sum, row) => sum + (byId[row.ingredient_id]?.unit_cost || 0) * Number(row.quantity || 0), 0);
  const price = Number(form.sale_price || 0);
  const directCost = recipeCost + Number(form.packaging_cost || 0) + Number(form.other_cost || 0);
  const rate = (Number(form.sales_fee || 0) + Number(form.seller_commission || 0) + Number(form.producer_commission || 0) + Number(form.cash_percentage || 0)) / 100;
  const deductions = price * rate;
  const profit = price - directCost - deductions;
  const margin = price ? (profit / price) * 100 : 0;
  const targetPrice = rate + 0.25 < 1 ? directCost / (1 - rate - 0.25) : null;
  const capacity = form.recipe.filter(row => Number(row.quantity) > 0 && byId[row.ingredient_id])
    .map(row => [Math.floor(byId[row.ingredient_id].stock / Number(row.quantity)), byId[row.ingredient_id].name])
    .sort((a, b) => a[0] - b[0])[0];

  const used = new Set(form.recipe.map(row => Number(row.ingredient_id)));
  const addRow = () => { const first = ingredients.find(row => !used.has(row.id)); if (first) set('recipe', [...form.recipe, { ingredient_id: first.id, quantity: '' }]); };
  const updateRow = (index, key, value) => set('recipe', form.recipe.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    const body = { ...form, recipe: form.recipe.filter(row => Number(row.quantity) > 0).map(row => ({ ingredient_id: Number(row.ingredient_id), quantity: Number(row.quantity) })) };
    try {
      await api(initial ? `/products/${initial.id}` : '/products', { method: initial ? 'PUT' : 'POST', body });
      toast(initial ? 'Ficha técnica atualizada' : 'Produto cadastrado');
      onSaved();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  const num = (key, label, props = {}) => <Field label={label}><input type="number" inputMode="decimal" step="0.01" min="0" value={form[key]} onChange={e => set(key, e.target.value)} {...props} /></Field>;

  return <Modal open={open} onClose={onClose} onSubmit={submit} wide title={initial ? `Ficha técnica · ${initial.name}` : 'Novo produto'}
    subtitle="Ingredientes por unidade produzida. Custos e margem são recalculados enquanto você digita."
    footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar ficha técnica'}</button></>}>
    <ErrorNotice message={error} />
    <div className="editor">
      <div>
        <div className="form-grid">
          <Field label="Nome do produto"><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex.: Ninho com morango" required autoFocus /></Field>
          <Field label="Categoria"><input list="product-categories" value={form.category} onChange={e => set('category', e.target.value)} required /><datalist id="product-categories">{CATEGORIES.map(name => <option key={name} value={name} />)}</datalist></Field>
          {num('sale_price', 'Preço de venda (R$)', { required: true })}
          {num('packaging_cost', 'Embalagem (R$ por unidade)')}
        </div>
        <div className="section-head"><div><h3>Receita de uma unidade</h3><small>Quantidade na unidade de uso de cada insumo</small></div><button type="button" className="btn small" onClick={addRow} disabled={used.size >= ingredients.length}><Plus />Ingrediente</button></div>
        {form.recipe.length ? form.recipe.map((row, index) => {
          const ingredient = byId[row.ingredient_id];
          return <div className="recipe-row" key={index}>
            <Field label="Insumo"><select value={row.ingredient_id} onChange={e => updateRow(index, 'ingredient_id', Number(e.target.value))}>{ingredients.filter(item => item.id === Number(row.ingredient_id) || !used.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label={`Quantidade (${ingredient?.unit || 'un'})`}><input type="number" inputMode="decimal" step="any" min="0" value={row.quantity} onChange={e => updateRow(index, 'quantity', e.target.value)} required /></Field>
            <div className="recipe-cost">{currency((ingredient?.unit_cost || 0) * Number(row.quantity || 0))}<small>{unitCost(ingredient?.unit_cost)}/{ingredient?.unit}</small></div>
            <button type="button" className="icon-btn danger" aria-label="Remover ingrediente" onClick={() => set('recipe', form.recipe.filter((_, i) => i !== index))} style={{ marginBottom: 3 }}><Trash2 /></button>
          </div>;
        }) : <Empty title="Receita vazia" text="Adicione os ingredientes e a embalagem usados em uma unidade." />}
        <div className="section-head"><div><h3>Deduções sobre o preço</h3><small>Percentuais aplicados em cada venda</small></div></div>
        <div className="form-grid three">
          {num('other_cost', 'Outros custos (R$)')}
          {num('sales_fee', 'Taxa de venda (%)')}
          {num('seller_commission', 'Comissão vendedor (%)')}
          {num('producer_commission', 'Comissão produtor (%)')}
          {num('cash_percentage', 'Reserva de caixa (%)')}
          {initial && <Field label="Situação"><select value={form.active ? '1' : '0'} onChange={e => set('active', e.target.value === '1')}><option value="1">À venda</option><option value="0">Fora do cardápio</option></select></Field>}
        </div>
      </div>
      <aside className="summary-card" aria-live="polite">
        <h3>Uma unidade</h3>
        <div className="preview-line"><span>Ingredientes</span><strong>{currency(recipeCost)}</strong></div>
        <div className="preview-line"><span>Embalagem e outros</span><strong>{currency(Number(form.packaging_cost || 0) + Number(form.other_cost || 0))}</strong></div>
        <div className="preview-line"><span>Taxas, comissões e reserva</span><strong>{currency(deductions)}</strong></div>
        <div className="preview-line total"><span>Sobra do preço de {currency(price)}</span><strong className={profit < 0 ? 'negative' : ''}>{currency(profit)}</strong></div>
        <div className={`profit-line ${profit < 0 ? 'bad' : ''}`}><span>Margem do proprietário</span><strong>{percent(margin)}</strong>{targetPrice && margin < 25 && <small>Para 25%, cobre {currency(targetPrice)}</small>}</div>
        {capacity && <p className="small muted" style={{ marginTop: 12 }}>Com o estoque de hoje dá para fazer <b>{capacity[0]} un.</b> ({capacity[1]} limita).</p>}
      </aside>
    </div>
  </Modal>;
}

export default function Products() {
  const [items, setItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('active');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => Promise.all([api('/products'), api('/ingredients')])
    .then(([products, rows]) => { setItems(products); setIngredients(rows); })
    .catch(err => setError(err.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);

  async function edit(item) {
    try { setEditing(await api(`/products/${item.id}`)); } catch (err) { setError(err.message); }
  }
  useEffect(() => {
    const id = Number(params.get('item'));
    if (id) { edit({ id }); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const filtered = useMemo(() => items.filter(item => (view === 'all' || (view === 'active' ? item.active : !item.active))
    && `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [items, view, search]);
  const active = items.filter(item => item.active);
  const avgMargin = active.length ? active.reduce((sum, item) => sum + item.margin, 0) / active.length : 0;
  const lowMargin = active.filter(item => item.margin < 10).length;
  const ready = active.reduce((sum, item) => sum + Math.max(0, item.available_stock), 0);

  async function deactivate() {
    await api(`/products/${removing.id}`, { method: 'DELETE' }); toast('Produto retirado do cardápio'); setRemoving(null); load();
  }

  return <div className="page">
    <PageHeader title="Produtos e receitas" description="A ficha técnica de cada produto: o que vai dentro, quanto custa e quanto sobra em cada venda."
      actions={<button type="button" className="btn primary" onClick={() => setEditing({})}><Plus />Novo produto</button>} />
    <ErrorNotice message={error} />
    <KpiStrip>
      <Kpi lead label="Margem média" value={percent(avgMargin)} note={`${active.length} produtos à venda`} />
      <Kpi label="Margem abaixo de 10%" value={number(lowMargin, 0)} note={lowMargin ? 'revise o preço ou a receita' : 'todos acima de 10%'} />
      <Kpi label="Prontos para vender" value={number(ready, 0)} unit="un." note="produzido menos vendido" />
    </KpiStrip>
    <section className="panel">
      <div className="panel-body" style={{ paddingBottom: 4 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar produto" />
          <Segmented label="Filtro" value={view} onChange={setView} options={[['active', 'À venda'], ['inactive', 'Fora do cardápio'], ['all', 'Todos']]} />
        </div>
      </div>
      {loading ? <Loading rows={5} /> : filtered.length ? <div className="table-wrap"><table className="responsive">
        <thead><tr><th>Produto</th><th className="num">Preço</th><th className="num">Custo</th><th className="num">Sobra</th><th className="num">Margem</th><th className="num">Prontos</th><th className="num">Dá para fazer</th><th /></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.id} className={`clickable ${item.active ? '' : 'dim'}`} tabIndex={0} onClick={() => edit(item)} onKeyDown={e => e.key === 'Enter' && edit(item)}>
          <td className="primary"><div className="cell-title"><span><strong>{item.name}</strong><small>{item.category}{item.active ? '' : ' · fora do cardápio'}</small></span></div></td>
          <td className="num lead">{currency(item.sale_price)}</td>
          <td className="num meta" data-label="Custo">{currency(item.unit_cost)}</td>
          <td className={`num meta ${item.unit_profit < 0 ? 'negative' : ''}`} data-label="Sobra">{currency(item.unit_profit)}</td>
          <td className="num status"><Pill tone={item.margin >= 20 ? 'positive' : item.margin >= 0 ? 'warning' : 'negative'}>{percent(item.margin)}</Pill></td>
          <td className="num meta" data-label="Prontos">{number(Math.max(0, item.available_stock), 0)} un.</td>
          <td className="num meta" data-label="Dá para fazer">{item.max_producible == null ? <span className="dash">sem receita</span> : <>{number(item.max_producible, 0)} un.<span className="sub">{item.bottleneck}</span></>}</td>
          <td className="actions"><Actions onEdit={() => edit(item)} onDelete={item.active ? () => setRemoving(item) : null} deleteLabel="Retirar do cardápio" /></td>
        </tr>)}</tbody>
      </table></div> : <Empty title={items.length ? 'Nenhum produto neste filtro' : 'Nenhum produto cadastrado'} text="Cadastre o primeiro produto com sua receita." />}
    </section>
    <ProductForm open={!!editing} initial={editing?.id ? editing : null} ingredients={ingredients} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    <Confirm open={!!removing} title={`Retirar ${removing?.name} do cardápio?`} confirmLabel="Retirar"
      text="O produto deixa de aparecer em novas vendas e lotes. O histórico continua intacto e você pode reativar depois."
      onCancel={() => setRemoving(null)} onConfirm={deactivate} />
  </div>;
}
