import { AnimatePresence, m } from 'motion/react'
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
  const meta = META[state]
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <m.span
        key={state}
        className={`state-badge ${meta.cls} state-${size}`}
        title={`${state}: ${meta.meaning}`}
        data-state={state}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.25 }}
      >
        <span aria-hidden="true" className="state-icon">{meta.icon}</span>
        {state}
      </m.span>
    </AnimatePresence>
  )
}

export function stateMeaning(state: HealthState): string {
  return META[state].meaning
}
