import { Link } from 'react-router-dom'
import type { TopologyEdge } from '../api/types'
import { shortId } from '../lib/format'

// Reported dependencies: `from` depends on / routes through `to` (so `to` is upstream).
// Layout: dependents at the top, upstream infrastructure at the bottom (level = longest path
// down to a node with no upstream). Only the incident's sources and their direct neighbours.

export type Role = 'root' | 'affected' | 'related'
export interface GNode { id: string; role: Role; level: number; x: number; y: number }
export interface GEdge { from: string; to: string; relation: string }
export interface Graph { nodes: GNode[]; edges: GEdge[]; width: number; height: number }

export const NODE_W = 132
export const NODE_H = 44
const GAP_X = 22
const GAP_Y = 46
const PAD = 12

export function layoutGraph(all: TopologyEdge[], affected: string[], root: string | null): Graph {
  const aff = new Set(affected.filter((a) => a.startsWith('src_')))
  if (root?.startsWith('src_')) aff.add(root)
  const seen = new Set<string>()
  const edges: GEdge[] = []
  for (const e of all) {
    const key = `${e.from_pid}>${e.to_pid}`
    if (seen.has(key) || !(aff.has(e.from_pid) || aff.has(e.to_pid))) continue
    seen.add(key)
    edges.push({ from: e.from_pid, to: e.to_pid, relation: e.relation })
  }
  const ids = new Set<string>(aff)
  edges.forEach((e) => { ids.add(e.from); ids.add(e.to) })
  const up = new Map<string, string[]>()
  edges.forEach((e) => up.set(e.from, [...(up.get(e.from) ?? []), e.to]))

  const level = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (n: string): number => {
    const known = level.get(n)
    if (known !== undefined) return known
    if (visiting.has(n)) return 0 // defensive: a reported cycle must not hang the page
    visiting.add(n)
    const ups = up.get(n) ?? []
    const d = ups.length ? 1 + Math.max(...ups.map(depth)) : 0
    visiting.delete(n)
    level.set(n, d)
    return d
  }
  ids.forEach((n) => depth(n))

  const maxLevel = Math.max(0, ...Array.from(level.values()))
  const rows = new Map<number, string[]>()
  Array.from(ids).sort().forEach((n) => {
    const l = level.get(n) ?? 0
    rows.set(l, [...(rows.get(l) ?? []), n])
  })
  const widest = Math.max(1, ...Array.from(rows.values()).map((r) => r.length))
  const width = PAD * 2 + widest * NODE_W + (widest - 1) * GAP_X
  const nodes: GNode[] = []
  rows.forEach((row, l) => {
    const rowW = row.length * NODE_W + (row.length - 1) * GAP_X
    const x0 = (width - rowW) / 2
    row.forEach((id, i) => {
      nodes.push({
        id,
        role: id === root ? 'root' : aff.has(id) ? 'affected' : 'related',
        level: l,
        x: x0 + i * (NODE_W + GAP_X),
        y: PAD + (maxLevel - l) * (NODE_H + GAP_Y),
      })
    })
  })
  const height = PAD * 2 + (maxLevel + 1) * NODE_H + maxLevel * GAP_Y
  return { nodes, edges, width, height }
}

const ROLE_TEXT: Record<Role, string> = { root: 'probable cause', affected: 'affected', related: 'not alerting' }

export function DepGraph({ edges, affected, root }: { edges: TopologyEdge[]; affected: string[]; root: string | null }) {
  const g = layoutGraph(edges, affected, root)
  if (g.nodes.length === 0) {
    return <p className="muted">No reported dependencies for these signals (for example a collector outage).</p>
  }
  const at = new Map(g.nodes.map((n) => [n.id, n]))
  const label = `Dependency graph: ${g.nodes.length} sources, ${g.edges.length} reported dependencies. ` +
    g.nodes.map((n) => `${shortId(n.id)} ${ROLE_TEXT[n.role]}`).join('; ')
  return (
    <figure className="depgraph" aria-label={label}>
      <svg viewBox={`0 0 ${g.width} ${g.height}`} width="100%" style={{ maxHeight: 420 }} aria-hidden="true" focusable="false">
        <defs>
          <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="dg-arrow" />
          </marker>
        </defs>
        {g.edges.map((e) => {
          const a = at.get(e.from)
          const b = at.get(e.to)
          if (!a || !b) return null
          const x1 = a.x + NODE_W / 2
          const y1 = a.y + NODE_H
          const x2 = b.x + NODE_W / 2
          const y2 = b.y
          const hot = a.role !== 'related' && b.role !== 'related'
          return (
            <path key={`${e.from}>${e.to}`} className={`dg-edge${hot ? ' dg-edge-hot' : ''}`}
              d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2 - 2}`}
              markerEnd="url(#dg-arrow)">
              <title>{`${shortId(e.from)} ${e.relation.replace('_', ' ')} ${shortId(e.to)}`}</title>
            </path>
          )
        })}
        {g.nodes.map((n) => (
          <g key={n.id} className={`dg-node dg-${n.role}`} transform={`translate(${n.x},${n.y})`}>
            <rect width={NODE_W} height={NODE_H} rx="10" />
            <text x={NODE_W / 2} y="18" textAnchor="middle" className="dg-id">{shortId(n.id)}</text>
            <text x={NODE_W / 2} y="34" textAnchor="middle" className="dg-role">
              {n.role === 'root' ? '◎ ' : n.role === 'affected' ? '▲ ' : ''}{ROLE_TEXT[n.role]}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="muted small">
        Arrows point from a source to what it depends on (upstream). ◎ probable cause · ▲ affected ·
        plain = reported neighbour without alerts. Sources:{' '}
        {g.nodes.filter((n) => n.role !== 'related').map((n, i) => (
          <span key={n.id}>{i > 0 && ', '}<Link to={`/sources/${n.id}`}>{shortId(n.id)}</Link></span>
        ))}
      </figcaption>
    </figure>
  )
}
