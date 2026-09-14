import { X, Search, LoaderCircle, Inbox, Trash2, Pencil, AlertCircle } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, action }) {
  return <header className="page-header">
    <div>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {action}
  </header>;
}

export function Modal({ open, title, subtitle, children, onClose, wide = false }) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
      <div className="modal-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      </div>
      {children}
    </section>
  </div>;
}

export function Field({ label, hint, children, span = false }) {
  return <label className={`field ${span ? 'field-span' : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>;
}

export function SearchBox({ value, onChange, placeholder = 'Buscar...' }) {
  return <label className="search-box"><Search size={17} /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

export function Loading() {
  return <div className="state-box"><LoaderCircle className="spin" size={28} /><span>Carregando dados...</span></div>;
}

export function Empty({ title = 'Nada por aqui ainda', text = 'Cadastre o primeiro item para começar.' }) {
  return <div className="state-box empty"><Inbox size={30} /><strong>{title}</strong><span>{text}</span></div>;
}

export function ErrorNotice({ message }) {
  if (!message) return null;
  return <div className="error-notice"><AlertCircle size={17} />{message}</div>;
}

export function Actions({ onEdit, onDelete }) {
  return <div className="row-actions">
    {onEdit && <button className="icon-btn" onClick={onEdit} title="Editar"><Pencil size={16} /></button>}
    {onDelete && <button className="icon-btn danger" onClick={onDelete} title="Excluir"><Trash2 size={16} /></button>}
  </div>;
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Confirm({ open, title, text, onCancel, onConfirm }) {
  return <Modal open={open} title={title} onClose={onCancel}>
    <p className="confirm-text">{text}</p>
    <div className="modal-actions"><button className="btn ghost" onClick={onCancel}>Cancelar</button><button className="btn danger-btn" onClick={onConfirm}>Confirmar</button></div>
  </Modal>;
}
