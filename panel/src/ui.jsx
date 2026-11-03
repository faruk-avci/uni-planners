import { useEffect, useState } from 'react'

const ICONS = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  settings: <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="8" cy="18" r="2" fill="currentColor" /></>,
  survey: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></>,
  results: <><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="5" /><line x1="18" y1="20" x2="18" y2="14" /></>,
  curricula: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  analytics: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>,
  activity: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  traffic: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></>,
}

export function Icon({ name, size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {children && <div className="page-header-actions">{children}</div>}
    </header>
  )
}

export function Notice({ notice, onClose }) {
  if (!notice) return null
  return <div className={`alert alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}<button onClick={onClose} aria-label="Kapat">×</button></div>
}

export function Section({ icon, title, description, aside, children, className = '' }) {
  return (
    <section className={`content-card ${className}`}>
      <div className="section-heading">
        <div>{icon && <span className="step-number neutral"><Icon name={icon} size={15} /></span>}<div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export const ROLE_LABELS = { editor: 'Düzenleyici', viewer: 'Görüntüleyici', superadmin: 'Süper yönetici' }

export function RoleBadge({ role }) {
  if (!role) return null
  return <span className={`role-badge role-${role}`}>{ROLE_LABELS[role] || role}</span>
}

export function ReadOnlyNote({ role }) {
  if (role === 'editor') return null
  return <div className="readonly-note"><Icon name="shield" size={15} />Bu üniversitede görüntüleme yetkiniz var; değişiklik yapamazsınız.</div>
}

// Loads `load()` on mount and whenever `deps` change.
export function useLoad(load, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const reload = () => {
    setState(current => ({ ...current, loading: true, error: '' }))
    return load()
      .then(data => setState({ data, error: '', loading: false }))
      .catch(error => setState(current => ({ ...current, error: error.message, loading: false })))
  }
  useEffect(() => { reload() }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload, setData: data => setState(current => ({ ...current, data: typeof data === 'function' ? data(current.data) : data })) }
}

export function CopyField({ value, label }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked: the field stays selectable */ }
  }
  return (
    <div className="copy-field">
      {label && <span>{label}</span>}
      <div><input readOnly value={value} onFocus={event => event.target.select()} /><button type="button" className="secondary-button" onClick={copy}>{copied ? 'Kopyalandı' : 'Kopyala'}</button></div>
    </div>
  )
}
