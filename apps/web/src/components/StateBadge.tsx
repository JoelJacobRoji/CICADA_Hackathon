import type { HealthState } from '../api/types'

// A state is NEVER conveyed by color alone: each has a distinct icon shape + its text label.
const META: Record<HealthState, { icon: string; cls: string; meaning: string }> = {
  Excellent: { icon: '✓', cls: 'state-excellent', meaning: 'Healthy, within expected range' },
  Good: { icon: '●', cls: 'state-good', meaning: 'Minor deviation, no significant impact' },
  Fair: { icon: '▲', cls: 'state-fair', meaning: 'Needs attention' },
  Poor: { icon: '✕', cls: 'state-poor', meaning: 'Critical: unavailable, severe or missing data' },
}

export function StateBadge({ state, size = 'md' }: { state: HealthState | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  if (!state) {
    return <span className="state-badge state-unknown">… pending</span>
  }
  const m = META[state]
  return (
    <span
      className={`state-badge ${m.cls} state-${size}`}
      title={`${state}: ${m.meaning}`}
      data-state={state}
    >
      <span aria-hidden="true" className="state-icon">{m.icon}</span>
      {state}
    </span>
  )
}

export function stateMeaning(state: HealthState): string {
  return META[state].meaning
}
