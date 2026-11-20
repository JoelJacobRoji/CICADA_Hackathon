// Tenant-scoped live stream (WebSocket). The server derives the tenant from the session cookie;
// the client never names a tenant. Reconnects with capped exponential backoff.
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LiveEvent } from '../api/types'

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

type Listener = (e: LiveEvent) => void

class LiveStream {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private statusListeners = new Set<() => void>()
  private attempt = 0
  private stopped = true
  private timer: ReturnType<typeof setTimeout> | null = null
  status: LiveStatus = 'offline'
  lastEventAt: number | null = null

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.ws?.close()
    this.ws = null
    this.setStatus('offline')
  }

  private connect() {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/api/v1/ws`)
    this.ws = ws
    ws.onopen = () => {
      this.attempt = 0
      this.setStatus('live')
    }
    ws.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as LiveEvent
        this.lastEventAt = Date.now()
        this.listeners.forEach((l) => l(ev))
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => {
      this.ws = null
      if (this.stopped) return
      this.attempt += 1
      this.setStatus('reconnecting')
      const delay = Math.min(15000, 500 * 2 ** Math.min(this.attempt, 5))
      this.timer = setTimeout(() => this.connect(), delay)
    }
  }

  private setStatus(s: LiveStatus) {
    this.status = s
    this.statusListeners.forEach((l) => l())
  }

  subscribe(l: Listener) {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  subscribeStatus = (l: () => void) => {
    this.statusListeners.add(l)
    return () => {
      this.statusListeners.delete(l)
    }
  }

  getStatus = () => this.status
}

export const live = new LiveStream()

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(live.subscribeStatus, live.getStatus, live.getStatus)
}

/** Subscribe to live events (optionally filtered). Handler identity may change freely. */
export function useLiveEvents(handler: Listener, filter?: (e: LiveEvent) => boolean) {
  const [, force] = useState(0)
  useEffect(() => {
    return live.subscribe((e) => {
      if (!filter || filter(e)) {
        handler(e)
        force((n) => n + 1)
      }
    })
  }, [handler, filter])
}
