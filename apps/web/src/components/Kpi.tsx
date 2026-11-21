import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Progress ring for a share (0..1). Decorative only: the same value is always written as text. */
export function Ring({ share, label }: { share: number | null; label: string }) {
  const r = 24
  const c = 2 * Math.PI * r
  const v = share == null ? 0 : Math.max(0, Math.min(1, share))
  return (
    <div className="ring">
      <svg viewBox="0 0 56 56" aria-hidden="true" focusable="false">
        <circle className="ring-track" cx="28" cy="28" r={r} />
        {share != null && v > 0 && (
          <circle className="ring-value" cx="28" cy="28" r={r} strokeDasharray={`${v * c} ${c}`} />
        )}
      </svg>
      <span className="ring-text" aria-hidden="true">{label}</span>
    </div>
  )
}

export function Kpi({ visual, label, value, sub, to, alert = false }: {
  visual: ReactNode
  label: string
  value: ReactNode
  sub?: ReactNode
  to?: string
  alert?: boolean
}) {
  const body = (
    <>
      {visual}
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </>
  )
  const cls = `kpi${alert ? ' kpi-alert' : ''}`
  // layout: tiles glide when their content or the grid reflows (live updates, resize)
  return (
    <m.div layout className="kpi-cell">
      {to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
    </m.div>
  )
}

export function pct(share: number | null): string {
  return share == null ? '—' : `${Math.round(share * 100)}%`
}
