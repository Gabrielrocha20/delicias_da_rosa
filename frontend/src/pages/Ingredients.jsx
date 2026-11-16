import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, History, PackagePlus, Pencil, Scale, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { currency, dateBR, dateTime, inputDate, number, purchaseUnits, quantity, relativeDays, toIsoNoon, unitCost } from '../lib/format';
import { Confirm, CountCards, Drawer, Empty, ErrorNotice, Field, Kpi, KpiStrip, Loading, Meter, Modal, Notice, PageHeader, Pill, RowMenu, SearchBox, Segmented, toast } from '../components/UI';

const USAGE_UNITS = [['g', 'gramas (g)'], ['ml', 'mililitros (ml)'], ['un', 'unidades (un)'], ['kg', 'quilos (kg)'], ['l', 'litros (l)'], ['pacote', 'pacotes']];
const DEFAULT_CATEGORIES = ['Laticínios', 'Chocolates', 'Farinhas e açúcares', 'Frutas', 'Recheios', 'Embalagens', 'Descartáveis', 'Outros'];
const STATUS = {
  out: ['Em falta', 'negative'],
  low: ['Repor', 'warning'],
  ok: ['Em dia', 'positive'],
};

const blank = () => ({ name: '', category: 'Laticínios', brand: '', supplier: '', unit: 'g', buy_qty: '', buy_unit: 'g', purchase_price: '', stock: '0', min_stock: '0', notes: '' });

function bestBuyUnit(unit, amount) {
  const options = purchaseUnits[unit] || [[unit, 1]];
  const [name, factor] = [...options].reverse().find(([, f]) => amount >= f && amount % f === 0) || options[0];
  return { buy_unit: name, buy_qty: String(amount / factor) };
}

function factorOf(unit, buyUnit) {
  return (purchaseUnits[unit] || []).find(([name]) => name === buyUnit)?.[1] || 1;
}

function coverageText(item) {
  if (item.coverage_days == null) return null;
  if (item.coverage_days >= 90) return '90+ dias';
  return `${number(Math.floor(item.coverage_days), 0)} dias`;
}

