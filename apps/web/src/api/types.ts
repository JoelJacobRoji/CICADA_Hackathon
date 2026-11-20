export type HealthState = 'Excellent' | 'Good' | 'Fair' | 'Poor'
export const STATES: HealthState[] = ['Excellent', 'Good', 'Fair', 'Poor']

export type Reason = Record<string, unknown> & { code: string }

export interface Factor {
  metric: string
  state: HealthState
  observed: number
  threshold: number | null
  unit: string
  window_end: string
}

export interface HealthEntity {
  entity_type: 'source' | 'collector' | 'tenant'
  entity_id: string
  state: HealthState
  reasons: Reason[]
  since: string | null
  updated_at: string | null
  last_event_time: string | null
  last_received: string | null
  meta: Record<string, unknown>
  factors: Factor[]
}

export interface Transition {
  id?: number
  entity_type: string
  entity_id: string
  from_state: HealthState | null
  to_state: HealthState
  at_utc: string
  event_time: string | null
  reasons: Reason[]
}

export interface HealthSummary {
  tenant: HealthEntity | null
  counts: { source: Record<HealthState, number>; collector: Record<HealthState, number> }
  worst: HealthEntity[]
}

export interface EntityDetail extends HealthEntity {
  history: Transition[]
}

export interface Me {
  tenant: string
  role: string
  region: string
}

export interface Collector {
  id: string
  region: string
  status: string
  connectivity: 'online' | 'offline'
  last_seen_at: string | null
  collector_version: string | null
  uptime_s: number | null
  cpu_percent: number | null
  memory_mb: number | null
  outbox_depth: number | null
  oldest_pending_age_s: number | null
  config_hash: string | null
  adapters: { name: string; status: string }[] | null
}

export interface MetricPoint {
  payload_id: string
  source_pid: string
  source_kind: string
  metric: string
  unit: string
  window_start: string
  window_end: string
  mean: number
  min: number
  max: number
  p95: number
  last: number
  late: boolean
  local_health: string
}

export interface SourceRow {
  source_pid: string
  source_kind: string
  metric: string
  unit: string
  window_end: string
  mean: number
  local_health: string
}

export interface SecurityEvent {
  payload_id: string
  source_pid: string
  summary_code: string
  risk_level: 'low' | 'medium' | 'high'
  failure_count: number
  distinct_user_count: number
  distinct_src_count: number
  window_start: string
  window_end: string
  received_at: string
}

export interface Thresholds {
  source: string
  numeric: Record<string, { good: number; fair: number; poor: number }>
  binary: Record<string, { poor_when_zero: boolean }>
  staleness: { fair_after_seconds: number; poor_after_seconds: number }
  security: Record<string, number>
  engine?: Record<string, number>
}

export type LiveEvent =
  | ({ type: 'metric_summary' } & Partial<MetricPoint>)
  | ({ type: 'security_summary' } & Partial<SecurityEvent>)
  | ({ type: 'health_transition' } & Transition)
  | { type: 'heartbeat'; collector_id: string; outbox_depth: number; sent_at: string }
  | { type: 'hello'; tenant: string }
  | { type: 'incident'; kind: string; incident_id: string; version: number; priority: Priority; title: string; status: string }
  | { type: 'incident_ai'; incident_id: string; version: number; status: string }

// ---------------------------------------------------------------- Phase 6: AIOps
export type Priority = 'P1' | 'P2' | 'P3'

export interface IncidentRow {
  id: string
  status: 'open' | 'resolved'
  priority: Priority
  score: number
  title: string
  root_entity: string | null
  opened_at: string
  updated_at: string
  resolved_at: string | null
  acked_at: string | null
  version: number
  alert_count: number
  evidence_strength: string | null
  affected_entities: string[]
}

export interface AlertEvidence {
  observed?: number
  unit?: string
  threshold?: number
  state?: string
  windows?: number
  detection?: string
  baseline_median?: number
  baseline_mad?: number
  z?: number
  z_threshold?: number
  history_n?: number
  deviation_pct?: number | null
  rise_over_span?: number
  span_windows?: number
  failure_count?: number
  distinct_user_count?: number
  distinct_src_count?: number
  [k: string]: unknown
}

export interface AlertRow {
  id: string
  entity_type: string
  entity_id: string
  collector_id: string | null
  metric: string
  family: string
  code: string
  severity: string
  status: string
  onset: string
  first_seen: string
  last_seen: string
  occurrences: number
  dedup_hits: number
  evidence: AlertEvidence
}

export interface Recommendation {
  id: string
  title: string
  steps: string[]
  rationale: string
  evidence: string[]
}

export interface Explanation {
  title: string
  status: string
  detection_methods: string[]
  correlation: { rule: string; detail?: string; path?: string[]; hops?: number; alert_id?: string }[]
  probable_cause: { entity: string | null; entity_kind: string | null; status: string; basis: string }
  evidence_strength: { level: string; reasons: string[]; definition: string }
  priority: { label: Priority; score: number; components: Record<string, number>; note: string }
  uncertainty: string[]
  recommendations: Recommendation[]
  affected_entities: string[]
  closed_reason?: string
}

export interface AiExplanation {
  incident_version: number
  created_at: string
  provider: string
  model: string | null
  status: 'ok' | 'disabled' | 'disabled_by_policy' | 'blocked_by_canary' | 'error' | 'rejected_ungrounded'
  prompt: { system?: string; user?: string; not_sent?: boolean; reason?: string }
  response: {
    summary: string
    reasoning: string[]
    why_these_actions: string[]
    verify_next: string[]
    caveats: string[]
  } | null
  grounding: { ok?: boolean; violations?: string[]; note?: string; error?: string; canary?: string[] }
  latency_ms: number | null
}

export interface IncidentDetail extends Omit<IncidentRow, 'alert_count' | 'evidence_strength' | 'affected_entities'> {
  acked_by: string | null
  explanation: Explanation
  alerts: AlertRow[]
  ai: AiExplanation | null
  notifications: {
    collector_id: string
    kind: string
    incident_version: number
    created_at: string
    delivered_at: string | null
    acked_at: string | null
  }[]
}

export interface AiopsSummary {
  open_by_priority: Record<Priority, number>
  incidents_total: number
  alerts_total: number
  alert_signals_total: number
  noise_reduction_ratio: number | null
  definition: string
}
