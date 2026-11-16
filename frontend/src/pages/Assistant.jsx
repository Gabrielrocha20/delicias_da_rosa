import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, RefreshCw, Send, Share2 } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { currency, dateTime, number, quantity } from '../lib/format';
import { Empty, ErrorNotice, Loading, Notice, PageHeader, toast } from '../components/UI';

const QUESTIONS = {
  admin: ['O que devo produzir esta semana?', 'Qual produto tem a pior margem e quanto devo cobrar?', 'Quanto vou gastar de insumos nos próximos 15 dias?', 'Como está o caixa?'],
  seller: ['O que tenho pronto para vender?', 'Quanto tenho para receber?'],
  producer: ['O que tenho para produzir?', 'Falta algum insumo para os meus lotes?'],
};

export function InsightList({ items, limit }) {
  const rows = limit ? items.slice(0, limit) : items;
  if (!rows.length) return <Empty title="Nenhum alerta agora" text="Estoque, margens e produção estão em ordem." />;
  return <div className="insight-list">{rows.map((item, index) => <div className={`insight ${item.severity}`} key={`${item.kind}-${index}`}>
    <i aria-hidden="true" />
    <div><strong>{item.title}</strong><p>{item.detail}</p></div>
    {item.action ? <Link className="btn small" to={item.action.route}>{item.action.label}</Link> : <span />}
  </div>)}</div>;
}

function shoppingText(rows) {
  const lines = rows.map(row => `• ${row.name}: ${row.packs} × ${quantity(row.pack_size, row.unit)} (${quantity(row.quantity, row.unit)}) ≈ ${currency(row.estimated_cost)}${row.supplier ? ` · ${row.supplier}` : ''}`);
  const total = rows.reduce((sum, row) => sum + row.estimated_cost, 0);
  return `Lista de compras · Doces Mivi\n${lines.join('\n')}\n\nTotal estimado: ${currency(total)}`;
}