/* ---------------------------------------------------------------- Ficha do insumo */
function IngredientForm({ open, initial, categories, onClose, onSaved }) {
  const [form, setForm] = useState(blank());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError('');
    if (initial) {
      setForm({
        ...blank(), ...initial,
        ...bestBuyUnit(initial.unit, initial.purchase_quantity),
        purchase_price: String(initial.purchase_price), stock: String(initial.stock), min_stock: String(initial.min_stock),
      });
    } else setForm(blank());
  }, [open, initial]);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const changeUnit = unit => setForm(current => ({ ...current, unit, buy_unit: (purchaseUnits[unit] || [[unit]])[0][0] }));
  const purchaseQuantity = Number(form.buy_qty || 0) * factorOf(form.unit, form.buy_unit);
  const cost = purchaseQuantity ? Number(form.purchase_price || 0) / purchaseQuantity : 0;
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])];

  async function submit(event) {
    event.preventDefault();
    if (!purchaseQuantity) { setError('Informe a quantidade que vem na compra.'); return; }
    setSaving(true); setError('');
    const body = {
      name: form.name.trim(), category: form.category.trim() || 'Outros', brand: form.brand, supplier: form.supplier,
      unit: form.unit, purchase_quantity: purchaseQuantity, purchase_price: Number(form.purchase_price),
      stock: Number(form.stock || 0), min_stock: Number(form.min_stock || 0), notes: form.notes,
    };
    try {
      const saved = await api(initial ? `/ingredients/${initial.id}` : '/ingredients', { method: initial ? 'PUT' : 'POST', body });
      toast(initial ? 'Insumo atualizado' : 'Insumo cadastrado');
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return <Modal open={open} onClose={onClose} onSubmit={submit} wide
    title={initial ? `Editar ${initial.name}` : 'Novo insumo'}
    subtitle="Tudo que entra nas receitas: ingredientes, embalagens e descartáveis."
    footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar insumo'}</button></>}>
    <ErrorNotice message={error} />
    <div className="editor">
      <div>
        <section className="form-section">
          <h3>Identificação</h3>
          <p>Como o insumo aparece nas receitas e na lista de compras.</p>
          <div className="form-grid">
            <Field label="Nome" span><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex.: Leite condensado" required autoFocus /></Field>
            <Field label="Categoria"><input list="ingredient-categories" value={form.category} onChange={e => set('category', e.target.value)} required /><datalist id="ingredient-categories">{allCategories.map(name => <option key={name} value={name} />)}</datalist></Field>
            <Field label="Marca" hint="Opcional"><input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Ex.: Moça" /></Field>
            <Field label="Fornecedor" hint="Onde costuma comprar" span><input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Ex.: Atacadão Centro" /></Field>
          </div>
        </section>
        <section className="form-section">
          <h3>Compra e custo</h3>
          <p>Diga como você compra. O sistema converte para a unidade usada na receita.</p>
          <div className="form-grid three">
            <Field label="Unidade usada na receita"><select value={form.unit} onChange={e => changeUnit(e.target.value)}>{USAGE_UNITS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
            <Field label="Quantidade da compra">
              <div className="input-group">
                <input type="number" inputMode="decimal" step="any" min="0" value={form.buy_qty} onChange={e => set('buy_qty', e.target.value)} placeholder="395" required aria-label="Quantidade da compra" />
                <select value={form.buy_unit} onChange={e => set('buy_unit', e.target.value)} aria-label="Unidade da compra">{(purchaseUnits[form.unit] || [[form.unit]]).map(([name]) => <option key={name}>{name}</option>)}</select>
              </div>
            </Field>
            <Field label="Preço pago"><div className="input-affix"><b>R$</b><input type="number" inputMode="decimal" step="0.01" min="0" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="6,49" required aria-label="Preço pago" /></div></Field>
          </div>
        </section>
        <section className="form-section">
          <h3>Estoque</h3>
          <p>Abaixo do mínimo, o insumo entra na lista de compras do assistente.</p>
          <div className="form-grid">
            <Field label={`Estoque atual (${form.unit})`} hint={initial ? 'Para registrar compra ou perda, use os botões da lista: fica no histórico.' : quantity(form.stock, form.unit)}>
              <input type="number" inputMode="decimal" step="any" min="0" value={form.stock} onChange={e => set('stock', e.target.value)} />
            </Field>
            <Field label={`Estoque mínimo (${form.unit})`} hint={Number(form.min_stock) ? `= ${quantity(form.min_stock, form.unit)}` : 'Sugestão: o consumo de uma semana'}>
              <input type="number" inputMode="decimal" step="any" min="0" value={form.min_stock} onChange={e => set('min_stock', e.target.value)} />
            </Field>
            <Field label="Observações" span><textarea rows="2" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ex.: guardar refrigerado depois de aberto" /></Field>
          </div>
        </section>
      </div>
      <aside className="summary-card" aria-live="polite">
        <h3>Custo calculado</h3>
        <div className="preview-line"><span>Compra</span><strong>{purchaseQuantity ? `${quantity(purchaseQuantity, form.unit)} por ${currency(form.purchase_price)}` : '—'}</strong></div>
        <div className="profit-line">
          <span>Custo por {form.unit}</span>
          <strong>{cost ? unitCost(cost) : '—'}</strong>
          {cost > 0 && form.unit === 'g' && <small>{currency(cost * 100)} a cada 100 g · {currency(cost * 1000)} o quilo</small>}
          {cost > 0 && form.unit === 'ml' && <small>{currency(cost * 100)} a cada 100 ml · {currency(cost * 1000)} o litro</small>}
          {cost > 0 && form.unit === 'un' && <small>{currency(cost * 12)} a dúzia</small>}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Quando o preço mudar, registre uma compra: o custo de todas as receitas que usam este insumo é atualizado.</p>
      </aside>
    </div>
  </Modal>;
}

/* ---------------------------------------------------------------- Entrada de compra */
function PurchaseModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!item) return;
    setError('');
    setForm({
      ...bestBuyUnit(item.unit, item.purchase_quantity), packs: '1',
      total_price: String(item.purchase_price), supplier: item.supplier || '', note: '',
      occurred_at: inputDate(), update_cost: true, register_expense: true,
    });
  }, [item]);
  if (!item || !form) return null;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const amount = Number(form.buy_qty || 0) * factorOf(item.unit, form.buy_unit) * Number(form.packs || 0);
  const total = Number(form.total_price || 0) * Number(form.packs || 0);
  const newCost = amount ? total / amount : 0;
  const change = item.unit_cost ? (newCost / item.unit_cost - 1) * 100 : 0;

  async function submit(event) {
    event.preventDefault();
    if (!amount) { setError('Informe a quantidade comprada.'); return; }
    setSaving(true); setError('');
    try {
      const saved = await api(`/ingredients/${item.id}/purchase`, { method: 'POST', body: {
        quantity: amount, total_price: total, supplier: form.supplier, note: form.note,
        occurred_at: toIsoNoon(form.occurred_at), update_cost: form.update_cost, register_expense: form.register_expense,
      } });
      toast(`Entrada de ${quantity(amount, item.unit)} registrada`);
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return <Modal open onClose={onClose} onSubmit={submit} title={`Entrada de ${item.name}`} subtitle={`Estoque atual: ${quantity(item.stock, item.unit)}`}
    footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? 'Registrando…' : 'Registrar entrada'}</button></>}>
    <ErrorNotice message={error} />
    <div className="form-grid">
      <Field label="Embalagem">
        <div className="input-group">
          <input type="number" inputMode="decimal" step="any" min="0" value={form.buy_qty} onChange={e => set('buy_qty', e.target.value)} aria-label="Conteúdo da embalagem" required />
          <select value={form.buy_unit} onChange={e => set('buy_unit', e.target.value)} aria-label="Unidade">{(purchaseUnits[item.unit] || [[item.unit]]).map(([name]) => <option key={name}>{name}</option>)}</select>
        </div>
      </Field>
      <Field label="Quantas embalagens"><input type="number" inputMode="numeric" min="1" step="1" value={form.packs} onChange={e => set('packs', e.target.value)} required /></Field>
      <Field label="Preço de cada embalagem"><div className="input-affix"><b>R$</b><input type="number" inputMode="decimal" step="0.01" min="0" value={form.total_price} onChange={e => set('total_price', e.target.value)} required aria-label="Preço de cada embalagem" /></div></Field>
      <Field label="Data da compra"><input type="date" value={form.occurred_at} onChange={e => set('occurred_at', e.target.value)} required /></Field>
      <Field label="Fornecedor" span><input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Onde comprou" /></Field>
      <Field label="Observação" span><input value={form.note} onChange={e => set('note', e.target.value)} placeholder="Ex.: nota 1234, promoção" maxLength={255} /></Field>
    </div>
    <div className="preview-box" aria-live="polite">
      <div className="preview-line"><span>Entra no estoque</span><strong>+{quantity(amount, item.unit)}</strong></div>
      <div className="preview-line"><span>Estoque depois</span><strong>{quantity(item.stock + amount, item.unit)}</strong></div>
      <div className="preview-line"><span>Custo por {item.unit}</span><strong>{unitCost(newCost)} {item.unit_cost > 0 && Math.abs(change) >= 0.5 && <span className={change > 0 ? 'negative' : 'positive'}>({change > 0 ? '+' : ''}{number(change)}% vs anterior)</span>}</strong></div>
      <div className="preview-line total"><span>Total da compra</span><strong>{currency(total)}</strong></div>
    </div>
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <label className="check"><input type="checkbox" checked={form.update_cost} onChange={e => set('update_cost', e.target.checked)} /><span>Atualizar o custo das receitas<small>Usa o preço desta compra como custo atual do insumo.</small></span></label>
      <label className="check"><input type="checkbox" checked={form.register_expense} onChange={e => set('register_expense', e.target.checked)} /><span>Lançar saída no caixa<small>Cria uma saída de {currency(total)} em “Compra de insumos”.</small></span></label>
    </div>
  </Modal>;
}

