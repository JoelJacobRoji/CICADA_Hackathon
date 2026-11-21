import { AnimatePresence, m } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { LiveEvent } from '../api/types'
import { shortId } from '../lib/format'
import { live, useLiveStatus } from '../live/live'
import { useNow } from './common'

export interface TickerItem { id: number; at: number; text: string; tone: 'info' | 'warn' | 'bad' }

const MAX = 12

/** Human text for a live event, or null for high-volume metric windows (counted, not listed). */
export function describeEvent(e: LiveEvent): Omit<TickerItem, 'id' | 'at'> | null {
  switch (e.type) {
    case 'incident':
      return {
        text: `${e.priority} incident ${e.kind === 'opened' ? 'opened' : e.status === 'resolved' ? 'resolved' : 'updated'}: ${e.title}`,
        tone: e.status === 'resolved' ? 'info' : e.priority === 'P1' ? 'bad' : 'warn',
      }
    case 'incident_ai':
      return { text: `AI explanation ${e.status === 'ok' ? 'ready' : e.status.replace(/_/g, ' ')}`, tone: 'info' }
    case 'health_transition': {
      const who = e.entity_type === 'tenant' ? 'Tenant' : e.entity_type === 'collector' ? e.entity_id : shortId(e.entity_id)
      const tone = e.to_state === 'Poor' ? 'bad' : e.to_state === 'Fair' ? 'warn' : 'info'
      return { text: `${who}: ${e.from_state ?? 'new'} → ${e.to_state}`, tone }
    }
    case 'security_summary':
      return { text: `Security counts from ${shortId(String(e.source_pid ?? ''))}`, tone: 'warn' }
    case 'heartbeat':
      return { text: `Heartbeat ${e.collector_id} · queue ${e.outbox_depth}`, tone: 'info' }
    default:
      return null
  }
}

function useLiveFeed() {
  const [items, setItems] = useState<TickerItem[]>([])
  const [pulse, setPulse] = useState(0)
  const times = useRef<number[]>([])
  const seq = useRef(0)
  useEffect(() => live.subscribe((e) => {
    const now = Date.now()
    times.current = [...times.current.filter((t) => now - t < 60_000), now]
    setPulse((p) => p + 1)
    const d = describeEvent(e)
    if (d) setItems((prev) => [{ id: ++seq.current, at: now, ...d }, ...prev].slice(0, MAX))
  }), [])
  return { items, pulse, times }
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

export function LiveTicker() {
  const status = useLiveStatus()
  const { items, pulse, times } = useLiveFeed()
  const [open, setOpen] = useState(false)
  const now = useNow(1000)
  const perMin = times.current.filter((t) => now - t < 60_000).length
  const latest = items[0]
  return (
    <div className="ticker">
      <span className={`pill live-${status}`} role="status" aria-live="polite">
        <span key={pulse} className={`live-dot${status === 'live' && pulse ? ' live-beat' : ''}`} aria-hidden="true" />
        {status === 'live' ? 'Live' : status}
        {status === 'live' && <span className="ticker-rate" title="live events received in the last minute">{perMin}/min</span>}
      </span>
      <button type="button" className="pill ticker-btn" aria-expanded={open} aria-controls="live-events"
        onClick={() => setOpen((v) => !v)} title="Recent live events">
        <span className="sr-only">Recent events: </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span key={latest?.id ?? 0} className={`ticker-text tone-${latest?.tone ?? 'info'}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}>
            {latest ? latest.text : 'Waiting for live events…'}
          </m.span>
        </AnimatePresence>
      </button>
      {open && (
        <div id="live-events" className="ticker-panel card" role="region" aria-label="Recent live events">
          {items.length === 0 ? <p className="muted small">No events yet.</p> : (
            <ol className="plain ticker-list">
              {items.map((it) => (
                <li key={it.id} className={`tone-${it.tone}`}>
                  <span className="ticker-mark" aria-hidden="true">{it.tone === 'bad' ? '✕' : it.tone === 'warn' ? '▲' : '●'}</span>
                  <span>{it.text}</span>
                  <span className="muted small">{ago(now - it.at)} ago</span>
                </li>
              ))}
            </ol>
          )}
          <p className="muted small">Metric windows are counted in the rate but not listed.</p>
        </div>
      )}
    </div>
  )
}
