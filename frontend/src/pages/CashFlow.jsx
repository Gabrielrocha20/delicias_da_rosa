import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { currency, dateBR, inputDate, toIsoNoon } from '../lib/format';
import { Actions, Confirm, CountCards, Empty, ErrorNotice, Field, Kpi, KpiStrip, Loading, Modal, PageHeader, Pill, SearchBox, Segmented, toast } from '../components/UI';

const blank = () => ({ type: 'expense', category: 'Compra de insumos', description: '', amount: '', occurred_at: inputDate() });
const CATEGORIES = { expense: ['Compra de insumos', 'Embalagens', 'Aluguel', 'Energia e gás', 'Transporte', 'Equipamentos', 'Pagamento de equipe', 'Marketing', 'Outros'], income: ['Aporte', 'Venda avulsa', 'Reembolso', 'Outros'] };

export default function CashFlow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api('/cash-movements').then(result => { setData(result); setError(''); }).catch(err => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const form = editing?.data || blank();
  const set = (key, value) => setEditing(current => ({ ...current, data: { ...current.data, [key]: value } }));
  const open = item => { setFormError(''); setEditing(item ? { id: item.id, data: { ...item, amount: String(item.amount), occurred_at: inputDate(item.occurred_at) } } : { data: blank() }); };
  const movements = data?.movements || [];
  const filtered = useMemo(() => movements.filter(row => (filter === 'all' || row.type === filter)
    && `${row.category} ${row.description}`.toLowerCase().includes(search.toLowerCase())), [movements, filter, search]);

  async function save(event) {
    event.preventDefault(); setSaving(true); setFormError('');
    try {
      await api(editing.id ? `/cash-movements/${editing.id}` : '/cash-movements', { method: editing.id ? 'PUT' : 'POST', body: { ...form, amount: Number(form.amount), occurred_at: toIsoNoon(form.occurred_at) } });
      toast('Lançamento salvo'); setEditing(null); load();
    } catch (err) { setFormError(err.message); } finally { setSaving(false); }
  }
  async function remove() {
    try { await api(`/cash-movements/${removing.id}`, { method: 'DELETE' }); toast('Lançamento excluído'); setRemoving(null); load(); }
    catch (err) { setError(err.message); }
  }

  return <div className="page">
    <PageHeader title="Entradas e saídas" description="Saldo = vendas pagas + outras entradas − saídas. Compras de insumos registradas em Insumos entram aqui sozinhas."
      actions={<button type="button" className="btn primary" onClick={() => open()}><Plus />Novo lançamento</button>} />
    <ErrorNotice message={error} />
    {loading && !data ? <section className="panel"><Loading /></section> : <>
      <KpiStrip>
        <Kpi lead label="Saldo em caixa" value={<span className={data.balance < 0 ? 'negative' : ''}>{currency(data.balance)}</span>} note="vendas pagas e lançamentos manuais" />
        <Kpi label="Vendas pagas" value={currency(data.sales_income)} note="vendas pendentes não entram" />
        <Kpi label="Outras entradas" value={currency(data.manual_income)} />
        <Kpi label="Saídas" value={currency(data.expenses)} />
      </KpiStrip>
      <section className="panel">
        <div className="panel-body" style={{ paddingBottom: 4 }}>
          <CountCards value={filter} onChange={setFilter} items={[
            { key: 'all', label: 'Todos', count: movements.length },
            { key: 'expense', label: 'Saídas', count: movements.filter(row => row.type === 'expense').length },
            { key: 'income', label: 'Entradas', count: movements.filter(row => row.type === 'income').length },
          ]} />
          <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}><SearchBox value={search} onChange={setSearch} placeholder="Buscar categoria ou descrição" /></div>
        </div>
        {filtered.length ? <div className="table-wrap"><table className="responsive">
          <thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th className="num">Valor</th><th /></tr></thead>
          <tbody>{filtered.map(item => <tr key={item.id}>
            <td className="primary"><strong>{item.description || item.category}</strong><span className="sub">{item.type === 'income' ? 'Entrada' : 'Saída'}</span></td>
            <td className="meta plain"><Pill>{item.category}</Pill></td>
            <td className="meta plain">{dateBR(item.occurred_at)}</td>
            <td className={`num lead ${item.type === 'income' ? 'positive' : ''}`}>{item.type === 'income' ? '+' : '−'}{currency(item.amount)}</td>
            <td className="actions"><Actions onEdit={() => open(item)} onDelete={() => setRemoving(item)} /></td>
          </tr>)}</tbody>
        </table></div> : <Empty title="Nenhum lançamento" text="Registre aluguel, gás, embalagens e outras despesas para o saldo ficar real." />}
      </section>
    </>}
    <Modal open={!!editing} onClose={() => setEditing(null)} onSubmit={save} title={editing?.id ? 'Editar lançamento' : 'Novo lançamento'}
      footer={<><button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
      <ErrorNotice message={formError} />
      <Segmented label="Tipo" value={form.type} onChange={type => setEditing(current => ({ ...current, data: { ...current.data, type, category: CATEGORIES[type][0] } }))} options={[['expense', 'Saída'], ['income', 'Entrada']]} />
      <div className="form-grid" style={{ marginTop: 16 }}>
        <Field label="Valor"><div className="input-affix"><b>R$</b><input type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required aria-label="Valor" autoFocus /></div></Field>
        <Field label="Data"><input type="date" value={form.occurred_at} onChange={e => set('occurred_at', e.target.value)} required /></Field>
        <Field label="Categoria"><input list="cash-categories" value={form.category} onChange={e => set('category', e.target.value)} required /><datalist id="cash-categories">{CATEGORIES[form.type].map(name => <option key={name} value={name} />)}</datalist></Field>
        <Field label="Descrição"><input maxLength="255" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex.: conta de gás de outubro" /></Field>
      </div>
    </Modal>
    <Confirm open={!!removing} title="Excluir lançamento?" confirmLabel="Excluir" text="O saldo é recalculado sem este lançamento." onCancel={() => setRemoving(null)} onConfirm={remove} />
  </div>;
}