/* ---------------------------------------------------------------- Contagem / perda */
function AdjustModal({ item, onClose, onSaved }) {
  const [mode, setMode] = useState('adjustment');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (item) { setMode('adjustment'); setValue(String(item.stock)); setNote(''); setError(''); } }, [item]);
  if (!item) return null;
  const after = mode === 'adjustment' ? Number(value || 0) : item.stock - Number(value || 0);
  const delta = after - item.stock;

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const body = mode === 'adjustment' ? { type: mode, counted_stock: Number(value), note } : { type: mode, quantity: Number(value), note };
      const saved = await api(`/ingredients/${item.id}/adjust`, { method: 'POST', body });
      toast(mode === 'adjustment' ? 'Contagem registrada' : 'Perda registrada');
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return <Modal open onClose={onClose} onSubmit={submit} title={`Corrigir estoque de ${item.name}`} subtitle={`No sistema: ${quantity(item.stock, item.unit)}`}
    footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={saving || !delta}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
    <ErrorNotice message={error} />
    <Segmented label="Tipo de correção" value={mode} onChange={next => { setMode(next); setValue(next === 'adjustment' ? String(item.stock) : ''); }}
      options={[['adjustment', 'Contei o estoque'], ['loss', 'Perdi ou estragou']]} />
    <div className="form-grid" style={{ marginTop: 16 }}>
      <Field label={mode === 'adjustment' ? `Quanto tem na prateleira (${item.unit})` : `Quanto foi perdido (${item.unit})`}>
        <input type="number" inputMode="decimal" step="any" min="0" value={value} onChange={e => setValue(e.target.value)} required autoFocus />
      </Field>
      <Field label="Motivo"><input value={note} onChange={e => setNote(e.target.value)} placeholder={mode === 'adjustment' ? 'Contagem semanal' : 'Venceu, caiu, queimou…'} maxLength={255} /></Field>
    </div>
    <div className="preview-box">
      <div className="preview-line"><span>Diferença</span><strong className={delta < 0 ? 'negative' : ''}>{delta > 0 ? '+' : ''}{quantity(delta, item.unit)} · {currency(Math.abs(delta) * item.unit_cost)}</strong></div>
      <div className="preview-line total"><span>Estoque depois</span><strong>{quantity(Math.max(after, 0), item.unit)}</strong></div>
    </div>
  </Modal>;
}

