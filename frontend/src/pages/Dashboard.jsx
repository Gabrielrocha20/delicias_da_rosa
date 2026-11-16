import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, getStoredUser } from '../lib/api';
import { currency, dateShort, number, percent } from '../lib/format';
import { Empty, ErrorNotice, Kpi, KpiStrip, Loading, PageHeader, Pill, Segmented } from '../components/UI';
import { InsightList } from './Assistant';

const RANGES = [['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias'], ['12m', '12 meses']];
const SERIES = {
  revenue: ['Faturamento', currency],
  units: ['Unidades', value => `${number(value, 0)} un.`],
  earnings: ['Minha comissão', currency],
};
const statusLabel = { planned: ['Planejada', 'neutral'], in_progress: ['Em produção', 'warning'] };

function ChartTip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tip"><strong>{dateShort(`${label}T12:00:00`)}</strong>{format(payload[0].value)}</div>;
}

function TrendChart({ data, series }) {
  const [, format] = SERIES[series];
  const axis = value => (series === 'units' ? number(value, 0) : value >= 1000 ? `${number(value / 1000, 1)} mil` : number(value, 0));
  return <div className="chart">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="date" tickFormatter={value => dateShort(`${value}T12:00:00`)} minTickGap={48} axisLine={{ stroke: 'var(--border)' }} tickLine={false} tick={{ fontSize: 12, fill: '#5f5650' }} padding={{ left: 8, right: 8 }} />
        <YAxis tickFormatter={axis} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#5f5650' }} width={52} tickCount={5} allowDecimals={false} />
        <Tooltip content={<ChartTip format={format} />} cursor={{ stroke: 'var(--control)', strokeDasharray: '3 3' }} />
        <Line type="linear" dataKey={series} stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--chart-1)', stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export default function Dashboard() {
  const user = getStoredUser();
  const [range, setRange] = useState('30d');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState('');
  const [series, setSeries] = useState('revenue');

  useEffect(() => {
    const params = new URLSearchParams({ range });
    if (start && end) { params.set('start', start); params.set('end', end); }
    api(`/dashboard?${params}`).then(result => { setData(result); setError(''); }).catch(err => setError(err.message));
  }, [range, start, end]);
  useEffect(() => { api('/assistant/insights').then(setInsights).catch(() => setInsights({ insights: [] })); }, []);

  const m = data?.metrics || {};
  const f = data?.forecast || {};
  const personal = data?.personal;
  const periodLabel = start && end ? `${dateShort(`${start}T12:00:00`)} a ${dateShort(`${end}T12:00:00`)}` : RANGES.find(([key]) => key === range)[1];
  const products = data?.byProduct || [];
  const maxProfit = Math.max(1, ...products.map(row => Math.abs(row.profit)));
  const channels = data?.byChannel || [];
  const maxChannel = Math.max(1, ...channels.map(row => row.value));
  const urgent = (insights?.insights || []).filter(item => item.severity === 'critical').length;
  const seriesOptions = useMemo(() => (personal ? [['revenue', 'Faturamento'], ['earnings', 'Comissão'], ['units', 'Unidades']] : [['revenue', 'Faturamento'], ['units', 'Unidades']]), [personal]);

  const finding = !data ? 'Carregando os números do período…'
    : `${currency(m.revenue)} em ${number(m.unitsSold, 0)} unidades vendidas (${periodLabel})${urgent ? ` · ${urgent} ${urgent === 1 ? 'assunto urgente' : 'assuntos urgentes'} no assistente` : ''}.`;

  return <div className="page">
    <PageHeader title={personal ? `Olá, ${user?.name?.split(' ')[0] || ''}` : 'Visão geral'} description={finding}
      actions={<>
        <Segmented label="Período" value={start && end ? '' : range} onChange={key => { setStart(''); setEnd(''); setRange(key); }} options={RANGES} />
        <div className="date-range">
          <input type="date" value={start} onChange={e => setStart(e.target.value)} aria-label="Data inicial" />
          <span className="muted small">até</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} aria-label="Data final" />
        </div>
      </>} />
    <ErrorNotice message={error} />
    {!data ? <section className="panel"><Loading rows={6} /></section> : <>
      <KpiStrip>
        <Kpi lead label={personal ? 'Faturamento que gerei' : 'Faturamento'} value={currency(m.revenue)} note={`${number(m.unitsSold, 0)} unidades · ticket ${currency(m.averageTicket)}`} />
        <Kpi label={personal ? 'Minha comissão' : 'Resultado do proprietário'} value={currency(m.profit)} note={m.revenue ? `${percent(m.margin)} do faturamento` : 'sem vendas no período'} />
        {!personal && <Kpi label="Custo dos produtos vendidos" value={currency(m.productCost)} note="ingredientes, embalagem e outros" />}
        {data.role !== 'seller' && <Kpi label={data.role === 'producer' ? 'Minha produção' : 'Produção concluída'} value={number(m.unitsProduced, 0)} unit="un." note={periodLabel} />}
      </KpiStrip>

      <div className="grid cols-3-1">
        <section className="panel">
          <div className="panel-head">
            <div><h2>{SERIES[series][0]} por {data.periodDays > 90 ? 'semana' : 'dia'}</h2><p>{periodLabel}</p></div>
            <Segmented label="Série do gráfico" value={series} onChange={setSeries} options={seriesOptions} />
          </div>
          <div className="panel-body" style={{ paddingTop: 8 }}><TrendChart data={data.trend} series={series} /></div>
          <div className="panel-foot">
            <span>Ritmo dos últimos 30 dias: <b className="tabular">{number(f.dailyVelocity)}</b> un./dia</span>
            <span>{personal ? <>Projeção de comissão em 30 dias: <b className="tabular">{currency(f.projectedEarnings30Days)}</b></> : <>Estoque pronto {number(f.availableStock, 0)} un. · {f.daysToSell > 0 ? `≈${number(f.daysToSell, 0)} dias de venda` : 'sem estoque pronto'}</>}</span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Assistente</h2><p>O que pede atenção hoje</p></div><Link className="text-btn" to="/assistente">Ver tudo</Link></div>
          <div style={{ paddingTop: 4 }}>{insights ? <InsightList items={insights.insights} limit={4} /> : <Loading rows={3} />}</div>
        </section>
      </div>

      <div className="grid cols-2 align-start">
        <section className="panel">
          <div className="panel-head"><div><h2>{personal ? 'Comissão por produto' : 'Resultado por produto'}</h2><p>{personal ? 'O que você ganhou em cada sabor' : 'Depois de custos, taxas, comissões e reserva'}</p></div></div>
          <div className="panel-body">{products.length ? <div className="bar-list">{products.slice(0, 6).map((row, index) => <div className="bar-row" key={row.name}>
            <span>{row.name}</span>
            <strong className={row.profit < 0 ? 'negative' : ''}>{currency(row.profit)}</strong>
            <div className={`meter ${index === 0 ? 'accent' : ''} ${row.profit < 0 ? 'low' : ''}`}><i style={{ width: `${(Math.abs(row.profit) / maxProfit) * 100}%` }} /></div>
            <small>{number(row.units, 0)} un. · {currency(row.revenue)} faturados</small>
          </div>)}</div> : <Empty title="Nenhuma venda no período" text="Os produtos aparecem aqui assim que houver vendas." />}</div>
        </section>
        <div className="grid">
          {data.role !== 'seller' && <section className="panel">
            <div className="panel-head"><div><h2>Próximas produções</h2><p>Lotes planejados e em andamento</p></div><Link className="text-btn" to="/producao">Abrir produção</Link></div>
            {data.planned.length ? <div className="table-wrap"><table className="responsive"><tbody>{data.planned.map(item => <tr key={item.id}>
              <td className="primary"><strong>{item.product_name}</strong><span className="sub">{item.producer_name || 'Sem responsável'}</span></td>
              <td className="num lead">{item.quantity} un.</td>
              <td className="num meta plain">{dateShort(item.produced_at)}</td>
              <td className="status"><Pill tone={statusLabel[item.status][1]}>{statusLabel[item.status][0]}</Pill></td>
            </tr>)}</tbody></table></div> : <Empty title="Nenhum lote agendado" text="Agende o próximo lote em Produção." />}
          </section>}
          <section className="panel">
            <div className="panel-head"><div><h2>Vendas por canal</h2><p>{periodLabel}</p></div></div>
            <div className="panel-body">{channels.length ? <div className="bar-list">{channels.map(row => <div className="bar-row" key={row.name}>
              <span>{row.name}</span><strong>{currency(row.value)}</strong>
              <div className="meter"><i style={{ width: `${(row.value / maxChannel) * 100}%` }} /></div>
            </div>)}</div> : <Empty title="Sem vendas no período" />}</div>
          </section>
        </div>
      </div>
    </>}
  </div>;
}
