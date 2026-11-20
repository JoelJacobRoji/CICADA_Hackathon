import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import { useLiveStatus } from '../live/live'

const NAV: { to: string; label: string; phase?: string }[] = [
  { to: '/', label: 'Overview' },
  { to: '/fleet', label: 'Collector fleet' },
  { to: '/infrastructure', label: 'Infrastructure' },
  { to: '/network', label: 'Network' },
  { to: '/security', label: 'Security signals' },
  { to: '/incidents', label: 'Incident center' },
  { to: '/trust', label: 'Security & privacy' },
  { to: '/privacy', label: 'Privacy glass', phase: 'Phase 8' },
  { to: '/regions', label: 'Regional operations', phase: 'later' },
  { to: '/settings', label: 'Thresholds' },
]

// Shown on every page: where the data comes from (set at build time, never inferred).
const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE_LABEL as string | undefined

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('aegis-theme') ?? 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('aegis-theme', theme)
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
  }, [theme])
  const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
  return (
    <button className="btn btn-ghost" onClick={() => setTheme(next)} title="Theme: system, light or dark">
      Theme: {theme}
    </button>
  )
}

export function Layout() {
  const { me, logout } = useAuth()
  const status = useLiveStatus()
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">◆</span> AEGIS
        </div>
        <nav aria-label="Main">
          {NAV.map((n) =>
            n.phase ? (
              <span key={n.to} className="nav-item nav-disabled" title={`Available in ${n.phase}`}>
                {n.label} <small>{n.phase}</small>
              </span>
            ) : (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' nav-active' : ''}`}>
                {n.label}
              </NavLink>
            ),
          )}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <span className="chip" title="Your tenant (from your session)">tenant · {me?.tenant}</span>
            <span className="chip" title="Data residency region for this tenant">region · {me?.region}</span>
            <span className={`chip live-${status}`} role="status" aria-live="polite">
              <span className="live-dot" aria-hidden="true" /> {status === 'live' ? 'Live' : status}
            </span>
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <span className="muted">{me?.role.replace('tenant_', '')}</span>
            <button className="btn btn-ghost" onClick={() => void logout()}>Sign out</button>
          </div>
        </header>
        {DATA_SOURCE && (
          <div className="data-banner" role="note">
            Data source: <strong>{DATA_SOURCE}</strong>
          </div>
        )}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
