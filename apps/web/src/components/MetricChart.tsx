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
import { useThemeVersion } from '../lib/theme'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer])

const GAP_MS = 6_000 // > 3 windows of 2 s without data = a real gap

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
  const themeV = useThemeVersion() // repaint from the CSS tokens when the theme changes

  // Honest gaps: if consecutive windows are more than GAP_MS apart there was NO data in between,
  // so the line is broken (a null point) instead of drawing a slope that never happened.
  const data = useMemo(() => {
    const sorted = [...points]
      .map((p) => [Date.parse(p.window_end), unit === 'bool' ? p.min : p.mean] as const)
      .filter(([t]) => !Number.isNaN(t))
      .sort((a, b) => a[0] - b[0])
    const out: [number, number | null][] = []
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i]![0] - sorted[i - 1]![0] > GAP_MS) out.push([sorted[i - 1]![0] + 1, null])
      out.push([sorted[i]![0], sorted[i]![1]])
    }
    return out
  }, [points, unit])

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
    const real = data.filter((d) => d[1] !== null)
    // A lone point: show it, and give the time axis a sane +/-1 min range (ECharts would pad
    // a single timestamp to +/-1 day, which reads as "no data for two days").
    const lone = real.length === 1 ? real[0]![0] : null
    c.setOption(
      {
        // No draw-in animation: data refreshes every 2 s and re-animating the whole line each
        // time is distracting (and made screenshots show half-drawn lines).
        animation: false,
        textStyle: { fontFamily: token('--font-sans') },
        grid: { left: 44, right: 16, top: 14, bottom: 24 },
        xAxis: {
          type: 'time',
          min: lone !== null ? lone - 60_000 : undefined,
          max: lone !== null ? lone + 60_000 : undefined,
          axisLine: { lineStyle: { color: grid } },
          axisLabel: { color: ink, fontSize: 10, hideOverlap: true },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          min: unit === 'percent' ? 0 : unit === 'bool' ? 0 : undefined,
          max: unit === 'percent' ? 100 : unit === 'bool' ? 1 : undefined,
          interval: unit === 'percent' ? 25 : unit === 'bool' ? 1 : undefined,
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
            connectNulls: false,
            showSymbol: real.length < 3, // too few points to draw a visible line
            symbolSize: 8,
            step: unit === 'bool' ? 'end' : undefined,
            lineStyle: { width: 2, color: series },
            itemStyle: { color: series },
            emphasis: { focus: 'none' },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: ink, type: 'dashed', width: 1 },
              // Inside the plot, just above each line, on a surface backing so data never hides it.
              // Labels alternate right/left so closely spaced thresholds (e.g. 90/95) never overlap.
              label: {
                color: ink, fontSize: 10, formatter: '{b}', position: 'insideEndTop',
                backgroundColor: token('--surface'), padding: [0, 3], distance: 1,
              },
              data: thresholds.map((t, i) => ({
                name: t.label,
                yAxis: t.value,
                label: { position: i % 2 === 1 ? 'insideStartTop' : 'insideEndTop' },
              })),
            },
          },
        ],
      },
      { notMerge: true },
    )
  }, [data, metric, unit, thresholds, title, themeV])

  return (
    <div
      ref={el}
      style={{ height }}
      role="img"
      aria-label={(() => {
        const real = data.filter((d) => d[1] !== null)
        const last = real[real.length - 1]
        return `${title ?? metricLabel(metric)}: ${real.length} windows${
          last ? `, latest ${fmtValue(last[1], unit)}` : ''
        }`
      })()}
    />
  )
}