/* ---------------------------------------------------------------- Detalhe com histórico */
function IngredientDetail({ item, onClose, onBuy, onAdjust, onEdit }) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    if (!item) return;
    setHistory(null);
    api(`/ingredients/${item.id}/movements`).then(setHistory).catch(() => setHistory([]));
  }, [item]);
  if (!item) return null;
  const [label, tone] = STATUS[item.status];
  return <Drawer open onClose={onClose} title={item.name} subtitle={[item.category, item.brand, item.supplier].filter(Boolean).join(' · ')}
    footer={<><button type="button" className="btn left" onClick={onEdit}><Pencil />Editar ficha</button><button type="button" className="btn" onClick={onAdjust}><Scale />Corrigir</button><button type="button" className="btn primary" onClick={onBuy}><ShoppingCart />Entrada</button></>}>
    <div className="detail-figures">
      <div><span>Estoque</span><strong>{quantity(item.stock, item.unit)}</strong></div>
      <div><span>Dura</span><strong>{coverageText(item) || '—'}</strong></div>
      <div><span>Custo por {item.unit}</span><strong>{unitCost(item.unit_cost)}</strong></div>
    </div>
    {item.suggestion && <Notice tone="warn">Sugestão: comprar {item.suggestion.packs} × {quantity(item.purchase_quantity, item.unit)} ({currency(item.suggestion.estimated_cost)}) para duas semanas{item.planned_need ? ' e os lotes agendados' : ''}.</Notice>}
    <div className="kv">
      <div><span>Situação</span><Pill tone={tone} dot>{label}</Pill></div>
      <div><span>Estoque mínimo</span><strong>{quantity(item.min_stock, item.unit)}</strong></div>
      <div><span>Consumo médio</span><strong>{item.daily_usage ? `${quantity(item.daily_usage, item.unit)} por dia` : 'Sem consumo nos últimos 30 dias'}</strong></div>
      <div><span>Lotes agendados precisam</span><strong>{item.planned_need ? quantity(item.planned_need, item.unit) : '—'}</strong></div>
      <div><span>Valor em estoque</span><strong>{currency(item.stock_value)}</strong></div>
      <div><span>Compra padrão</span><strong>{quantity(item.purchase_quantity, item.unit)} por {currency(item.purchase_price)}</strong></div>
      <div><span>Usado em</span><strong>{item.products_using ? `${item.products_using} ${item.products_using === 1 ? 'produto' : 'produtos'}` : 'Nenhuma receita'}</strong></div>
      <div><span>Última compra</span><strong>{item.last_purchase_at ? `${dateBR(item.last_purchase_at)} (${relativeDays(item.last_purchase_at)})` : '—'}</strong></div>
      {item.notes && <div><span>Observações</span><strong>{item.notes}</strong></div>}
    </div>
    <section className="history">
      <h3>Histórico do estoque</h3>
      {history === null ? <Loading rows={3} /> : history.length ? history.map(row => <div className="history-row" key={row.id}>
        <strong>{row.type_label}</strong>
        <span className={`qty ${row.quantity < 0 ? 'negative' : 'positive'}`}>{row.quantity > 0 ? '+' : ''}{quantity(row.quantity, item.unit)}</span>
        <small>{[row.batch_label, row.supplier, row.note, row.total_cost ? currency(row.total_cost) : null, row.created_by_name].filter(Boolean).join(' · ') || '—'}</small>
        <small>{dateTime(row.occurred_at)} · ficou {quantity(row.stock_after, item.unit)}</small>
      </div>) : <Empty title="Sem movimentações ainda" text="Compras, contagens, perdas e consumo da produção aparecem aqui." />}
    </section>
  </Drawer>;
}

