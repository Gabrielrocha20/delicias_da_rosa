import { useEffect, useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { percent } from '../lib/format';
import { Actions, Avatar, Confirm, CountCards, Empty, ErrorNotice, Field, Loading, Modal, PageHeader, Pill, SearchBox, toast } from '../components/UI';

const blank = { name: '', type: 'seller', phone: '', email: '', commission: 8, active: true };

export default function People() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const load = () => api('/people').then(setItems).catch(err => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => items.filter(row => (filter === 'all' || row.type === filter) && `${row.name} ${row.email} ${row.phone}`.toLowerCase().includes(search.toLowerCase())), [items, filter, search]);
  const form = editing?.data || blank;
  const set = (key, value) => setEditing(current => ({ ...current, data: { ...current.data, [key]: value } }));

  async function save(event) {
    event.preventDefault(); setFormError('');
    try { await api(editing.id ? `/people/${editing.id}` : '/people', { method: editing.id ? 'PUT' : 'POST', body: editing.data }); toast('Pessoa salva'); setEditing(null); load(); }
    catch (err) { setFormError(err.message); }
  }
  async function deactivate() { await api(`/people/${removing.id}`, { method: 'DELETE' }); toast('Pessoa desativada'); setRemoving(null); load(); }

  return <div className="page">
    <PageHeader title="Equipe" description="Vendedores e produtores. Para a pessoa entrar no sistema, crie um login em Acessos."
      actions={<button type="button" className="btn primary" onClick={() => { setFormError(''); setEditing({ data: { ...blank } }); }}><UserPlus />Nova pessoa</button>} />
    <ErrorNotice message={error} />
    <section className="panel">
      <div className="panel-body" style={{ paddingBottom: 4 }}>
        <CountCards value={filter} onChange={setFilter} items={[
          { key: 'all', label: 'Todos', count: items.length },
          { key: 'seller', label: 'Vendedores', count: items.filter(row => row.type === 'seller' && row.active).length },
          { key: 'producer', label: 'Produtores', count: items.filter(row => row.type === 'producer' && row.active).length },
        ]} />
        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}><SearchBox value={search} onChange={setSearch} placeholder="Buscar nome, e-mail ou telefone" /></div>
      </div>
      {loading ? <Loading /> : filtered.length ? <div className="table-wrap"><table className="responsive">
        <thead><tr><th>Nome</th><th>Função</th><th>Telefone</th><th className="num">Comissão padrão</th><th>Situação</th><th /></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.id} className={item.active ? '' : 'dim'}>
          <td className="primary"><div className="cell-title"><Avatar name={item.name} id={item.id} /><span><strong>{item.name}</strong><small>{item.email || 'Sem e-mail'}</small></span></div></td>
          <td className="meta plain">{item.type === 'seller' ? 'Vendedor' : 'Produtor'}</td>
          <td className="meta" data-label="Telefone">{item.phone || <span className="dash">—</span>}</td>
          <td className="num lead">{percent(item.commission)}</td>
          <td className="status"><Pill tone={item.active ? 'positive' : 'neutral'}>{item.active ? 'Ativo' : 'Inativo'}</Pill></td>
          <td className="actions"><Actions onEdit={() => { setFormError(''); setEditing({ id: item.id, data: { ...item } }); }} onDelete={item.active ? () => setRemoving(item) : null} deleteLabel="Desativar" /></td>
        </tr>)}</tbody>
      </table></div> : <Empty title="Ninguém encontrado" />}
    </section>
    <Modal open={!!editing} onClose={() => setEditing(null)} onSubmit={save} title={editing?.id ? 'Editar pessoa' : 'Adicionar à equipe'} subtitle="A comissão de cada venda vem da ficha do produto; este percentual é a referência."
      footer={<><button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary">Salvar</button></>}>
      <ErrorNotice message={formError} />
      <div className="form-grid">
        <Field label="Nome completo" span><input value={form.name} onChange={e => set('name', e.target.value)} required autoFocus /></Field>
        <Field label="Função"><select value={form.type} onChange={e => set('type', e.target.value)}><option value="seller">Vendedor</option><option value="producer">Produtor</option></select></Field>
        <Field label="Comissão padrão (%)"><input type="number" inputMode="decimal" min="0" step="0.1" value={form.commission} onChange={e => set('commission', e.target.value)} /></Field>
        <Field label="Telefone"><input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(11) 90000-0000" /></Field>
        <Field label="E-mail"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        {editing?.id && <Field label="Situação"><select value={form.active ? '1' : '0'} onChange={e => set('active', e.target.value === '1')}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>}
      </div>
    </Modal>
    <Confirm open={!!removing} title={`Desativar ${removing?.name}?`} confirmLabel="Desativar" text="A pessoa some dos novos lançamentos; o histórico de vendas e produção continua." onCancel={() => setRemoving(null)} onConfirm={deactivate} />
  </div>;
}
