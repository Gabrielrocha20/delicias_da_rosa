import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, FlaskConical, Plus, Power, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { dateTime, number } from '../lib/format';
import { Confirm, Empty, ErrorNotice, Field, Kpi, KpiStrip, Loading, Modal, Notice, PageHeader, Pill, RowMenu, toast } from '../components/UI';

const clock = value => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function statusPill(key) {
  if (key.status === 'ok') return <Pill tone="positive" dot>Pronta</Pill>;
  if (key.status === 'exhausted') return <Pill tone="warning" dot>Limite atingido · volta às {clock(key.exhausted_until)}</Pill>;
  if (key.status === 'invalid') return <Pill tone="negative" dot>Recusada</Pill>;
  return <Pill dot>Desativada</Pill>;
}

function KeyForm({ open, initial, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setName(initial?.name || ''); setSecret(''); setShow(false); setError(''); } }, [open, initial]);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const body = { name: name.trim(), ...(secret ? { key: secret.trim() } : {}) };
      await api(initial ? `/assistant/keys/${initial.id}` : '/assistant/keys', { method: initial ? 'PATCH' : 'POST', body });
      toast(initial ? 'Chave atualizada' : 'Chave cadastrada');
      onSaved();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return <Modal open={open} onClose={onClose} onSubmit={submit} title={initial ? `Editar ${initial.name}` : 'Nova chave do Ollama'}
    subtitle={initial ? 'Deixe a chave em branco para mantê-la.' : 'A chave fica guardada criptografada e nunca é mostrada de novo.'}
    footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar chave'}</button></>}>
    <ErrorNotice message={error} />
    <div className="form-grid">
      <Field label="Nome" span hint="Para você reconhecer, ex.: “Conta da Maria”"><input value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoFocus /></Field>
      <Field label={initial ? 'Trocar a chave (opcional)' : 'Chave de API'} span>
        <div className="password-input">
          <input type={show ? 'text' : 'password'} value={secret} onChange={e => setSecret(e.target.value)} required={!initial} autoComplete="off" spellCheck={false} placeholder="Cole aqui a chave copiada do Ollama" />
          <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar chave' : 'Mostrar chave'}>{show ? <EyeOff /> : <Eye />}</button>
        </div>
      </Field>
    </div>
    <Notice tone="info"><span>Para criar: entre em <b>ollama.com</b>, abra <b>Settings → Keys</b> (ollama.com/settings/keys) e clique em criar chave. Cada conta gratuita tem a sua própria cota, então várias contas somam limite.</span></Notice>
  </Modal>;
}

