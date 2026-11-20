import type { Priority } from '../api/types'

// Priority is a ranking heuristic (not a probability). Never colour alone: icon + label.
const META: Record<Priority, { icon: string; cls: string; meaning: string }> = {
  P1: { icon: '✕', cls: 'prio-p1', meaning: 'Act now: high impact or security' },
  P2: { icon: '▲', cls: 'prio-p2', meaning: 'Act soon: degradation with corroboration' },
  P3: { icon: '●', cls: 'prio-p3', meaning: 'Watch: early or single signal' },
}

export function PriorityBadge({ p }: { p: Priority }) {
  const m = META[p]
  return (
    <span className={`state-badge state-sm ${m.cls}`} title={`${p}: ${m.meaning}`} data-priority={p}>
      <span aria-hidden="true" className="state-icon">{m.icon}</span>
      {p}
    </span>
  )
}

export function StatusPill({ status, acked }: { status: string; acked?: boolean }) {
  return (
    <span className={`chip ${status === 'open' ? 'chip-degraded' : 'chip-ok'}`}>
      {status === 'open' ? (acked ? 'Open · acknowledged' : 'Open') : 'Resolved'}
    </span>
  )
}

export const STRENGTH_ICON: Record<string, string> = { High: '■', Medium: '◧', Low: '□' }
