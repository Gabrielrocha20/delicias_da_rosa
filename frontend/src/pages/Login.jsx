import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CakeSlice, Eye, EyeOff, ArrowRight, LoaderCircle, BarChart3, Sparkles } from 'lucide-react';
import { api, setSession } from '../lib/api';
import { ErrorNotice } from '../components/UI';

export default function Login() {
  const [form, setForm] = useState({ email: 'admin@rosascandy.com', password: 'admin123' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try { const data = await api('/auth/login', { method: 'POST', body: form }); setSession(data); navigate('/'); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <main className="login-page">
    <section className="login-showcase">
      <div className="login-brand"><div className="brand-mark"><CakeSlice size={25} /></div><strong>Rosa’s Candy</strong></div>
      <div className="showcase-copy">
        <span className="eyebrow light"><Sparkles size={14} /> Gestão doce, números claros</span>
        <h1>Seu negócio inteiro,<br /><em>em uma só receita.</em></h1>
        <p>Produção, custos e vendas organizados para você decidir com confiança e crescer sem perder a simplicidade.</p>
      </div>
      <div className="showcase-card">
        <div className="mini-chart"><span style={{height:'36%'}} /><span style={{height:'58%'}} /><span style={{height:'47%'}} /><span style={{height:'75%'}} /><span style={{height:'68%'}} /><span style={{height:'92%'}} /></div>
        <div><BarChart3 size={20} /><span>Faturamento este mês</span><strong>+18,4%</strong></div>
      </div>
      <small>Feito para quem transforma carinho em produto.</small>
    </section>
    <section className="login-form-wrap">
      <form className="login-form" onSubmit={submit}>
        <div className="mobile-login-logo"><div className="brand-mark"><CakeSlice /></div></div>
        <span className="eyebrow">Bem-vinda de volta</span>
        <h2>Acesse seu painel</h2>
        <p>Entre com seus dados para continuar.</p>
        <ErrorNotice message={error} />
        <label className="field"><span>E-mail</span><input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} required /></label>
        <label className="field"><span>Senha</span><div className="password-input"><input type={show?'text':'password'} value={form.password} onChange={e => setForm({...form, password:e.target.value})} required /><button type="button" onClick={() => setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
        <div className="login-hint"><span>Acesso de demonstração já preenchido</span></div>
        <button className="btn primary login-submit" disabled={loading}>{loading?<LoaderCircle className="spin" size={19}/>:<>Entrar no painel <ArrowRight size={18}/></>}</button>
      </form>
    </section>
  </main>;
}
