import { useEffect, useState, type ReactNode } from 'react'
import type { Reason } from '../api/types'
import { ago, describeReason, local, utc } from '../lib/format'

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** Relative time that keeps ticking; the exact UTC + local time is in the tooltip. */
export function TimeAgo({ iso }: { iso: string | null | undefined }) {
  const now = useNow()
  return (
    <time dateTime={iso ?? undefined} title={iso ? `${utc(iso)} · local ${local(iso)}` : undefined}>
      {ago(iso, now)}
    </time>
  )
}

export function Card({ title, actions, children, className = '' }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <p className="muted" role="status">{label}…</p>
}

export function ErrorNote({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span>Couldn't load: {error.message}</span>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Reasons({ reasons }: { reasons: Reason[] }) {
  const shown = reasons.filter((r) => r.code !== 'WORST_OF_MEMBERS')
  if (shown.length === 0) return <p className="muted">All factors within expected range.</p>
  return (
    <ul className="reasons">
      {shown.map((r, i) => (
        <li key={i}>
          <span className="reason-code">{r.code}</span>
          <span>{describeReason(r)}</span>
        </li>
      ))}
    </ul>
  )
}

export function StatTile({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
