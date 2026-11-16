import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { currency, number } from '../lib/format';
import { Actions, Avatar, Confirm, Empty, ErrorNotice, Field, Kpi, KpiStrip, Loading, Modal, PageHeader, SearchBox, toast } from '../components/UI';

const blank = () => ({ name: '', contact_name: '', phone: '', address: '', active: true, products: [] });

export default function Establishments() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const load = () => Promise.all([api('/establishments'), api('/products')]).then(([places, prods]) => { setItems(places); setProducts(prods.filter(row => row.active)); }).catch(err => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => items.filter(row => `${row.name} ${row.contact_name}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const form = editing?.data || blank();
  const set = (key, value) => setEditing(state => ({ ...state, data: { ...state.data, [key]: value } }));
  async function edit(item) { setFormError(''); try { const detail = await api(`/establishments/${item.id}`); setEditing({ id: item.id, data: { ...detail } }); } catch (err) { setError(err.message); } }
  const used = new Set(form.products.map(row => Number(row.product_id)));
  const addProduct = () => { const first = products.find(row => !used.has(row.id)); if (first) set('products', [...form.products, { product_id: first.id, commission: 12 }]); };
  const updateProduct = (index, key, value) => set('products', form.products.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  async function save(event) {
    event.preventDefault(); setFormError('');
    try { await api(editing.id ? `/establishments/${editing.id}` : '/establishments', { method: editing.id ? 'PUT' : 'POST', body: form }); toast('Parceiro salvo'); setEditing(null); load(); }
    catch (err) { setFormError(err.message); }
  }
  async function deactivate() { await api(`/establishments/${removing.id}`, { method: 'DELETE' }); toast('Parceiro desativado'); setRemoving(null); load(); }

  return <div className="page">
    <PageHeader title="Parceiros" description="Lojas e cafés que revendem os bolos, com a comissão de cada produto."
      actions={<button type="button" className="btn primary" onClick={() => { setFormError(''); setEditing({ data: blank() }); }}><Plus />Novo parceiro</button>} />
    <ErrorNotice message={error} />
    <KpiStrip>
      <Kpi lead label="Faturado via parceiros" value={currency(items.reduce((sum, row) => sum + row.revenue, 0))} note={`${items.filter(row => row.active).length} parceiros ativos`} />
      <Kpi label="Comissões pagas" value={currency(items.reduce((sum, row) => sum + row.earnings, 0))} />
      <Kpi label="Unidades revendidas" value={number(items.reduce((sum, row) => sum + row.units_sold, 0), 0)} unit="un." />
    </KpiStrip>
    <section className="panel">
      <div className="panel-body" style={{ paddingBottom: 4 }}><div className="toolbar" style={{ marginBottom: 0 }}><SearchBox value={search} onChange={setSearch} placeholder="Buscar parceiro" /></div></div>
      {loading ? <Loading /> : filtered.length ? <div className="table-wrap"><table className="responsive">
        <thead><tr><th>Parceiro</th><th>Telefone</th><th className="num">Produtos</th><th className="num">Unidades</th><th className="num">Faturado</th><th className="num">Comissão</th><th /></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.id} className={`clickable ${item.active ? '' : 'dim'}`} tabIndex={0} onClick={() => edit(item)} onKeyDown={e => e.key === 'Enter' && edit(item)}>
          <td className="primary"><div className="cell-title"><Avatar name={item.name} id={item.id + 3} /><span><strong>{item.name}</strong><small>{item.contact_name || 'Sem contato'}{item.active ? '' : ' · inativo'}</small></span></div></td>
          <td className="meta" data-label="Telefone">{item.phone || <span className="dash">—</span>}</td>
          <td className="num meta" data-label="Produtos">{item.product_count}</td>
          <td className="num meta" data-label="Unidades">{number(item.units_sold, 0)}</td>
          <td className="num lead">{currency(item.revenue)}</td>
          <td className="num meta" data-label="Comissão">{currency(item.earnings)}</td>
          <td className="actions"><Actions onEdit={() => edit(item)} onDelete={item.active ? () => setRemoving(item) : null} deleteLabel="Desativar" /></td>
        </tr>)}</tbody>
      </table></div> : <Empty title="Nenhum parceiro" text="Cadastre os pontos de revenda e os produtos de cada um." />}
    </section>
    <Modal open={!!editing} onClose={() => setEditing(null)} onSubmit={save} wide title={editing?.id ? `Editar ${form.name}` : 'Novo parceiro'} subtitle="A comissão vigente fica gravada em cada venda; mudar depois não altera o histórico."
      footer={<><button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary">Salvar parceiro</button></>}>
      <ErrorNotice message={formError} />
      <div className="form-grid">
        <Field label="Nome do estabelecimento"><input value={form.name} onChange={e => set('name', e.target.value)} required autoFocus /></Field>
        <Field label="Pessoa de contato"><input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></Field>
        <Field label="Telefone"><input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Endereço"><input value={form.address} onChange={e => set('address', e.target.value)} /></Field>
        {editing?.id && <Field label="Situação"><select value={form.active ? '1' : '0'} onChange={e => set('active', e.target.value === '1')}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>}
      </div>
      <div className="section-head"><div><h3>Produtos revendidos</h3><small>Só estes produtos podem ser vendidos por este parceiro</small></div><button type="button" className="btn small" onClick={addProduct} disabled={used.size >= products.length}><Plus />Produto</button></div>
      {form.products.length ? form.products.map((row, index) => <div className="recipe-row" key={index} style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,.8fr) 32px' }}>
        <Field label="Produto"><select value={row.product_id} onChange={e => updateProduct(index, 'product_id', Number(e.target.value))}>{products.filter(p => p.id === Number(row.product_id) || !used.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Comissão (%)"><input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={row.commission} onChange={e => updateProduct(index, 'commission', e.target.value)} /></Field>
        <button type="button" className="icon-btn danger" aria-label="Remover produto" onClick={() => set('products', form.products.filter((_, i) => i !== index))} style={{ marginBottom: 3 }}><Trash2 /></button>
      </div>) : <Empty title="Nenhum produto" text="Adicione os produtos que este parceiro revende." />}
    </Modal>
    <Confirm open={!!removing} title={`Desativar ${removing?.name}?`} confirmLabel="Desativar" text="O parceiro some das novas vendas; o histórico continua." onCancel={() => setRemoving(null)} onConfirm={deactivate} />
  </div>;
}
