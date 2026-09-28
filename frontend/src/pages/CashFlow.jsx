import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Plus, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { currency, dateBR, inputDate } from '../lib/format';
import { Actions, Badge, Confirm, Empty, ErrorNotice, Field, Loading, Modal, PageHeader } from '../components/UI';

const blank = () => ({ type: 'expense', category: 'Compra', description: '', amount: '', occurred_at: inputDate() });
const categories = ['Compra', 'Pagamento', 'Aluguel', 'Transporte', 'Equipamentos', 'Outros'];

export default function CashFlow() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [editing, setEditing] = useState(null), [remove, setRemove] = useState(null);
  async function load() {
    setLoading(true);
    try { setData(await api('/cash-movements')); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const form = editing?.data || blank();
  const change = (key, value) => setEditing(current => ({ ...current, data: { ...current.data, [key]: value } }));
  function open(item) {
    setEditing(item ? { id: item.id, data: { ...item, amount: String(item.amount), occurred_at: inputDate(item.occurred_at) } } : { data: blank() });
  }
  async function save(event) {
    event.preventDefault(); setError('');
    try {
      await api(editing.id ? `/cash-movements/${editing.id}` : '/cash-movements', {
        method: editing.id ? 'PUT' : 'POST',
        body: { ...form, amount: Number(form.amount), occurred_at: new Date(`${form.occurred_at}T12:00:00`).toISOString() },
      });
      setEditing(null); await load();
    } catch (err) { setError(err.message); }
  }
  async function del() {
    try { await api(`/cash-movements/${remove.id}`, { method: 'DELETE' }); setRemove(null); await load(); }
    catch (err) { setError(err.message); }
  }

  return <div className="page">
    <PageHeader eyebrow="Controle financeiro" title="Entradas e saídas" description="Acompanhe o saldo com base nas vendas pagas e nos lançamentos do caixa." action={<button className="btn primary" onClick={() => open()}><Plus size={18}/> Novo lançamento</button>} />
    <ErrorNotice message={error}/>
    {loading && !data ? <Loading/> : <>
      <section className="summary-strip cash-summary">
        <div><Wallet size={20}/><span>Saldo atual<strong>{currency(data?.balance)}</strong></span></div>
        <div><ArrowUpRight size={20}/><span>Vendas pagas<strong>{currency(data?.sales_income)}</strong></span></div>
        <div><Plus size={20}/><span>Outras entradas<strong>{currency(data?.manual_income)}</strong></span></div>
        <div><ArrowDownRight size={20}/><span>Saídas<strong>{currency(data?.expenses)}</strong></span></div>
      </section>
      <section className="panel table-panel"><div className="table-toolbar"><div><span className="panel-kicker">Movimentações manuais</span><h2>Lançamentos do caixa</h2></div><span>{data?.movements?.length || 0} lançamentos</span></div>
        {data?.movements?.length ? <div className="table-scroll"><table><thead><tr><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Data</th><th>Valor</th><th></th></tr></thead><tbody>{data.movements.map(item=><tr key={item.id}><td><Badge tone={item.type==='income'?'positive':'warning'}>{item.type==='income'?'Entrada':'Saída'}</Badge></td><td>{item.category}</td><td>{item.description||'—'}</td><td>{dateBR(item.occurred_at)}</td><td className={item.type==='income'?'positive-text':'negative-text'}>{item.type==='income'?'+':'−'} {currency(item.amount)}</td><td><Actions onEdit={()=>open(item)} onDelete={()=>setRemove(item)}/></td></tr>)}</tbody></table></div> : <Empty title="Nenhum lançamento manual" text="Adicione compras, pagamentos e outras entradas para atualizar o saldo."/>}
      </section>
    </>}
    <Modal open={!!editing} title={editing?.id?'Editar lançamento':'Novo lançamento'} subtitle="Vendas pagas já entram automaticamente no saldo." onClose={()=>setEditing(null)}>
      <form onSubmit={save}><div className="form-grid">
        <Field label="Tipo"><select value={form.type} onChange={e=>change('type',e.target.value)}><option value="expense">Saída</option><option value="income">Entrada</option></select></Field>
        <Field label="Categoria"><select value={form.category} onChange={e=>change('category',e.target.value)}>{categories.map(category=><option key={category}>{category}</option>)}</select></Field>
        <Field label="Valor (R$)"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>change('amount',e.target.value)} required/></Field>
        <Field label="Data"><input type="date" value={form.occurred_at} onChange={e=>change('occurred_at',e.target.value)} required/></Field>
        <Field label="Descrição" span><input maxLength="255" value={form.description} onChange={e=>change('description',e.target.value)} placeholder="Ex.: compra de embalagens"/></Field>
      </div><div className="modal-actions"><button type="button" className="btn ghost" onClick={()=>setEditing(null)}>Cancelar</button><button className="btn primary">Salvar lançamento</button></div></form>
    </Modal>
    <Confirm open={!!remove} title="Excluir lançamento?" text="O saldo será recalculado depois da exclusão." onCancel={()=>setRemove(null)} onConfirm={del}/>
  </div>;
}
