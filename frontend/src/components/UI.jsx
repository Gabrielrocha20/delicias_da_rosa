import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, LoaderCircle, MoreHorizontal, Pencil, Search, Trash2, TriangleAlert, X } from 'lucide-react';

/* Marca: um pote de bolo visto de lado — tampa, camadas e a cereja do "i" de Mivi. */
export function BrandMark({ size = 28 }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect x="5" y="9" width="22" height="20" rx="5" fill="#a3324a" />
    <rect x="4" y="6" width="24" height="5" rx="2.5" fill="#231c1a" />
    <path d="M5 17.5c3.7 2 7.3 2 11 0s7.3-2 11 0" stroke="#f8eaed" strokeWidth="2.2" fill="none" />
    <path d="M5 23c3.7 2 7.3 2 11 0s7.3-2 11 0" stroke="#f8eaed" strokeWidth="2.2" fill="none" opacity=".7" />
    <circle cx="22" cy="3.6" r="2.6" fill="#a3324a" />
  </svg>;
}

export function Brand({ subtitle = 'Fábrica de bolos' }) {
  return <div className="brand"><BrandMark /><div><strong>Doces Mivi</strong><span>{subtitle}</span></div></div>;
}

export function PageHeader({ title, description, actions }) {
  return <header className="page-header">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="header-actions">{actions}</div>}
  </header>;
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = overflow; };
  }, [open, onClose]);
}

/* Modal com cabeçalho, corpo rolável e rodapé fixo. Quando `onSubmit` existe, vira um <form>. */
export function Modal({ open, title, subtitle, children, footer, onClose, onSubmit, wide = false }) {
  useEscape(open, onClose);
  if (!open) return null;
  const Body = onSubmit ? 'form' : 'div';
  return <div className="overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <Body className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit} noValidate={false}>
      <div className="modal-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X /></button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </Body>
  </div>;
}

export function Drawer({ open, title, subtitle, children, footer, onClose }) {
  useEscape(open, onClose);
  if (!open) return null;
  return <>
    <div className="drawer-overlay" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X /></button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </aside>
  </>;
}

