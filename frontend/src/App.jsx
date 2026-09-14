import { useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PackageOpen, CakeSlice, UsersRound, CookingPot, ShoppingBag, LogOut, Menu, X, ChevronDown, Building2, KeyRound, Scale } from 'lucide-react';
import { clearSession, getStoredUser, getToken } from './lib/api';
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

const nav = [
  ['/', 'Minha visão', LayoutDashboard, ['admin','seller','producer']],
  ['/produtos', 'Produtos & custos', CakeSlice, ['admin']],
  ['/insumos', 'Insumos', PackageOpen, ['admin']],
  ['/equipe', 'Equipe', UsersRound, ['admin']],
  ['/acessos', 'Acessos', KeyRound, ['admin']],
  ['/parceiros', 'Parceiros', Building2, ['admin']],
  ['/producao', 'Produção', CookingPot, ['admin','producer']],
  ['/vendas', 'Vendas', ShoppingBag, ['admin','seller']],
  ['/verdade', 'Página da Verdade', Scale, ['admin','seller','producer']],
];

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}>
    <div className="brand-mark"><CakeSlice size={23} /></div>
    {!compact && <div><strong>Rosa’s Candy</strong><span>gestão que dá gosto</span></div>}
  </div>;
}

function Layout() {
  const [menu, setMenu] = useState(false);
  const user = getStoredUser();
  const navigate = useNavigate();
  const logout = () => { clearSession(); navigate('/login'); };

  return <div className="app-shell">
    <aside className={`sidebar ${menu ? 'open' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="mobile-close icon-btn" onClick={() => setMenu(false)}><X /></button></div>
      <nav>{nav.filter(([, , , roles])=>roles.includes(user?.role)).map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenu(false)}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-foot">
        <div className="user-card"><div className="avatar">{user?.name?.slice(0, 2).toUpperCase() || 'RC'}</div><div><strong>{user?.name || 'Admin'}</strong><span>{{admin:'Administrador',seller:'Vendedor',producer:'Produtor'}[user?.role]||'Usuário'}</span></div><ChevronDown size={15} /></div>
        <button className="logout" onClick={logout}><LogOut size={17} /> Sair da conta</button>
      </div>
    </aside>
    {menu && <div className="sidebar-overlay" onClick={() => setMenu(false)} />}
    <main className="main-area">
      <div className="mobile-bar"><button className="icon-btn" onClick={() => setMenu(true)}><Menu /></button><Brand compact /><span /></div>
      <Outlet />
    </main>
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
      <Route path="produtos" element={<RoleRoute roles={['admin']}><Products /></RoleRoute>} />
      <Route path="insumos" element={<RoleRoute roles={['admin']}><Ingredients /></RoleRoute>} />
      <Route path="equipe" element={<RoleRoute roles={['admin']}><People /></RoleRoute>} />
      <Route path="acessos" element={<RoleRoute roles={['admin']}><Accesses /></RoleRoute>} />
      <Route path="parceiros" element={<RoleRoute roles={['admin']}><Establishments /></RoleRoute>} />
      <Route path="producao" element={<RoleRoute roles={['admin','producer']}><Production /></RoleRoute>} />
      <Route path="vendas" element={<RoleRoute roles={['admin','seller']}><Sales /></RoleRoute>} />
      <Route path="verdade" element={<Transparency />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
