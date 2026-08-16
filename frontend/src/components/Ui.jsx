import { Link } from 'react-router-dom'
import { useState } from 'react'

export function PageHeader({ title, subtitle, action, children }) { return <div className="page-header d-flex flex-wrap justify-content-between align-items-start gap-3"><div><h1>{title}</h1>{subtitle && <p className="mb-0 text-secondary">{subtitle}</p>}</div><div className="d-flex gap-2">{children}{action}</div></div> }
export function StatusBadge({ value }) { const n = String(value).toLowerCase(); const type = n.includes('solved') || n.includes('completed') || n.includes('active') || n.includes('high') || n.includes('identified') ? 'success' : n.includes('pending') || n.includes('medium') || n.includes('review') || n.includes('awaiting') ? 'warning' : n.includes('closed') || n.includes('inactive') || n.includes('low') ? 'secondary' : 'primary'; return <span className={`badge text-bg-${type} status-badge`}>{value}</span> }
export function MetricCard({ label, value, hint, tone = 'primary' }) { return <div className="card metric-card h-100"><div className="card-body"><div className={`metric-mark ${tone}`}>{tone === 'success' ? '✓' : tone === 'warning' ? '!' : '•'}</div><p className="text-secondary small mb-1">{label}</p><h2>{value}</h2>{hint && <small className="text-secondary">{hint}</small>}</div></div> }
export function SearchFilters({ children, onSearchChange, onClear }) {
  const [query, setQuery] = useState('')
  const clear = () => { setQuery(''); onSearchChange?.(''); onClear?.() }
  return <div className="card mb-4"><div className="card-body"><div className="row g-3 align-items-end"><div className="col-md-5"><label className="form-label">Search</label><input value={query} onChange={e => { setQuery(e.target.value); onSearchChange?.(e.target.value) }} className="form-control" placeholder="Search records..." /></div>{children}<div className="col-md-auto"><button type="button" onClick={clear} className="btn btn-outline-secondary w-100">Clear</button></div></div></div></div>
}
export function TableAction({ to, label = 'View' }) { return <Link className="btn btn-sm btn-outline-primary" to={to}>{label}</Link> }
