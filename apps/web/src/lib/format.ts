import type { Reason } from '../api/types'

export const METRIC_LABEL: Record<string, string> = {
  cpu_usage: 'CPU',
  memory_usage: 'Memory',
  disk_usage: 'Disk',
  latency_ms: 'Latency',
  packet_loss: 'Packet loss',
  bandwidth_mbps: 'Bandwidth',
  connectivity: 'Connectivity',
  service_up: 'Service availability',
  error_rate: 'Error rate',
}

const UNIT: Record<string, string> = { percent: '%', ms: ' ms', mbps: ' Mbps', bool: '' }

export function metricLabel(m: string): string {
  return METRIC_LABEL[m] ?? m
}

export function fmtValue(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (unit === 'bool') return v >= 0.5 ? 'up' : 'down'
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2
  return `${v.toFixed(digits)}${UNIT[unit] ?? ` ${unit}`}`
}

export function shortId(id: string): string {
  return id.startsWith('src_') ? `src_${id.slice(4, 10)}…` : id
}

export function kindLabel(k: unknown): string {
  return k === 'network_device' ? 'network device' : typeof k === 'string' ? k : 'source'
}

export function utc(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`
}

export function local(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric',
  })
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Plain-language explanation of a health reason. Every reason the engine emits is covered. */
export function describeReason(r: Reason): string {
  const n = (k: string) => r[k] as number
  const s = (k: string) => String(r[k] ?? '')
  const code = r.code
  if (typeof r.metric === 'string' && /_(GOOD|FAIR|POOR)$/.test(code)) {
    const unit = s('unit')
    if (unit === 'bool') return `${metricLabel(s('metric'))} is down in the latest window`
    const level = code.split('_').pop()!.toLowerCase()
    return `${metricLabel(s('metric'))} ${fmtValue(n('observed'), unit)} is above the ${level} threshold of ${fmtValue(n('threshold'), unit)}`
  }
  switch (code) {
    case 'STALE_DATA':
      return `No new data for ${n('seconds_since_data')} s (stale after ${n('threshold_s')} s)`
    case 'NO_DATA':
      return `No data for ${n('seconds_since_data')} s (missing after ${n('threshold_s')} s)`
    case 'PENDING_DEGRADE':
      return `Worse readings seen; waiting for confirmation before changing to ${s('candidate')} (${s('windows')} windows)`
    case 'RECOVERING':
      return `Readings have improved; recovering toward ${s('candidate')} (${s('windows')} better windows)`
    case 'HEARTBEAT_MISSING':
      return `No heartbeat for ${n('seconds_since_heartbeat')} s - collector considered offline (after ${n('threshold_s')} s)`
    case 'HEARTBEAT_LATE':
      return `Heartbeat late: ${n('seconds_since_heartbeat')} s since the last one (expected every 10 s)`
    case 'BACKLOG':
      return `${n('outbox_depth')} payloads queued for delivery (threshold ${n('threshold')})`
    case 'BACKLOG_DELAYED':
      return `Oldest queued payload is ${n('oldest_pending_age_s')} s old (threshold ${n('threshold_s')} s)`
    case 'ADAPTER_DEGRADED':
      return `Adapter "${s('adapter')}" is degraded`
    case 'ADAPTER_ERROR':
      return `Adapter "${s('adapter')}" is failing`
    case 'ADAPTER_AUTH_ERROR':
      return `Adapter "${s('adapter')}" cannot authenticate to the SaaS`
    case 'NEVER_SEEN':
      return 'Registered but never reported'
    case 'WORST_OF_MEMBERS':
      return 'Overall state is the worst state among this tenant\'s sources and collectors'
    case 'MEMBER':
      return `${s('entity_type')} ${shortId(s('entity_id'))} is ${s('state')}`
  }
  if (code.startsWith('SECURITY_')) {
    const what = code.replace('SECURITY_', '').replaceAll('_', ' ').toLowerCase()
    return `Security: ${what} - ${n('failure_count')} failed logins across ${n('distinct_user_count')} account(s), risk ${s('risk_level')}`
  }
  return code.replaceAll('_', ' ').toLowerCase()
}
