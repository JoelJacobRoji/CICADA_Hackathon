import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
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

describe('Overview key figures (KPI cards)', () => {
  it('shows only API values: shares, incident counts by priority and noise ratio', async () => {
    const health = { tenant: null, worst: [],
      counts: { source: { Excellent: 6, Good: 2, Fair: 1, Poor: 1 }, collector: { Excellent: 1, Good: 0, Fair: 0, Poor: 1 } } }
    mockFetch({
      '/api/v1/health/summary': health,
      '/api/v1/health/transitions': [],
      '/api/v1/incidents': [],
      '/api/v1/aiops/summary': { open_by_priority: { P1: 1, P2: 2, P3: 0 }, incidents_total: 4, alerts_total: 40,
        alert_signals_total: 72, noise_reduction_ratio: 18, since: '2026-11-21T04:20:00+00:00', definition: '' },
    })
    const { container } = render(<MemoryRouter><Overview /></MemoryRouter>)
    expect(await screen.findByText('P1 1 · P2 2 · P3 0')).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument() // healthy = Excellent + Good
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument() // collectors online
    expect(screen.getByText('1 offline or failing')).toBeInTheDocument()
    expect(screen.getByText('18 : 1')).toBeInTheDocument()
    expect(screen.getByText('72 alert signals → 4 incidents since 04:20 UTC')).toBeInTheDocument()
    // Rings are decorative (the value is always text) and never counted as charts.
    expect(container.querySelectorAll('.ring svg[aria-hidden="true"]').length).toBe(2)
    expect(container.querySelectorAll('.kpis [role="img"]').length).toBe(0)
  })

  it('shows placeholders, not invented numbers, while incident data is unavailable', async () => {
    const zero = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 }
    mockFetch({
      '/api/v1/health/summary': { tenant: null, counts: { source: zero, collector: zero }, worst: [] },
      '/api/v1/health/transitions': [],
    })
    const { container } = render(<MemoryRouter><Overview /></MemoryRouter>)
    const view = within(container)
    expect(await view.findByText('Healthy sources')).toBeInTheDocument()
    expect(view.getAllByText('loading').length).toBe(2) // aiops summary unavailable (404 here)
    expect(view.getByText('0/0')).toBeInTheDocument()
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

// ---------------------------------------------------------------- Phase 6: incidents
const PID = 'src_' + 'ab12cd34ef56ab78'
function incident(ai: unknown) {
  const now = new Date().toISOString()
  return {
    id: 'i-1', status: 'open', priority: 'P1', score: 18, title: 'Network device src_ab12cd… degraded',
    root_entity: PID, opened_at: now, updated_at: now, resolved_at: null, acked_at: null, acked_by: null,
    version: 3,
    explanation: {
      title: 't', status: 'open', detection_methods: ['robust_z'],
      correlation: [{ rule: 'NEW', detail: 'no matching open incident' }],
      probable_cause: { entity: PID, entity_kind: 'network_device', status: 'determined', basis: 'single affected source' },
      evidence_strength: { level: 'High', reasons: ['persisted for 3+ windows'], definition: 'Not a probability.' },
      priority: { label: 'P1', score: 18, components: { severity_weight: 8 }, note: 'ranking heuristic, not a probability' },
      uncertainty: ['Single signal so far'],
      recommendations: [{ id: 'R1', title: 'Investigate upstream device', steps: ['Check link'], rationale: 'it alerted first', evidence: ['a-1'] }],
      affected_entities: [PID],
    },
    alerts: [{ id: 'a-1', entity_type: 'source', entity_id: PID, collector_id: 'col_x_01', metric: 'latency_ms',
      family: 'BASELINE', code: 'BASELINE_DEVIATION', severity: 'high', status: 'open', onset: now, first_seen: now,
      last_seen: now, occurrences: 4, dedup_hits: 3,
      evidence: { observed: 300, unit: 'ms', baseline_median: 20, z: 94.5, z_threshold: 3.5, history_n: 50 } }],
    ai,
    notifications: [{ collector_id: 'col_x_01', kind: 'incident', incident_version: 3, created_at: now, delivered_at: now, acked_at: now }],
  }
}

async function renderDetail(ai: unknown) {
  const { IncidentDetail } = await import('./pages/IncidentDetail')
  const { Route, Routes } = await import('react-router-dom')
  mockFetch({ '/api/v1/incidents/i-1': incident(ai) })
  render(
    <MemoryRouter initialEntries={['/incidents/i-1']}>
      <Routes><Route path="/incidents/:id" element={<IncidentDetail />} /></Routes>
    </MemoryRouter>,
  )
}

describe('Incident detail', () => {
  it('shows evidence, probable cause, cited recommendations and a grounded AI explanation with its prompt', async () => {
    await renderDetail({
      incident_version: 3, created_at: '', provider: 'gemini', model: 'gemini-x', status: 'ok', latency_ms: 3100,
      prompt: { system: 's', user: 'EVIDENCE JSON: {...}' }, grounding: { ok: true, violations: [] },
      response: { summary: 'The network device degraded first.', reasoning: ['step one'], why_these_actions: [],
        verify_next: ['check link'], caveats: [] },
    })
    expect(await screen.findByText('The network device degraded first.')).toBeInTheDocument()
    expect(screen.getByText(/Grounding check passed/)).toBeInTheDocument()
    expect(screen.getByText(/robust z 94.5/)).toBeInTheDocument()
    expect(screen.getByText(/Evidence: src_ab12cd… BASELINE_DEVIATION/)).toBeInTheDocument()
    expect(screen.getAllByText(/network device src_ab12cd…/).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /Show the exact prompt sent/ }))
    expect(screen.getByText('EVIDENCE JSON: {...}')).toBeInTheDocument()
  })

  it('never shows an ungrounded LLM answer', async () => {
    await renderDetail({
      incident_version: 3, created_at: '', provider: 'gemini', model: 'gemini-x', status: 'rejected_ungrounded',
      latency_ms: 3000, prompt: { user: 'x' }, grounding: { ok: false, violations: ['unknown source id src_ffffff'] },
      response: { summary: 'HALLUCINATED TEXT', reasoning: [], why_these_actions: [], verify_next: [], caveats: [] },
    })
    expect(await screen.findByText(/was/)).toBeInTheDocument()
    expect(screen.getByText('unknown source id src_ffffff')).toBeInTheDocument()
    expect(screen.queryByText('HALLUCINATED TEXT')).not.toBeInTheDocument()
  })

  it('explains when the LLM is disabled by residency policy', async () => {
    await renderDetail({
      incident_version: 3, created_at: '', provider: 'gemini', model: null, status: 'disabled_by_policy', latency_ms: null,
      prompt: { not_sent: true }, grounding: { note: 'region eu-west not enabled for external LLM (data residency)' }, response: null,
    })
    expect(await screen.findByText(/data residency/)).toBeInTheDocument()
  })
})

describe('Priority badge', () => {
  it('pairs every priority with a distinct icon and its label', async () => {
    const { PriorityBadge } = await import('./components/Priority')
    const icons = new Set<string>()
    for (const p of ['P1', 'P2', 'P3'] as const) {
      const { container } = render(<PriorityBadge p={p} />)
      expect(container.textContent).toContain(p)
      icons.add(container.querySelector('.state-icon')?.textContent ?? '')
    }
    expect(icons.size).toBe(3)
  })
})