/* ---------------------------------------------------------------- Página */
export default function Ingredients() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState(null);
  const [buying, setBuying] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => Promise.all([api('/ingredients'), api('/ingredients/categories')])
    .then(([rows, names]) => { setItems(rows); setCategories(names); setError(''); })
    .catch(err => setError(err.message))
    .finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = Number(params.get('item'));
    if (id) setDetailId(id);
    if (params.get('sem_minimo')) setFilter('nomin');
  }, [params]);

  const detail = items.find(item => item.id === detailId) || null;
  const closeDetail = () => { setDetailId(null); if (params.get('item')) setParams({}, { replace: true }); };
  const replace = saved => setItems(current => current.map(row => (row.id === saved.id ? saved : row)));

  const counts = useMemo(() => ({
    all: items.length,
    low: items.filter(item => item.status === 'low').length,
    out: items.filter(item => item.status === 'out').length,
    ok: items.filter(item => item.status === 'ok').length,
    nomin: items.filter(item => !(item.min_stock > 0)).length,
  }), [items]);
  const filtered = useMemo(() => items.filter(item => (filter === 'all' || (filter === 'nomin' ? !(item.min_stock > 0) : item.status === filter))
    && (!category || item.category === category)
    && `${item.name} ${item.category} ${item.supplier} ${item.brand}`.toLowerCase().includes(search.toLowerCase())), [items, filter, category, search]);
  const stockValue = items.reduce((sum, item) => sum + item.stock_value, 0);
  const shoppingCost = items.reduce((sum, item) => sum + (item.suggestion?.estimated_cost || 0), 0);
  const dailyCost = items.reduce((sum, item) => sum + item.daily_usage * item.unit_cost, 0);

  async function remove() {
    try { await api(`/ingredients/${removing.id}`, { method: 'DELETE' }); toast('Insumo excluído'); setRemoving(null); load(); }
    catch (err) { setRemoving(null); setError(err.message); }
  }

  return <div className="page">
    <PageHeader title="Insumos" description="Estoque, custo e consumo de tudo que entra nos bolos. Registre cada compra para o custo das receitas ficar sempre certo."
      actions={<><Link className="btn" to="/assistente#compras"><ClipboardList />Lista de compras</Link><button type="button" className="btn primary" onClick={() => setForm({})}><PackagePlus />Novo insumo</button></>} />
    <ErrorNotice message={error} />
    <KpiStrip>
      <Kpi lead label="Valor parado em estoque" value={currency(stockValue)} note={`${items.length} insumos cadastrados`} />
      <Kpi label="Compra sugerida" value={currency(shoppingCost)} note={shoppingCost ? 'para duas semanas e lotes agendados' : 'nada para comprar agora'} />
      <Kpi label="Consumo médio" value={currency(dailyCost)} unit="/dia" note="média dos lotes dos últimos 30 dias" />
    </KpiStrip>

    <section className="panel">
      <div className="panel-body" style={{ paddingBottom: 0 }}>
        <CountCards value={filter} onChange={setFilter} items={[
          { key: 'all', label: 'Todos', count: counts.all },
          { key: 'out', label: 'Em falta', count: counts.out, alert: true },
          { key: 'low', label: 'Repor', count: counts.low },
          { key: 'ok', label: 'Em dia', count: counts.ok },
          ...(counts.nomin ? [{ key: 'nomin', label: 'Sem mínimo', count: counts.nomin, alert: true }] : []),
        ]} />
        {filter === 'nomin' && counts.nomin > 0 && <div style={{ marginTop: 12 }}><Notice tone="warn">Sem estoque mínimo o assistente só avisa quando o insumo acaba. Abra cada um em “Editar ficha” e defina o mínimo (uma boa regra é o consumo de uma semana).</Notice></div>}
        <div className="toolbar" style={{ marginTop: 16, marginBottom: 4 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar insumo, marca ou fornecedor" />
          <select className="select-sm" value={category} onChange={e => setCategory(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>{categories.map(name => <option key={name}>{name}</option>)}
          </select>
          <span className="spacer" />
          <span className="small muted">{filtered.length} de {items.length}</span>
        </div>
      </div>
      {loading ? <Loading rows={6} /> : filtered.length ? <div className="table-wrap"><table className="responsive">
        <thead><tr><th>Insumo</th><th className="num">Estoque</th><th className="num">Dura</th><th className="num">Custo</th><th className="num">Em estoque</th><th>Situação</th><th /></tr></thead>
        <tbody>{filtered.map(item => {
          const [label, tone] = STATUS[item.status];
          return <tr key={item.id} className="clickable" tabIndex={0} onClick={() => setDetailId(item.id)} onKeyDown={e => e.key === 'Enter' && setDetailId(item.id)}>
            <td className="primary"><div className="cell-title"><span><strong>{item.name}</strong><small>{[item.category, item.supplier].filter(Boolean).join(' · ')}</small></span></div></td>
            <td className="num lead"><div className="stock-cell">{item.min_stock > 0 ? <Meter value={item.stock} max={Math.max(item.min_stock * 2, item.stock, 1)} tick={item.min_stock} tone={item.status !== 'ok' ? 'low' : 'accent'} /> : <span className="small muted">sem mínimo</span>}<span>{quantity(item.stock, item.unit)}</span></div></td>
            <td className="num meta" data-label="Dura">{coverageText(item) || <span className="dash">—</span>}</td>
            <td className="num meta" data-label="Custo">{unitCost(item.unit_cost)}<span className="muted">/{item.unit}</span></td>
            <td className="num meta hide-sm" data-label="Em estoque">{currency(item.stock_value)}</td>
            <td className="status"><Pill tone={tone} dot>{label}</Pill></td>
            <td className="actions"><div className="row-actions">
              <button type="button" className="btn small" onClick={e => { e.stopPropagation(); setBuying(item); }}><ShoppingCart />Entrada</button>
              <RowMenu items={[
                { label: 'Ver histórico', icon: History, onClick: () => setDetailId(item.id) },
                { label: 'Contagem ou perda', icon: Scale, onClick: () => setAdjusting(item) },
                { label: 'Editar ficha', icon: Pencil, onClick: () => setForm(item) },
                { label: 'Excluir', icon: Trash2, danger: true, onClick: () => setRemoving(item) },
              ]} />
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty title={items.length ? 'Nenhum insumo encontrado' : 'Nenhum insumo cadastrado'}
        text={items.length ? 'Ajuste a busca ou os filtros.' : 'Cadastre os ingredientes e embalagens para calcular o custo das receitas.'}
        action={!items.length && <button type="button" className="btn primary" onClick={() => setForm({})}><PackagePlus />Cadastrar o primeiro</button>} />}
    </section>

    <IngredientForm open={!!form} initial={form?.id ? form : null} categories={categories} onClose={() => setForm(null)}
      onSaved={() => { setForm(null); load(); }} />
    <PurchaseModal item={buying} onClose={() => setBuying(null)} onSaved={saved => { setBuying(null); replace(saved); load(); }} />
    <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onSaved={saved => { setAdjusting(null); replace(saved); load(); }} />
    <IngredientDetail item={detail} onClose={closeDetail}
      onBuy={() => setBuying(detail)} onAdjust={() => setAdjusting(detail)} onEdit={() => { setForm(detail); }} />
    <Confirm open={!!removing} title={`Excluir ${removing?.name}?`} confirmLabel="Excluir insumo"
      text="O insumo e seu histórico de estoque serão apagados. Insumos usados em receitas ou já consumidos na produção ficam protegidos."
      onCancel={() => setRemoving(null)} onConfirm={remove} />
  </div>;
}
