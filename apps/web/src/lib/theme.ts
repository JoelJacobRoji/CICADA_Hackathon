import { useEffect, useState } from 'react'

// Theme: 'dark' (default), 'light' or 'system'. Applied as <html data-theme> before React renders
// (main.tsx), because the strict CSP forbids an inline <script> in index.html.
export type Theme = 'dark' | 'light' | 'system'
const KEY = 'aegis-theme'

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* storage unavailable: the theme still applies for this session */
  }
}

/** Changes whenever the effective theme changes (toggle or OS preference), for canvas/SVG charts
 * that read colours from CSS tokens and must repaint. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const bump = () => setV((x) => x + 1)
    const mo = new MutationObserver(bump)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener?.('change', bump)
    return () => {
      mo.disconnect()
      mq?.removeEventListener?.('change', bump)
    }
  }, [])
  return v
}
