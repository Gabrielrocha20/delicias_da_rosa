import { useEffect, useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { Actions, Avatar, Confirm, Empty, ErrorNotice, Field, Loading, Modal, Notice, PageHeader, Pill, SearchBox, toast } from '../components/UI';

const ROLES = { admin: ['Administrador', 'accent', 'Tudo: cadastros, custos, caixa e análises.'], seller: ['Vendedor', 'info', 'Painel pessoal, as próprias vendas, assistente e Página da Verdade.'], producer: ['Produtor', 'positive', 'Painel pessoal, a própria produção, assistente e Página da Verdade.'] };
const blank = { name: '', email: '', password: '', role: 'seller', person_id: '', active: true };

export default function Accesses() {
  const current = getStoredUser();
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const load = () => Promise.all([api('/users'), api('/people')]).then(([users, rows]) => { setItems(users); setPeople(rows.filter(row => row.active)); }).catch(err => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => items.filter(row => `${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const form = editing?.data || blank;
  const set = (key, value) => setEditing(state => ({ ...state, data: { ...state.data, [key]: value } }));
  const changeRole = role => setEditing(state => ({ ...state, data: { ...state.data, role, person_id: role === 'admin' ? '' : String(people.find(row => row.type === role)?.id || '') } }));
  const openNew = () => { setFormError(''); setEditing({ data: { ...blank, person_id: String(people.find(row => row.type === 'seller')?.id || '') } }); };

  async function save(event) {
    event.preventDefault(); setFormError('');
    try { await api(editing.id ? `/users/${editing.id}` : '/users', { method: editing.id ? 'PUT' : 'POST', body: form }); toast('Acesso salvo'); setEditing(null); load(); }
    catch (err) { setFormError(err.message); }
  }
  async function deactivate() {
    try { await api(`/users/${removing.id}`, { method: 'DELETE' }); toast('Acesso desativado'); setRemoving(null); load(); }
    catch (err) { setRemoving(null); setError(err.message); }
  }

  return <div className="page">
    <PageHeader title="Acessos" description="O login de cada pessoa. O cargo decide o que ela vê, no painel web e no app."
      actions={<button type="button" className="btn primary" onClick={openNew}><UserPlus />Novo acesso</button>} />
    <ErrorNotice message={error} />
    <section className="panel">
      <div className="panel-body" style={{ paddingBottom: 4 }}><div className="toolbar" style={{ marginBottom: 0 }}><SearchBox value={search} onChange={setSearch} placeholder="Buscar nome ou e-mail" /><span className="spacer" /><span className="small muted">{items.filter(row => row.active).length} ativos</span></div></div>
      {loading ? <Loading /> : filtered.length ? <div className="table-wrap"><table className="responsive">
        <thead><tr><th>Usuário</th><th>Cargo</th><th>Pessoa da equipe</th><th>Situação</th><th /></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.id} className={item.active ? '' : 'dim'}>
          <td className="primary"><div className="cell-title"><Avatar name={item.name} id={item.id} /><span><strong>{item.name}{item.id === current?.id ? ' (você)' : ''}</strong><small>{item.email}</small></span></div></td>
          <td className="meta plain"><Pill tone={ROLES[item.role][1]}>{ROLES[item.role][0]}</Pill></td>
          <td className="meta" data-label="Pessoa">{item.person_name || <span className="dash">—</span>}</td>
          <td className="status"><Pill tone={item.active ? 'positive' : 'neutral'}>{item.active ? 'Ativo' : 'Inativo'}</Pill></td>
          <td className="actions"><Actions onEdit={() => { setFormError(''); setEditing({ id: item.id, data: { ...item, person_id: item.person_id ? String(item.person_id) : '', password: '' } }); }} onDelete={item.active && item.id !== current?.id ? () => setRemoving(item) : null} deleteLabel="Desativar" /></td>
        </tr>)}</tbody>
      </table></div> : <Empty title="Nenhum acesso encontrado" />}
    </section>
    <Modal open={!!editing} onClose={() => setEditing(null)} onSubmit={save} title={editing?.id ? 'Editar acesso' : 'Criar acesso'}
      footer={<><button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary">Salvar acesso</button></>}>
      <ErrorNotice message={formError} />
      <div className="form-grid">
        <Field label="Nome que aparece no sistema" span><input value={form.name} onChange={e => set('name', e.target.value)} required autoFocus /></Field>
        <Field label="E-mail de login"><input type="email" autoComplete="off" value={form.email} onChange={e => set('email', e.target.value)} required /></Field>
        <Field label={editing?.id ? 'Nova senha (opcional)' : 'Senha inicial'} hint={editing?.id ? 'Deixe vazio para manter a atual.' : 'Mínimo de 8 caracteres, sem ser só números.'}>
          <input type="password" autoComplete="new-password" minLength={editing?.id ? undefined : 8} value={form.password} onChange={e => set('password', e.target.value)} required={!editing?.id} />
        </Field>
        <Field label="Cargo"><select value={form.role} onChange={e => changeRole(e.target.value)}>{Object.entries(ROLES).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        {form.role !== 'admin' && <Field label="Pessoa da equipe"><select value={form.person_id} onChange={e => set('person_id', e.target.value)} required><option value="">Selecione</option>{people.filter(row => row.type === form.role).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
        {editing?.id && <Field label="Situação"><select value={form.active ? '1' : '0'} onChange={e => set('active', e.target.value === '1')} disabled={editing.id === current?.id}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>}
      </div>
      <Notice tone="info"><span><b>{ROLES[form.role][0]}:</b> {ROLES[form.role][2]}</span></Notice>
    </Modal>
    <Confirm open={!!removing} title={`Desativar o acesso de ${removing?.name}?`} confirmLabel="Desativar" text="A pessoa não consegue mais entrar, nem pelo app. O histórico fica intacto." onCancel={() => setRemoving(null)} onConfirm={deactivate} />
  </div>;
}
