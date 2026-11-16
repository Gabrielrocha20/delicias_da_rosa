import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { api, setSession } from '../lib/api';
import { Brand, ErrorNotice } from '../components/UI';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    try { const data = await api('/auth/login', { method: 'POST', body: form }); setSession(data); navigate('/'); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <main className="login">
    <section className="login-aside">
      <Brand subtitle="Fábrica de bolos" />
      <div>
        <h1>A fábrica inteira, do insumo ao pote vendido.</h1>
        <p>Estoque, receitas, produção, vendas e caixa no mesmo lugar, com um assistente que avisa o que comprar e o que produzir.</p>
        <div className="login-steps">
          <div><span>Insumos</span>entrada de compra, cobertura em dias e lista de compras pronta</div>
          <div><span>Produção</span>ao concluir o lote, a receita sai do estoque sozinha</div>
          <div><span>Vendas</span>comissões, parceiros e o que falta receber</div>
          <div><span>Verdade</span>para onde vai cada real, aberto para a equipe</div>
        </div>
      </div>
      <small>Doces Mivi · painel interno</small>
    </section>
    <section className="login-main">
      <form className="login-form" onSubmit={submit}>
        <div><h2>Entrar</h2></div>
        <p>Use o e-mail e a senha criados pela administração.</p>
        <ErrorNotice message={error} />
        <label className="field"><span>E-mail</span><input type="email" autoComplete="username" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required autoFocus /></label>
        <label className="field"><span>Senha</span><div className="password-input"><input type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /><button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff /> : <Eye />}</button></div></label>
        <button className="btn primary" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <>Entrar no painel <ArrowRight /></>}</button>
      </form>
    </section>
  </main>;
}
