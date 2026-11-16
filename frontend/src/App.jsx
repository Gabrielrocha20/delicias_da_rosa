import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Building2, CakeSlice, ChevronRight, CookingPot, KeyRound, LayoutDashboard, LogOut, Menu, PackageOpen, Scale, ShoppingBag, Sparkles, UsersRound, Wallet } from 'lucide-react';
import { getStoredUser, getToken, logout } from './lib/api';
import { Avatar, Brand, Toasts } from './components/UI';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Ingredients from './pages/Ingredients';
import Products from './pages/Products';
import People from './pages/People';
import Production from './pages/Production';
import Sales from './pages/Sales';
import Accesses from './pages/Accesses';
import Establishments from './pages/Establishments';
import Transparency from './pages/Transparency';
import CashFlow from './pages/CashFlow';
import Assistant from './pages/Assistant';

const ALL = ['admin', 'seller', 'producer'];
export const navGroups = [
  ['Dia a dia', [
    ['/', 'Visão geral', LayoutDashboard, ALL],
    ['/assistente', 'Assistente', Sparkles, ALL],
    ['/vendas', 'Vendas', ShoppingBag, ['admin', 'seller']],
    ['/producao', 'Produção', CookingPot, ['admin', 'producer']],
  ]],
  ['Cadastros', [
    ['/insumos', 'Insumos', PackageOpen, ['admin']],
    ['/produtos', 'Produtos e receitas', CakeSlice, ['admin']],
    ['/parceiros', 'Parceiros', Building2, ['admin']],
    ['/equipe', 'Equipe', UsersRound, ['admin']],
    ['/acessos', 'Acessos', KeyRound, ['admin']],
  ]],
  ['Dinheiro', [
    ['/caixa', 'Entradas e saídas', Wallet, ['admin']],
    ['/verdade', 'Página da Verdade', Scale, ALL],
  ]],
];
const roleNames = { admin: 'Administrador', seller: 'Vendedor', producer: 'Produtor' };

function Layout() {
  const [menu, setMenu] = useState(false);
  const user = getStoredUser();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { setMenu(false); }, [location.pathname]);
  const groups = navGroups
    .map(([label, links]) => [label, links.filter(([, , , roles]) => roles.includes(user?.role))])
    .filter(([, links]) => links.length);
  const flat = groups.flatMap(([, links]) => links);
  const current = flat.find(([to]) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)));
  const mobile = ['/', '/vendas', '/producao', '/insumos', '/assistente'].map(path => flat.find(([to]) => to === path)).filter(Boolean).slice(0, 4);
  const exit = async () => { await logout(); navigate('/login'); };

  return <div className="app-shell">
    <aside className={`sidebar ${menu ? 'open' : ''}`} aria-label="Menu principal">
      <Brand />
      <nav>
        {groups.map(([label, links]) => <div className="nav-group" key={label}>
          <span className="nav-group-label">{label}</span>
          {links.map(([to, text, Icon]) => <NavLink key={to} to={to} end={to === '/'} className="nav-link"><Icon aria-hidden="true" /><span>{text}</span></NavLink>)}
        </div>)}
      </nav>
      <div className="sidebar-foot">
        <div className="user-row">
          <Avatar name={user?.name} id={user?.id} />
          <div><strong>{user?.name || 'Usuário'}</strong><span>{roleNames[user?.role] || ''}</span></div>
          <button type="button" className="icon-btn" onClick={exit} title="Sair" aria-label="Sair da conta"><LogOut /></button>
        </div>
      </div>
    </aside>
    {menu && <div className="sidebar-scrim" onClick={() => setMenu(false)} />}
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu /></button>
      <div className="crumbs"><span className="hide-phone">Doces Mivi</span><ChevronRight size={14} className="hide-phone" aria-hidden="true" /><strong>{current?.[1] || 'Início'}</strong></div>
      <div className="topbar-actions">
        {location.pathname !== '/assistente' && <NavLink to="/assistente" className="btn ghost small" aria-label="Perguntar ao assistente"><Sparkles /><span>Perguntar ao assistente</span></NavLink>}
      </div>
    </header>
    <main className="sheet"><Outlet /></main>
    <nav className="tabbar" aria-label="Atalhos">
      {mobile.map(([to, text, Icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon aria-hidden="true" /><span>{text.split(' ')[0]}</span></NavLink>)}
      <button type="button" onClick={() => setMenu(true)}><Menu aria-hidden="true" /><span>Menu</span></button>
    </nav>
    <Toasts />
  </div>;
}

function PrivateRoute() {
  return getToken() ? <Layout /> : <Navigate to="/login" replace />;
}

function RoleRoute({ roles, children }) {
  return roles.includes(getStoredUser()?.role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={getToken() ? <Navigate to="/" replace /> : <Login />} />
    <Route element={<PrivateRoute />}>
      <Route index element={<Dashboard />} />
      <Route path="assistente" element={<Assistant />} />
      <Route path="produtos" element={<RoleRoute roles={['admin']}><Products /></RoleRoute>} />
      <Route path="insumos" element={<RoleRoute roles={['admin']}><Ingredients /></RoleRoute>} />
      <Route path="equipe" element={<RoleRoute roles={['admin']}><People /></RoleRoute>} />
      <Route path="acessos" element={<RoleRoute roles={['admin']}><Accesses /></RoleRoute>} />
      <Route path="parceiros" element={<RoleRoute roles={['admin']}><Establishments /></RoleRoute>} />
      <Route path="caixa" element={<RoleRoute roles={['admin']}><CashFlow /></RoleRoute>} />
      <Route path="producao" element={<RoleRoute roles={['admin', 'producer']}><Production /></RoleRoute>} />
      <Route path="vendas" element={<RoleRoute roles={['admin', 'seller']}><Sales /></RoleRoute>} />
      <Route path="verdade" element={<Transparency />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