export default function Settings() {
  const [keys, setKeys] = useState(null);
  const [settings, setSettings] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [testing, setTesting] = useState(null);
  const [savingModel, setSavingModel] = useState(false);

  const load = useCallback(() => Promise.all([api('/assistant/keys'), api('/assistant/settings')])
    .then(([rows, current]) => { setKeys(rows); setSettings(current); setModel(current.model); setError(''); })
    .catch(err => setError(err.message)), []);
  useEffect(() => { load(); api('/assistant/models').then(result => setModels(result.models || [])).catch(() => {}); }, [load]);

  const ready = (keys || []).filter(key => key.status === 'ok').length;
  const resting = (keys || []).filter(key => key.status === 'exhausted').length;
  const broken = (keys || []).filter(key => key.status === 'invalid').length;
  const total = (keys || []).reduce((sum, key) => sum + key.requests_count, 0);

  async function test(key) {
    setTesting(key.id);
    try {
      const result = await api(`/assistant/keys/${key.id}/test`, { method: 'POST' });
      toast(result.ok ? `${key.name}: funcionando` : `${key.name}: ${result.message}`, result.ok ? 'ok' : 'error');
      await load();
    } catch (err) { toast(err.message, 'error'); } finally { setTesting(null); }
  }
  async function toggle(key) {
    try { await api(`/assistant/keys/${key.id}`, { method: 'PATCH', body: { active: !key.active } }); await load(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function reset(key) {
    try { await api(`/assistant/keys/${key.id}/reset`, { method: 'POST' }); toast('Chave liberada para uso'); await load(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function remove() {
    try { await api(`/assistant/keys/${removing.id}`, { method: 'DELETE' }); toast('Chave removida'); setRemoving(null); await load(); }
    catch (err) { setRemoving(null); setError(err.message); }
  }
  async function saveModel(event) {
    event.preventDefault(); setSavingModel(true);
    try { await api('/assistant/settings', { method: 'PUT', body: { model: model.trim() } }); toast('Modelo salvo'); await load(); }
    catch (err) { toast(err.message, 'error'); } finally { setSavingModel(false); }
  }

  return <div className="page">
    <PageHeader title="Configurações" description="Assistente com IA no Ollama Cloud: cadastre quantas chaves quiser. Quando uma atinge o limite, o sistema passa sozinho para a próxima."
      actions={<button type="button" className="btn primary" onClick={() => setForm({})}><Plus />Nova chave</button>} />
    <ErrorNotice message={error} />
    {!keys ? <section className="panel"><Loading /></section> : <>
      <KpiStrip>
        <Kpi lead label="Chaves prontas" value={number(ready, 0)} note={keys.length ? `de ${keys.length} cadastradas` : 'nenhuma cadastrada'} />
        <Kpi label="Esperando renovar o limite" value={number(resting, 0)} note={resting ? 'voltam sozinhas no horário indicado' : 'nenhuma no limite'} />
        <Kpi label="Recusadas" value={number(broken, 0)} note={broken ? 'cole a chave de novo' : 'tudo certo'} />
        <Kpi label="Perguntas respondidas" value={number(total, 0)} note="somando todas as chaves" />
      </KpiStrip>

      <section className="panel">
        <div className="panel-head"><div><h2>Chaves de API do Ollama</h2><p>Usadas de cima para baixo: a primeira atende até esgotar, depois a próxima assume.</p></div></div>
        {keys.length ? <div className="table-wrap" style={{ marginTop: 8 }}><table className="responsive">
          <thead><tr><th>Chave</th><th>Situação</th><th className="num">Perguntas</th><th>Último uso</th><th /></tr></thead>
          <tbody>{keys.map((key, index) => <tr key={key.id} className={key.status === 'inactive' ? 'dim' : ''}>
            <td className="primary"><strong>{index + 1}. {key.name}</strong><span className="sub tabular">{key.masked}{key.last_error && key.status !== 'ok' ? ` · ${key.last_error}` : ''}</span></td>
            <td className="status">{statusPill(key)}</td>
            <td className="num meta" data-label="Perguntas">{number(key.requests_count, 0)}</td>
            <td className="meta" data-label="Último uso">{key.last_used_at ? dateTime(key.last_used_at) : <span className="dash">nunca</span>}</td>
            <td className="actions"><div className="row-actions">
              <button type="button" className="btn small" onClick={() => test(key)} disabled={testing === key.id}><FlaskConical />{testing === key.id ? 'Testando…' : 'Testar'}</button>
              <RowMenu items={[
                key.status === 'exhausted' ? { label: 'Liberar agora', icon: RotateCcw, onClick: () => reset(key) } : null,
                { label: key.active ? 'Desativar' : 'Ativar', icon: Power, onClick: () => toggle(key) },
                { label: 'Editar ou trocar a chave', icon: Plus, onClick: () => setForm(key) },
                { label: 'Remover', icon: Trash2, danger: true, onClick: () => setRemoving(key) },
              ]} />
            </div></td>
          </tr>)}</tbody>
        </table></div> : <Empty title="Nenhuma chave cadastrada" text="Sem chave, o chat do assistente fica desligado. Os alertas e a lista de compras funcionam do mesmo jeito."
          action={<button type="button" className="btn primary" onClick={() => setForm({})}><Plus />Cadastrar a primeira chave</button>} />}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Modelo</h2><p>O mesmo modelo é usado por todas as chaves.</p></div></div>
        <form className="panel-body" onSubmit={saveModel}>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Field label="Modelo do Ollama Cloud">
              <input list="ollama-models" value={model} onChange={e => setModel(e.target.value)} style={{ width: 280 }} required />
              <datalist id="ollama-models">{models.map(name => <option key={name} value={name} />)}</datalist>
            </Field>
            <button className="btn primary" disabled={savingModel || !model.trim() || model === settings?.model} style={{ alignSelf: 'flex-end' }}>{savingModel ? 'Salvando…' : 'Salvar modelo'}</button>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>{models.length ? `${models.length} modelos disponíveis no Ollama Cloud; comece a digitar para filtrar.` : 'Digite o nome exato do modelo, como aparece em ollama.com/search?c=cloud.'} Modelos menores respondem mais rápido e gastam menos do limite.</p>
        </form>
      </section>
    </>}

    <KeyForm open={!!form} initial={form?.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
    <Confirm open={!!removing} title={`Remover ${removing?.name}?`} confirmLabel="Remover chave"
      text="A chave é apagada do sistema. Ela continua existindo na sua conta do Ollama; para revogá-la de vez, apague-a lá também."
      onCancel={() => setRemoving(null)} onConfirm={remove} />
  </div>;
}
