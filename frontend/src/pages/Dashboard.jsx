import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, Banknote, CakeSlice, CircleDollarSign, Clock3, PackageCheck, ShoppingBag, TrendingUp, TriangleAlert } from 'lucide-react';
import { api, getStoredUser } from '../lib/api';
import { currency, dateBR, number, percent } from '../lib/format';
import { Badge, Loading } from '../components/UI';

const COLORS = ['#8c2f3d', '#c87846', '#dda657', '#6f936b', '#785b89'];
const rangeLabels = { '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', '12m': '12 meses' };

function Metric({ label, value, detail, icon: Icon, tone }) {
  return <article className="metric-card">
    <div className={`metric-icon ${tone}`}><Icon size={20} /></div>
    <div className="metric-label">{label}</div>
    <strong>{value}</strong>
    <span>{detail}</span>
  </article>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><strong>{dateBR(`${label}T12:00:00`)}</strong>{payload.map(item => <span key={item.dataKey} style={{color:item.color}}>{item.name}: {item.dataKey==='revenue'?currency(item.value):number(item.value)}</span>)}</div>;
}

export default function Dashboard() {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();
  useEffect(() => { setLoading(true); api(`/dashboard?range=${range}`).then(setData).finally(() => setLoading(false)); }, [range]);
  if (loading && !data) return <div className="page"><Loading /></div>;
  const m = data?.metrics || {};
  const f = data?.forecast || {};

  return <div className="page dashboard-page">
    <header className="dashboard-head">
      <div><span className="eyebrow">{data.personal?'Meu desempenho':'Painel da operação'}</span><h1>Olá, {user?.name?.split(' ')[0] || 'Rosa'} <span>👋</span></h1><p>{data.personal?`Aqui estão apenas os seus números como ${data.role==='seller'?'vendedor':'produtor'}.`:'Aqui está o resumo completo do seu negócio.'}</p></div>
      <div className="range-picker">{Object.entries(rangeLabels).map(([key,label])=><button key={key} className={range===key?'active':''} onClick={()=>setRange(key)}>{label}</button>)}</div>
    </header>

    <section className="metrics-grid">
      <Metric label={data.personal?'Faturamento que gerei':'Faturamento bruto'} value={currency(m.revenue)} detail={`${number(m.unitsSold)} unidades vendidas`} icon={Banknote} tone="berry" />
      <Metric label={data.personal?'Minha comissão':'Resultado do proprietário'} value={currency(m.profit)} detail={`${percent(m.margin)} do faturamento`} icon={TrendingUp} tone="mint" />
      <Metric label="Ticket médio" value={currency(m.averageTicket)} detail={data.personal?'Nas minhas vendas':`Custo vendido ${currency(m.productCost)}`} icon={CircleDollarSign} tone="caramel" />
      <Metric label={data.role==='producer'?'Minha produção':'Produção concluída'} value={`${number(m.unitsProduced)} un.`} detail={`No período de ${rangeLabels[range]}`} icon={PackageCheck} tone="lilac" />
    </section>

    <section className="dashboard-grid main-charts">
      <article className="panel chart-panel large">
        <div className="panel-head"><div><span className="panel-kicker">Desempenho</span><h2>{data.personal?'Meu faturamento gerado':'Vendas ao longo do tempo'}</h2></div><Badge tone="positive"><ArrowUpRight size={13}/> período atual</Badge></div>
        <div className="chart-size"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend} margin={{top:10,right:8,left:-18,bottom:0}}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8c2f3d" stopOpacity={.32}/><stop offset="100%" stopColor="#8c2f3d" stopOpacity={.02}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#eadfd3" strokeDasharray="4 5"/><XAxis dataKey="date" tickFormatter={v=>new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} minTickGap={28} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#816f62'}}/><YAxis tickFormatter={v=>`R$${v}`} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#816f62'}}/><Tooltip content={<ChartTooltip/>}/><Area type="monotone" dataKey="revenue" name="Faturamento" stroke="#8c2f3d" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{r:5,fill:'#8c2f3d',stroke:'#fff',strokeWidth:3}}/></AreaChart></ResponsiveContainer></div>
      </article>
      <article className="panel chart-panel">
        <div className="panel-head"><div><span className="panel-kicker">Participação</span><h2>Vendas por canal</h2></div></div>
        <div className="donut-wrap"><ResponsiveContainer width="58%" height={205}><PieChart><Pie data={data.byChannel} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>{data.byChannel.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={v=>currency(v)}/></PieChart></ResponsiveContainer><div className="chart-legend">{data.byChannel.map((item,i)=><div key={item.name}><i style={{background:COLORS[i%COLORS.length]}}/><span>{item.name}</span><strong>{currency(item.value)}</strong></div>)}</div></div>
      </article>
    </section>

    <section className="dashboard-grid lower-grid">
      <article className="panel">
        <div className="panel-head"><div><span className="panel-kicker">{data.personal?'Meu resultado':'Rentabilidade'}</span><h2>{data.personal?'Comissão por produto':'Resultado por produto'}</h2></div></div>
        <div className="chart-size small"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byProduct} layout="vertical" margin={{left:10,right:15}}><CartesianGrid horizontal={false} stroke="#eadfd3" strokeDasharray="4 5"/><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#5f4b3e'}}/><Tooltip formatter={v=>currency(v)}/><Bar dataKey="profit" name="Lucro" fill="#6f936b" radius={[0,6,6,0]} barSize={16}/></BarChart></ResponsiveContainer></div>
      </article>
      <article className="panel forecast-panel">
        <div className="panel-head"><div><span className="panel-kicker">Previsão</span><h2>{data.personal?'Minha projeção':'Ritmo de vendas'}</h2></div><div className="metric-icon caramel"><Clock3 size={19}/></div></div>
        <div className="forecast-highlight"><strong>{data.personal?currency(f.projectedEarnings30Days):(f.daysToSell>0?`${number(f.daysToSell)} dias`:'Sem estoque')}</strong><span>{data.personal?'de comissão projetada em 30 dias':'para vender o estoque atual'}</span></div>
        <div className="forecast-bar"><span style={{width:`${Math.min(100,(f.daysToSell||0)/30*100)}%`}}/></div>
        <div className="forecast-stats"><div><span>Estoque estimado</span><strong>{number(f.availableStock)} un.</strong></div><div><span>Média diária</span><strong>{number(f.dailyVelocity)} un.</strong></div><div><span>Projeção 30 dias</span><strong>{currency(f.projectedRevenue30Days)}</strong></div></div>
        <p><CakeSlice size={15}/> Previsão baseada no ritmo real dos últimos 30 dias.</p>
      </article>
      {data.role==='admin'&&<article className="panel alerts-panel">
        <div className="panel-head"><div><span className="panel-kicker">Atenção</span><h2>Estoque baixo</h2></div><TriangleAlert size={19} color="#c87846"/></div>
        {data.lowStock.length ? <div className="alert-list">{data.lowStock.map(item=><div key={item.name}><div><strong>{item.name}</strong><span>Mínimo: {number(item.min_stock)} {item.unit}</span></div><Badge tone="warning">{number(item.stock)} {item.unit}</Badge></div>)}</div> : <div className="all-good">Tudo abastecido por aqui.</div>}
      </article>}
    </section>

    {data.role!=='seller'&&<section className="panel upcoming">
      <div className="panel-head"><div><span className="panel-kicker">Agenda da cozinha</span><h2>Próximas produções</h2></div></div>
      {data.planned.length ? <div className="upcoming-grid">{data.planned.map(item=><div className="upcoming-item" key={item.id}><div className="calendar-date"><strong>{new Date(item.produced_at).getDate()}</strong><span>{new Date(item.produced_at).toLocaleDateString('pt-BR',{month:'short'})}</span></div><div><strong>{item.product_name}</strong><span>{item.producer_name || 'Sem responsável'} · {item.quantity} unidades</span></div><Badge tone={item.status==='planned'?'neutral':'warning'}>{item.status==='planned'?'Planejada':'Em produção'}</Badge></div>)}</div> : <p className="muted">Nenhuma produção futura agendada.</p>}
    </section>}
  </div>;
}
