import NumberFlow from '@number-flow/react'
import { domAnimation, LazyMotion, m, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

// One small motion runtime for the whole app (LazyMotion + domAnimation keeps the bundle lean).
// reducedMotion="user": with prefers-reduced-motion, transforms/layout animations are disabled and
// only opacity changes remain (CSS animations are switched off in index.css as well).
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

/** Fades and lifts a page in on every route change (keyed by the caller). */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <m.div className="page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </m.div>
  )
}

/** Animated number with a plain-text twin for screen readers and tests (the animated digits are
 * decorative; the value is always present as text). */
export function AnimatedNumber({ value, suffix = '', prefix = '', decimals }: {
  value: number
  suffix?: string
  prefix?: string
  decimals?: number
}) {
  const text = `${prefix}${decimals !== undefined ? value.toFixed(decimals) : value}${suffix}`
  return (
    <span className="anum">
      <span aria-hidden="true" className="anum-flow">
        <NumberFlow value={value} prefix={prefix} suffix={suffix}
          format={decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : undefined} />
      </span>
      <span className="sr-only">{text}</span>
    </span>
  )
}

/** "a/b" with both parts animated. */
export function AnimatedFraction({ num, den }: { num: number; den: number }) {
  return (
    <span className="anum">
      <span aria-hidden="true" className="anum-flow">
        <NumberFlow value={num} />/<NumberFlow value={den} />
      </span>
      <span className="sr-only">{`${num}/${den}`}</span>
    </span>
  )
}
