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
