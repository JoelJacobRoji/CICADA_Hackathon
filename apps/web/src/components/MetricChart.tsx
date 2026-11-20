// Single-series time-series chart (small-multiple friendly).
// Dataviz rules: one series = no legend (title names it); 2px line; thresholds as labelled
// hairlines in muted ink; crosshair tooltip; recessive grid; color from tokens (validated).
import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { MetricPoint } from '../api/types'
import { fmtValue, metricLabel } from '../lib/format'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer])

export interface ThresholdLine {
  label: string
  value: number
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

export function MetricChart({
  points,
  metric,
  unit,
  thresholds = [],
  height = 160,
  title,
}: {
  points: MetricPoint[]
  metric: string
  unit: string
  thresholds?: ThresholdLine[]
  height?: number
  title?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  const data = useMemo(
    () =>
      [...points]
        .sort((a, b) => a.window_end.localeCompare(b.window_end))
        .map((p) => [p.window_end, unit === 'bool' ? p.min : p.mean] as [string, number]),
    [points, unit],
  )

  useEffect(() => {
    if (!el.current) return
    chart.current = echarts.init(el.current, undefined, { renderer: 'svg' })
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    const c = chart.current
    if (!c) return
    const ink = token('--ink-muted')
    const grid = token('--grid')
    const series = token('--series-1')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    c.setOption(
      {
        animation: !reduced,
        grid: { left: 44, right: 56, top: 12, bottom: 24 },
        xAxis: {
          type: 'time',
          axisLine: { lineStyle: { color: grid } },
          axisLabel: { color: ink, fontSize: 10, hideOverlap: true },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          min: unit === 'percent' ? 0 : unit === 'bool' ? 0 : undefined,
          max: unit === 'percent' ? 100 : unit === 'bool' ? 1 : undefined,
          splitNumber: 3,
          axisLabel: {
            color: ink,
            fontSize: 10,
            formatter: (v: number) => (unit === 'bool' ? (v >= 1 ? 'up' : v <= 0 ? 'down' : '') : `${v}`),
          },
          splitLine: { lineStyle: { color: grid, width: 1 } },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: ink } },
          backgroundColor: token('--surface-raised'),
          borderColor: grid,
          textStyle: { color: token('--ink'), fontSize: 12 },
          valueFormatter: (v: unknown) => fmtValue(Number(v), unit),
        },
        series: [
          {
            type: 'line',
            name: title ?? metricLabel(metric),
            data,
            showSymbol: false,
            symbolSize: 8,
            step: unit === 'bool' ? 'end' : undefined,
            lineStyle: { width: 2, color: series },
            itemStyle: { color: series },
            emphasis: { focus: 'none' },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: ink, type: 'dashed', width: 1 },
              label: { color: ink, fontSize: 10, formatter: '{b}', position: 'end' },
              data: thresholds.map((t) => ({ name: t.label, yAxis: t.value })),
            },
          },
        ],
      },
      { notMerge: true },
    )
  }, [data, metric, unit, thresholds, title])

  return (
    <div
      ref={el}
      style={{ height }}
      role="img"
      aria-label={`${title ?? metricLabel(metric)}: ${data.length} windows${
        data.length ? `, latest ${fmtValue(data[data.length - 1]![1], unit)}` : ''
      }`}
    />
  )
}