function Chat({ enabled, role }) {
  const [log, setLog] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [log, busy]);

  async function ask(text) {
    const value = (text ?? question).trim();
    if (!value || busy) return;
    setQuestion(''); setError(''); setBusy(true);
    const history = log.map(({ role: r, content }) => ({ role: r, content }));
    setLog(current => [...current, { role: 'user', content: value }]);
    try {
      const { answer } = await api('/assistant/ask', { method: 'POST', body: { question: value, history } });
      setLog(current => [...current, { role: 'assistant', content: answer }]);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (!enabled) {
    return <Notice tone="info">{role === 'admin'
      ? <span>O chat com IA está desligado. <Link to="/configuracoes"><b>Cadastre uma chave do Ollama em Configurações</b></Link> para ligar. Os alertas e a lista de compras funcionam sem ele.</span>
      : <span>O chat com IA está desligado. Peça à administração para cadastrar uma chave em Configurações.</span>}</Notice>;
  }
  return <div className="chat">
    {log.length > 0 && <div className="chat-log">{log.map((row, index) => <div key={index} className={`bubble ${row.role}`}>{row.content}</div>)}{busy && <div className="bubble assistant muted">Pensando nos seus números…</div>}<span ref={end} /></div>}
    {!log.length && <div className="suggestions">{(QUESTIONS[role] || QUESTIONS.admin).map(text => <button type="button" key={text} onClick={() => ask(text)}>{text}</button>)}</div>}
    <ErrorNotice message={error} />
    <form className="chat-form" onSubmit={event => { event.preventDefault(); ask(); }}>
      <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Pergunte sobre estoque, produção, preços ou caixa" aria-label="Pergunta para o assistente" maxLength={1000} />
      <button className="btn primary" disabled={busy || !question.trim()} aria-label="Enviar pergunta"><Send /></button>
    </form>
  </div>;
}

export default function Assistant() {
  const user = getStoredUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api('/assistant/insights').then(result => { setData(result); setError(''); }).catch(err => setError(err.message)).finally(() => setLoading(false)); };
  useEffect(load, []);
  useEffect(() => {
    if (data && window.location.hash === '#compras') document.getElementById('compras')?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  const insights = data?.insights || [];
  const urgent = insights.filter(item => item.severity === 'critical').length;
  const attention = insights.filter(item => item.severity === 'warning').length;
  const shopping = data?.shopping_list || [];
  const shoppingTotal = shopping.reduce((sum, row) => sum + row.estimated_cost, 0);
  const capacity = data?.producible || [];
  const maxCapacity = Math.max(1, ...capacity.map(row => row.max_producible || 0));

  const copy = async () => {
    try { await navigator.clipboard.writeText(shoppingText(shopping)); toast('Lista copiada'); }
    catch { toast('Não foi possível copiar', 'error'); }
  };
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(shoppingText(shopping))}`, '_blank', 'noopener');

  const finding = loading ? 'Lendo estoque, receitas, produção e vendas…'
    : urgent ? `${urgent} ${urgent === 1 ? 'assunto urgente' : 'assuntos urgentes'} e ${attention} para acompanhar.`
      : attention ? `Nada urgente; ${attention} ${attention === 1 ? 'ponto' : 'pontos'} para acompanhar.` : 'Nada urgente hoje.';

  return <div className="page">
    <PageHeader title="Assistente" description={finding}
      actions={<button type="button" className="btn" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} />Atualizar</button>} />
    <ErrorNotice message={error} />
    <div className="grid cols-3-1 align-start">
      <section className="panel">
        <div className="panel-head"><div><h2>O que fazer agora</h2><p>Calculado a partir de estoque, fichas técnicas, lotes e vendas dos últimos 30 dias.</p></div>{data && <span className="small muted">{dateTime(data.generated_at)}</span>}</div>
        <div className="panel-body flush" style={{ padding: '8px 0 0' }}>{loading && !data ? <Loading rows={5} /> : <InsightList items={insights} />}</div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Pergunte</h2><p>Respostas com os números da fábrica.</p></div></div>
        <div className="panel-body">{data ? <Chat enabled={data.ai_enabled} role={user?.role} /> : <Loading rows={2} />}</div>
      </section>
    </div>

    {user?.role === 'admin' && <div className="grid cols-2 align-start">
      <section className="panel" id="compras">
        <div className="panel-head">
          <div><h2>Lista de compras</h2><p>{shopping.length ? `${shopping.length} itens · ${currency(shoppingTotal)} estimados` : 'Para cobrir duas semanas e os lotes agendados'}</p></div>
          {shopping.length > 0 && <div className="row-actions"><button type="button" className="btn small" onClick={copy}><Copy />Copiar</button><button type="button" className="btn small" onClick={share}><Share2 />WhatsApp</button></div>}
        </div>
        {loading && !data ? <Loading /> : shopping.length ? <div className="table-wrap" style={{ marginTop: 8 }}><table className="responsive">
          <thead><tr><th>Insumo</th><th className="num">Comprar</th><th className="num">Estimado</th></tr></thead>
          <tbody>{shopping.map(row => <tr key={row.ingredient_id}>
            <td className="primary"><Link to={`/insumos?item=${row.ingredient_id}`}><strong>{row.name}</strong></Link><span className="sub">{row.supplier || 'Sem fornecedor definido'}</span></td>
            <td className="num meta" data-label="Comprar">{row.packs} × {quantity(row.pack_size, row.unit)}<span className="sub">{quantity(row.quantity, row.unit)}</span></td>
            <td className="num lead">{currency(row.estimated_cost)}</td>
          </tr>)}</tbody>
        </table></div> : <Empty title="Nada para comprar agora" text="Quando um insumo ficar abaixo do mínimo ou faltar para um lote agendado, ele aparece aqui." />}
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Quanto dá para produzir agora</h2><p>Pelo estoque atual de insumos; o item em falta limita cada receita.</p></div></div>
        <div className="panel-body">{loading && !data ? <Loading /> : capacity.length ? <div className="bar-list">{capacity.map(row => <div className="bar-row" key={row.id}>
          <span>{row.name}</span>
          <strong>{number(row.max_producible, 0)} un.</strong>
          <div className={`meter ${row.max_producible === 0 ? 'low' : 'accent'}`}><i style={{ width: `${(row.max_producible / maxCapacity) * 100}%` }} /></div>
          <small>{row.max_producible === 0 ? `Sem ${row.bottleneck}` : `Limitado por ${row.bottleneck}`} · {row.finished_stock > 0 ? `${row.finished_stock} prontos` : 'nenhum pronto'} · vende {number(row.daily_sales)}/dia</small>
        </div>)}</div> : <Empty title="Nenhuma receita cadastrada" text="Monte as fichas técnicas em Produtos e receitas." />}</div>
      </section>
    </div>}
  </div>;
}
