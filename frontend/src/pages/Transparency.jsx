import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { currency, number, percent } from '../lib/format';
import { Avatar, Empty, ErrorNotice, Kpi, KpiStrip, Loading, PageHeader, Pill, Segmented } from '../components/UI';

const RANGES = [['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias'], ['12m', '12 meses']];
/* Uma família de tons: o resultado do proprietário leva a cor da marca; o resto é escala neutra-quente. */
const PARTS = [
  ['owner', 'Resultado do proprietário', '#a3324a'],
  ['product_cost', 'Ingredientes e embalagens', '#3a3330'],
  ['sellers', 'Vendedores', '#6b625c'],
  ['producers', 'Produtores', '#8f8680'],
  ['cash_reserve', 'Reserva de caixa', '#b3aba5'],
  ['partners', 'Parceiros', '#cfc8c3'],
  ['sales_fees', 'Taxas de venda', '#e2dcd8'],
];

export default function Transparency() {
  const [range, setRange] = useState('30d');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams({ range });
    if (start && end) { params.set('start', start); params.set('end', end); }
    api(`/transparency?${params}`).then(result => { setData(result); setError(''); }).catch(err => setError(err.message));
  }, [range, start, end]);
  const t = data?.totals || {};
  const parts = PARTS.map(([key, label, color]) => ({ key, label, color, value: key === 'owner' ? Math.max(0, t.owner || 0) : t[key] || 0 }));

  return <div className="page">
    <PageHeader title="Página da Verdade" description={data ? `De ${currency(t.revenue)} vendidos, ${currency(t.owner)} ficaram com o proprietário. Todo o resto está dividido abaixo, aberto para a equipe.` : 'Cada real vendido, dividido de forma aberta.'}
      actions={<>
        <Segmented label="Período" value={start && end ? '' : range} onChange={key => { setStart(''); setEnd(''); setRange(key); }} options={RANGES} />
        <div className="date-range"><input type="date" value={start} onChange={e => setStart(e.target.value)} aria-label="Data inicial" /><span className="small muted">até</span><input type="date" value={end} onChange={e => setEnd(e.target.value)} aria-label="Data final" /></div>
      </>} />
    <ErrorNotice message={error} />
    {!data ? <section className="panel"><Loading rows={6} /></section> : <>
      <KpiStrip>
        <Kpi lead label="Faturamento" value={currency(t.revenue)} note={`${number(t.units, 0)} unidades`} />
        <Kpi label="Resultado do proprietário" value={<span className={t.owner < 0 ? 'negative' : ''}>{currency(t.owner)}</span>} note={t.revenue ? `${percent((t.owner / t.revenue) * 100)} do faturamento` : '—'} />
        <Kpi label="Distribuído" value={currency(t.distributed)} note="custos, comissões, taxas e reserva" />
        <Kpi label="Retorno sobre o custo" value={percent(t.roi)} note="resultado ÷ custo dos produtos" />
      </KpiStrip>
      <div className="grid cols-2 align-start">
        <section className="panel">
          <div className="panel-head"><div><h2>Para onde vai cada real</h2><p>Proporção do faturamento do período</p></div></div>
          <div className="panel-body">
            {t.revenue ? <>
              <div className="split-bar" role="img" aria-label="Divisão do faturamento">{parts.filter(part => part.value > 0).map(part => <i key={part.key} style={{ width: `${(part.value / t.revenue) * 100}%`, background: part.color }} title={`${part.label}: ${currency(part.value)}`} />)}</div>
              <div className="split-legend">{parts.map(part => <div key={part.key}><i style={{ background: part.color }} /><span>{part.label}</span><strong>{percent((part.value / t.revenue) * 100)}</strong></div>)}</div>
            </> : <Empty title="Sem vendas no período" />}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Fechamento do período</h2><p>Calculado venda a venda pela ficha técnica vigente</p></div></div>
          <div className="panel-body ledger">
            <div className="line head"><span>Faturamento bruto</span><strong>{currency(t.revenue)}</strong></div>
            <div className="line"><span>− Ingredientes e embalagens</span><strong>{currency(t.product_cost)}</strong></div>
            <div className="line"><span>− Comissões de vendedores</span><strong>{currency(t.sellers)}</strong></div>
            <div className="line"><span>− Comissões de produtores</span><strong>{currency(t.producers)}</strong></div>
            <div className="line"><span>− Reserva de caixa</span><strong>{currency(t.cash_reserve)}</strong></div>
            <div className="line"><span>− Parceiros</span><strong>{currency(t.partners)}</strong></div>
            <div className="line"><span>− Taxas dos canais</span><strong>{currency(t.sales_fees)}</strong></div>
            <div className={`line result ${t.owner < 0 ? 'bad' : ''}`}><span>= Resultado do proprietário</span><strong>{currency(t.owner)}</strong></div>
          </div>
        </section>
      </div>
      <div className="grid cols-2 align-start">
        <section className="panel">
          <div className="panel-head"><div><h2>Quanto cada pessoa ganhou</h2><p>{data.people.length} pessoas com comissão no período</p></div></div>
          {data.people.length ? <div className="table-wrap"><table className="responsive"><tbody>{data.people.map(person => <tr key={`${person.type}-${person.id}`}>
            <td className="primary"><div className="cell-title"><Avatar name={person.name} id={person.id} /><span><strong>{person.name}</strong><small>{person.type === 'seller' ? 'Vendedor' : 'Produtor'} · {number(person.units, 0)} un.</small></span></div></td>
            <td className="num lead">{currency(person.earnings)}</td>
          </tr>)}</tbody></table></div> : <Empty title="Nenhuma comissão no período" />}
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Parceiros</h2><p>Comissão de revenda no período</p></div></div>
          {data.partners.length ? <div className="table-wrap"><table className="responsive"><tbody>{data.partners.map(partner => <tr key={partner.id}>
            <td className="primary"><strong>{partner.name}</strong><span className="sub">{number(partner.units, 0)} un. · {currency(partner.revenue)} vendidos</span></td>
            <td className="num lead">{currency(partner.earnings)}</td>
          </tr>)}</tbody></table></div> : <Empty title="Nenhuma venda de parceiro no período" />}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head"><div><h2>Produto por produto</h2><p>Quem realmente gera resultado</p></div></div>
        {data.byProduct.length ? <div className="table-wrap"><table className="responsive">
          <thead><tr><th>Produto</th><th className="num">Unidades</th><th className="num">Faturamento</th><th className="num">Custo direto</th><th className="num">Resultado</th><th className="num">Margem final</th></tr></thead>
          <tbody>{data.byProduct.map(item => <tr key={item.name}>
            <td className="primary"><strong>{item.name}</strong></td>
            <td className="num meta" data-label="Unidades">{number(item.units, 0)}</td>
            <td className="num meta" data-label="Faturamento">{currency(item.revenue)}</td>
            <td className="num meta" data-label="Custo">{currency(item.cost)}</td>
            <td className={`num lead ${item.owner < 0 ? 'negative' : ''}`}>{currency(item.owner)}</td>
            <td className="num status"><Pill tone={item.owner >= 0 ? 'positive' : 'negative'}>{item.revenue ? percent((item.owner / item.revenue) * 100) : '—'}</Pill></td>
          </tr>)}</tbody>
        </table></div> : <Empty title="Sem vendas no período" />}
      </section>
    </>}
  </div>;
}
