import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Layers3 } from 'lucide-react';
import { api } from '../lib/api';
import { currency, number } from '../lib/format';
import { Actions, Badge, Confirm, Empty, ErrorNotice, Field, Loading, Modal, PageHeader, SearchBox } from '../components/UI';

const blank = { name:'', category:'Ingredientes', purchase_price:'', purchase_quantity:'', unit:'g', stock:'0', min_stock:'0' };

export default function Ingredients() {
  const [items,setItems]=useState([]), [search,setSearch]=useState(''), [editing,setEditing]=useState(null), [remove,setRemove]=useState(null);
  const [loading,setLoading]=useState(true), [saving,setSaving]=useState(false), [error,setError]=useState('');
  const load=()=>api('/ingredients').then(setItems).finally(()=>setLoading(false));
  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>items.filter(i=>`${i.name} ${i.category}`.toLowerCase().includes(search.toLowerCase())),[items,search]);
  const form=editing?.data||blank;
  const change=(key,value)=>setEditing(e=>({...e,data:{...e.data,[key]:value}}));
  async function save(e){e.preventDefault();setSaving(true);setError('');try{await api(editing.id?`/ingredients/${editing.id}`:'/ingredients',{method:editing.id?'PUT':'POST',body:editing.data});setEditing(null);await load()}catch(err){setError(err.message)}finally{setSaving(false)}}
  async function confirmDelete(){try{await api(`/ingredients/${remove.id}`,{method:'DELETE'});setRemove(null);await load()}catch(err){setRemove(null);setError(err.message)}}

  return <div className="page">
    <PageHeader eyebrow="Base de custos" title="Insumos" description="Cadastre ingredientes, embalagens e tudo que entra no custo dos seus produtos." action={<button className="btn primary" onClick={()=>{setError('');setEditing({data:{...blank}})}}><PackagePlus size={18}/> Novo insumo</button>}/>
    <ErrorNotice message={error}/>
    <section className="summary-strip"><div><Layers3 size={20}/><span>Itens cadastrados<strong>{items.length}</strong></span></div><div><span>Valor estimado em estoque<strong>{currency(items.reduce((sum,i)=>sum+i.stock*i.unit_cost,0))}</strong></span></div><div><span>Abaixo do mínimo<strong>{items.filter(i=>i.stock<=i.min_stock).length}</strong></span></div></section>
    <section className="panel table-panel">
      <div className="table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Buscar insumo ou categoria..."/><span>{filtered.length} {filtered.length===1?'item':'itens'}</span></div>
      {loading?<Loading/>:filtered.length?<div className="table-scroll"><table><thead><tr><th>Insumo</th><th>Compra</th><th>Custo base</th><th>Estoque atual</th><th>Situação</th><th></th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><div className="cell-title"><div className="item-symbol">{item.name[0]}</div><span><strong>{item.name}</strong><small>{item.category}</small></span></div></td><td>{currency(item.purchase_price)} / {number(item.purchase_quantity)} {item.unit}</td><td><strong>{currency(item.unit_cost)}</strong> / {item.unit}</td><td>{number(item.stock)} {item.unit}</td><td><Badge tone={item.stock<=item.min_stock?'warning':'positive'}>{item.stock<=item.min_stock?'Repor estoque':'Em dia'}</Badge></td><td><Actions onEdit={()=>{setError('');setEditing({id:item.id,data:{...item}})}} onDelete={()=>setRemove(item)}/></td></tr>)}</tbody></table></div>:<Empty title="Nenhum insumo encontrado" text="Ajuste a busca ou cadastre um novo insumo."/>}
    </section>
    <Modal open={!!editing} title={editing?.id?'Editar insumo':'Novo insumo'} subtitle="O custo unitário é calculado automaticamente." onClose={()=>setEditing(null)}>
      <form onSubmit={save}><ErrorNotice message={error}/><div className="form-grid"><Field label="Nome" span><input value={form.name} onChange={e=>change('name',e.target.value)} placeholder="Ex.: Leite condensado" required/></Field><Field label="Categoria"><input value={form.category} onChange={e=>change('category',e.target.value)} placeholder="Laticínios"/></Field><Field label="Unidade de uso"><select value={form.unit} onChange={e=>change('unit',e.target.value)}><option>g</option><option>ml</option><option>un</option><option>kg</option><option>l</option><option>pacote</option></select></Field><Field label="Preço pago (R$)"><input type="number" step="0.01" min="0" value={form.purchase_price} onChange={e=>change('purchase_price',e.target.value)} required/></Field><Field label={`Quantidade comprada (${form.unit})`}><input type="number" step="any" min="0.000001" value={form.purchase_quantity} onChange={e=>change('purchase_quantity',e.target.value)} required/></Field><Field label={`Estoque atual (${form.unit})`}><input type="number" step="0.01" min="0" value={form.stock} onChange={e=>change('stock',e.target.value)}/></Field><Field label={`Estoque mínimo (${form.unit})`}><input type="number" step="0.01" min="0" value={form.min_stock} onChange={e=>change('min_stock',e.target.value)}/></Field></div><div className="modal-actions"><button type="button" className="btn ghost" onClick={()=>setEditing(null)}>Cancelar</button><button className="btn primary" disabled={saving}>{saving?'Salvando...':'Salvar insumo'}</button></div></form>
    </Modal>
    <Confirm open={!!remove} title="Remover insumo?" text={`O insumo “${remove?.name}” será excluído. Itens usados em receitas são protegidos.`} onCancel={()=>setRemove(null)} onConfirm={confirmDelete}/>
  </div>;
}