export function Field({ label, hint, children, span = false }) {
  return <label className={`field ${span ? 'field-span' : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>;
}

export function SearchBox({ value, onChange, placeholder = 'Buscar' }) {
  return <label className="search-box"><Search aria-hidden="true" /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>;
}

export function Loading({ rows = 4, label = 'Carregando' }) {
  return <div className="skeleton-rows" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }, (_, index) => <span key={index} className="skeleton" style={{ width: `${88 - index * 9}%` }} />)}
  </div>;
}

export function Spinner({ label = 'Carregando' }) {
  return <div className="loading-line"><LoaderCircle className="spin" size={16} />{label}</div>;
}

export function Empty({ title = 'Nada por aqui ainda', text, action }) {
  return <div className="empty"><strong>{title}</strong>{text && <span>{text}</span>}{action}</div>;
}

const noticeIcons = { error: AlertCircle, warn: TriangleAlert, info: Info, ok: CheckCircle2 };
export function Notice({ tone = 'info', children }) {
  if (!children) return null;
  const Icon = noticeIcons[tone];
  return <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : undefined}><Icon /><span>{children}</span></div>;
}

export function ErrorNotice({ message }) {
  return message ? <Notice tone="error">{message}</Notice> : null;
}

export function Actions({ onEdit, onDelete, editLabel = 'Editar', deleteLabel = 'Excluir' }) {
  return <div className="row-actions" onClick={event => event.stopPropagation()}>
    {onEdit && <button type="button" className="icon-btn" onClick={onEdit} title={editLabel} aria-label={editLabel}><Pencil /></button>}
    {onDelete && <button type="button" className="icon-btn danger" onClick={onDelete} title={deleteLabel} aria-label={deleteLabel}><Trash2 /></button>}
  </div>;
}

export function RowMenu({ items, label = 'Mais ações' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return <div className="menu" ref={ref} onClick={event => event.stopPropagation()}>
    <button type="button" className="icon-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal /></button>
    {open && <div className="menu-pop" role="menu">
      {items.filter(Boolean).map(({ label: text, icon: Icon, onClick, danger }) => <button type="button" role="menuitem" key={text} className={danger ? 'danger' : ''} onClick={() => { setOpen(false); onClick(); }}>{Icon && <Icon />}{text}</button>)}
    </div>}
  </div>;
}

export function Pill({ tone = 'neutral', dot = false, children }) {
  return <span className={`pill ${tone}`}>{dot && <i className="dot" />}{children}</span>;
}
export const Badge = Pill;

export function Confirm({ open, title, text, confirmLabel = 'Confirmar', onCancel, onConfirm, danger = true }) {
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } };
  return <Modal open={open} title={title} onClose={onCancel} footer={<>
    <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
    <button type="button" className={`btn ${danger ? 'danger-solid' : 'primary'}`} onClick={run} disabled={busy}>{busy ? 'Aguarde…' : confirmLabel}</button>
  </>}>
    <p className="muted">{text}</p>
  </Modal>;
}

export function Segmented({ options, value, onChange, label }) {
  return <div className="segmented" role="tablist" aria-label={label}>
    {options.map(([key, text]) => <button type="button" role="tab" aria-selected={value === key} key={key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}

export function CountCards({ items, value, onChange }) {
  return <div className="count-cards" style={{ '--count': items.length }} role="tablist">
    {items.map(item => <button type="button" role="tab" aria-selected={value === item.key} key={item.key}
      className={`count-card ${value === item.key ? 'active' : ''} ${item.alert && item.count > 0 ? 'alert' : ''}`} onClick={() => onChange(item.key)}>
      <span>{item.label}</span><strong>{item.count}</strong>
    </button>)}
  </div>;
}

export function Kpi({ label, value, unit, note, lead = false, active, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} className={`kpi ${lead ? 'kpi-lead' : ''} ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={onClick ? !!active : undefined}>
    <span className="kpi-label">{label}</span>
    <span className="kpi-value">{value}{unit && <small>{unit}</small>}</span>
    {note && <span className="kpi-note">{note}</span>}
  </Tag>;
}

export function KpiStrip({ children }) {
  const count = Array.isArray(children) ? children.filter(Boolean).length : 1;
  return <section className={`kpi-strip ${count % 2 ? 'odd' : ''}`} style={{ '--kpis': count }}>{children}</section>;
}

export function Meter({ value, max, tick, tone = '' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return <div className={`meter ${tone}`} role="img" aria-label={`${Math.round(ratio * 100)}%`}>
    <i style={{ width: `${ratio * 100}%` }} />
    {tick != null && max > 0 && <span className="tick" style={{ left: `${Math.min(100, (tick / max) * 100)}%` }} />}
  </div>;
}

/* Tons pálidos estáveis por pessoa: identidade, não dado. */
const hues = [[350, '#f6e6ea', '#6e2033'], [210, '#e6eef8', '#1f3f66'], [150, '#e3f3ea', '#174d33'], [35, '#f8eddc', '#6b4410'], [270, '#efe8f5', '#4a2d66'], [190, '#e2f2f4', '#15505a']];
export function Avatar({ name = '', id = 0 }) {
  const [, bg, ink] = hues[Math.abs(Number(id) || name.length) % hues.length];
  const initials = name.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '·';
  return <span className="thumb" style={{ '--hue-bg': bg, '--hue-ink': ink }} aria-hidden="true">{initials}</span>;
}

/* ---------- Toasts ---------- */
const listeners = new Set();
export function toast(message, tone = 'ok') {
  listeners.forEach(listener => listener({ id: Date.now() + Math.random(), message, tone }));
}
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const add = item => {
      setItems(current => [...current, item]);
      setTimeout(() => setItems(current => current.filter(row => row.id !== item.id)), 3200);
    };
    listeners.add(add);
    return () => listeners.delete(add);
  }, []);
  return <div className="toast-stack" aria-live="polite">
    {items.map(item => <div key={item.id} className={`toast ${item.tone}`}>{item.tone === 'error' ? <AlertCircle /> : <CheckCircle2 />}{item.message}</div>)}
  </div>;
}
