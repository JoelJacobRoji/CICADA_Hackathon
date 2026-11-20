import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './auth/auth'
import { StateBadge } from './components/StateBadge'
import { ago, describeReason, fmtValue } from './lib/format'
import { Login } from './pages/Login'
import { Overview } from './pages/Overview'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k))
    if (!key) return new Response('{"detail":"not found"}', { status: 404 })
    const body = routes[key]
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('StateBadge', () => {
  it.each(['Excellent', 'Good', 'Fair', 'Poor'] as const)('%s has icon + text label, not color alone', (s) => {
    render(<StateBadge state={s} />)
    const badge = screen.getByText(s)
    expect(badge).toHaveAttribute('data-state', s)
    expect(badge.querySelector('.state-icon')?.textContent).toBeTruthy()
    expect(badge).toHaveAttribute('title', expect.stringContaining(s))
  })
  it('distinct icons per state', () => {
    const icons = (['Excellent', 'Good', 'Fair', 'Poor'] as const).map((s) => {
      const { container } = render(<StateBadge state={s} />)
      return container.querySelector('.state-icon')!.textContent
    })
    expect(new Set(icons).size).toBe(4)
  })
})

describe('format', () => {
  it('explains every engine reason in plain language', () => {
    expect(describeReason({ code: 'CPU_USAGE_FAIR', metric: 'cpu_usage', observed: 91, threshold: 85, unit: 'percent' }))
      .toBe('CPU 91.0% is above the fair threshold of 85.0%')
    expect(describeReason({ code: 'SERVICE_UP_POOR', metric: 'service_up', observed: 0, threshold: 0, unit: 'bool' }))
      .toBe('Service availability is down in the latest window')
    expect(describeReason({ code: 'NO_DATA', seconds_since_data: 32.7, threshold_s: 30 })).toContain('No data for 32.7 s')
    expect(describeReason({ code: 'HEARTBEAT_MISSING', seconds_since_heartbeat: 41, threshold_s: 30 })).toContain('offline')
    expect(describeReason({ code: 'PENDING_DEGRADE', candidate: 'Fair', windows: '1/2' })).toContain('waiting for confirmation')
    expect(describeReason({ code: 'SECURITY_AUTH_FAILURE_BURST', failure_count: 25, distinct_user_count: 1, risk_level: 'high' }))
      .toContain('25 failed logins')
  })
  it('formats values with units and relative times', () => {
    expect(fmtValue(312.4, 'ms')).toBe('312 ms')
    expect(fmtValue(0, 'bool')).toBe('down')
    expect(ago(new Date(Date.now() - 65_000).toISOString())).toBe('1m 5s ago')
  })
})

describe('Login', () => {
  it('shows a generic error on failure (no user enumeration)', async () => {
    mockFetch({
      '/api/v1/auth/me': new Response('{"detail":"not authenticated"}', { status: 401 }),
      '/api/v1/auth/login': new Response('{"detail":"invalid credentials"}', { status: 401 }),
    })
    render(<AuthProvider><Login /></AuthProvider>)
    await userEvent.type(screen.getByLabelText('Email'), 'ops@acme.example')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in failed')
  })
})

describe('Overview', () => {
  it('renders ONLY what the API returns (empty tenant -> honest empty state)', async () => {
    const zero = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 }
    mockFetch({
      '/api/v1/health/summary': { tenant: null, counts: { source: zero, collector: zero }, worst: [] },
      '/api/v1/health/transitions': [],
    })
    render(<MemoryRouter><Overview /></MemoryRouter>)
    expect(await screen.findByText(/No telemetry yet/)).toBeInTheDocument()
    expect(screen.getByText('Nothing needs attention right now.')).toBeInTheDocument()
  })

  it('shows tenant state and the reason for a degraded source', async () => {
    const counts = { Excellent: 8, Good: 0, Fair: 1, Poor: 0 }
    mockFetch({
      '/api/v1/health/summary': {
        tenant: { entity_type: 'tenant', entity_id: 'tenant', state: 'Fair', reasons: [], since: new Date().toISOString(),
          updated_at: null, last_event_time: null, last_received: null, meta: {}, factors: [] },
        counts: { source: counts, collector: { Excellent: 1, Good: 0, Fair: 0, Poor: 0 } },
        worst: [{ entity_type: 'source', entity_id: 'src_c5f042153f4d7e7e', state: 'Fair', since: null,
          updated_at: null, last_event_time: null, last_received: null, meta: { source_kind: 'server' }, factors: [],
          reasons: [{ code: 'CPU_USAGE_FAIR', metric: 'cpu_usage', observed: 91, threshold: 85, unit: 'percent' }] }],
      },
      '/api/v1/health/transitions': [],
    })
    render(<MemoryRouter><Overview /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('CPU 91.0% is above the fair threshold of 85.0%')).toBeInTheDocument())
    expect(screen.getByText('1/1')).toBeInTheDocument() // collectors online
    expect(screen.getByText(/server src_c5f042/)).toBeInTheDocument() // pseudonymous ID only
  })
})

describe('no fake operational data', () => {
  it('pages contain no fixtures, mock data or hard-coded metric values', () => {
    const dir = join(__dirname, 'pages')
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8')
      // identifiers like mockData / FIXTURES / sampleRows / dummy... (not ordinary prose)
      expect(src, f).not.toMatch(/\b(mock|fixture|dummy|faker)\w*|\bsample[A-Z_]\w*/i)
      expect(src, f).not.toMatch(/src_[0-9a-f]{16}/) // no hard-coded source IDs
    }
  })
})
