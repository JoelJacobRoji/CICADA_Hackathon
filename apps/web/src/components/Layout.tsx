import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import type { AiopsSummary, HealthSummary, LiveEvent } from '../api/types'
import { STATES } from '../api/types'
import { useApi } from '../api/useApi'
import { useAuth } from '../auth/auth'
import { live, useLiveStatus } from '../live/live'
import { applyTheme, storedTheme, type Theme } from '../lib/theme'
import { ShieldMark } from './Brand'
import { useNow } from './common'

type NavItem = { to: string; label: string; badge?: 'incidents' }
// Grouped like an operations console. Labels are stable (tests and the demo guide use them).
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Overview' }] },
  {
    group: 'Operations',
    items: [
      { to: '/incidents', label: 'Incident center', badge: 'incidents' },
      { to: '/infrastructure', label: 'Infrastructure' },
      { to: '/network', label: 'Network' },
      { to: '/fleet', label: 'Collector fleet' },
    ],
  },
  {
    group: 'Security & privacy',
    items: [
      { to: '/security', label: 'Security signals' },
      { to: '/trust', label: 'Security & privacy' },
      { to: '/receipts', label: 'Egress receipts' },
    ],
  },
  { group: 'Configuration', items: [{ to: '/settings', label: 'Thresholds' }] },
]

const PAGE_NAMES: [RegExp, string, string][] = [
  [/^\/incidents\/.+/, 'Operations', 'Incident detail'],
  [/^\/sources\/.+/, 'Operations', 'Source detail'],
  ...NAV.flatMap((g) =>
    g.items.map((i): [RegExp, string, string] => [new RegExp(`^${i.to}$`), g.group, i.label]),
  ),
]

// Shown on every page: where the data comes from (set at build time, never inferred).
const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE_LABEL as string | undefined

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  useEffect(() => applyTheme(theme), [theme])
  const next: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
  return (
    <button className="btn btn-ghost btn-pill" onClick={() => setTheme(next)} title="Theme: dark, light or system">
      Theme: {theme}
    </button>
  )
}

function UtcClock() {
  const now = useNow(1000)
  return (
    <span className="pill pill-mono" title="Coordinated Universal Time: every timestamp in AEGIS is UTC">
      {new Date(now).toISOString().slice(11, 19)} UTC
    </span>
  )
}

/** Live status pills: open incidents and collectors reporting, from the same APIs as the pages. */
function useHeaderStatus() {
  const aiops = useApi<AiopsSummary>('/api/v1/aiops/summary', 15000)
  const health = useApi<HealthSummary>('/api/v1/health/summary', 15000)
  const reloadA = aiops.reload
  const reloadH = health.reload
  const onEvent = useCallback(
    (e: LiveEvent) => {
      if (e.type === 'incident') reloadA()
      if (e.type === 'health_transition') reloadH()
    },
    [reloadA, reloadH],
  )
  useEffect(() => live.subscribe(onEvent), [onEvent])
  return { aiops: aiops.data, health: health.data }
}

export function Layout() {
  const { me, logout } = useAuth()
  const status = useLiveStatus()
  const { pathname } = useLocation()
  const { aiops, health } = useHeaderStatus()
  const crumb = PAGE_NAMES.find(([re]) => re.test(pathname))

  const open = aiops ? aiops.open_by_priority.P1 + aiops.open_by_priority.P2 + aiops.open_by_priority.P3 : null
  const p1 = aiops?.open_by_priority.P1 ?? 0
  const col = health?.counts.collector
  const colTotal = col ? STATES.reduce((a, k) => a + col[k], 0) : 0
  const colUp = col ? colTotal - col.Poor : 0

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ShieldMark /></span>
          <span>
            <span className="brand-name">AEGIS</span>
            <span className="brand-sub">Privacy-first observability</span>
          </span>
        </div>
        <nav aria-label="Main">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-group-label">{g.group}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'}
                  className={({ isActive }) => `nav-item${isActive ? ' nav-active' : ''}`}>
                  <span>{n.label}</span>
                  {n.badge === 'incidents' && open ? (
                    <span className="nav-badge" title={`${open} open incident(s)`}>{open}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <nav aria-label="Breadcrumb" className="crumbs">
              {crumb && crumb[1] !== crumb[2] && (
                <>
                  <span>{crumb[1]}</span>
                  <span aria-hidden="true">/</span>
                </>
              )}
              <strong>{crumb?.[2] ?? 'AEGIS'}</strong>
            </nav>
            <span className="chip" title="Your tenant (from your session)">tenant · {me?.tenant}</span>
            <span className="chip" title="Data residency region for this tenant">region · {me?.region}</span>
          </div>
          <div className="topbar-right">
            {open !== null && (
              <Link to="/incidents"
                className={`pill ${p1 ? 'pill-critical' : open ? 'pill-serious' : 'pill-good'}`}
                title="Open incidents (all priorities)">
                <span className="pill-dot" aria-hidden="true" />
                {open === 0 ? 'No open incidents' : p1 ? `${p1} P1 · ${open} open` : `${open} open incident${open > 1 ? 's' : ''}`}
              </Link>
            )}
            {col && colTotal > 0 && (
              <Link to="/fleet" className={`pill ${colUp === colTotal ? 'pill-good' : 'pill-critical'}`}
                title="Collectors reporting (offline = no heartbeat for more than 30 s)">
                <span className="pill-dot" aria-hidden="true" />
                {colUp}/{colTotal} collectors
              </Link>
            )}
            <span className={`pill live-${status}`} role="status" aria-live="polite">
              <span className="live-dot" aria-hidden="true" /> {status === 'live' ? 'Live' : status}
            </span>
            <UtcClock />
            <ThemeToggle />
            <span className="muted">{me?.role.replace('tenant_', '')}</span>
            <button className="btn btn-ghost btn-pill" onClick={() => void logout()}>Sign out</button>
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
