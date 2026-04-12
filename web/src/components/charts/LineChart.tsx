import { useId, useMemo, useState } from 'react'
import type { ChartSeries } from './types'
import { defaultFormat, niceScale, smoothPath } from './utils'

interface LineChartProps {
  data: ChartSeries[]
  width?: number
  height?: number
  maxPoints?: number
  showGrid?: boolean
  showLabels?: boolean
  formatValue?: (v: number) => string
  className?: string
}

const PADDING = { top: 8, right: 12, bottom: 20, left: 40 }

export default function LineChart({
  data,
  width = 300,
  height = 150,
  maxPoints = 60,
  showGrid = true,
  showLabels = true,
  formatValue = defaultFormat,
  className
}: LineChartProps) {
  const uid = useId()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const plotW = width - PADDING.left - PADDING.right
  const plotH = height - PADDING.top - PADDING.bottom

  // Compute global Y scale across all series
  const [yMin, yMax] = useMemo(() => {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const s of data) {
      for (const v of s.data) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (!Number.isFinite(min)) return [0, 1]
    return niceScale(min, max)
  }, [data])

  const yRange = yMax - yMin || 1

  // Grid lines (roughly 4 horizontal lines)
  const gridLines = useMemo(() => {
    const count = 4
    const step = yRange / count
    const lines: number[] = []
    for (let i = 0; i <= count; i++) {
      lines.push(yMin + step * i)
    }
    return lines
  }, [yMin, yRange])

  function toX(i: number, total: number): number {
    if (total <= 1) return PADDING.left + plotW / 2
    return PADDING.left + (i / (total - 1)) * plotW
  }

  function toY(v: number): number {
    return PADDING.top + plotH - ((v - yMin) / yRange) * plotH
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      className={className ? `${className} overflow-visible` : 'overflow-visible'}
    >
      {/* Grid */}
      {showGrid &&
        gridLines.map(v => {
          const y = toY(v)
          return (
            <g key={v}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={width - PADDING.right}
                y2={y}
                stroke="var(--vos-border-secondary)"
                strokeWidth={0.5}
                strokeDasharray="3,3"
              />
              <text x={PADDING.left - 4} y={y + 3} textAnchor="end" fill="var(--vos-text-tertiary)" fontSize={9}>
                {formatValue(v)}
              </text>
            </g>
          )
        })}

      {/* Series */}
      {data.map(series => {
        const pts = series.data.slice(-maxPoints)
        if (pts.length === 0) return null

        const points: [number, number][] = pts.map((v, i) => [toX(i, pts.length), toY(v)])
        const linePath = smoothPath(points)
        const gradientId = `${uid}-grad-${series.id}`

        // Area fill path: close along the bottom
        const areaPath = `${linePath}L${points[points.length - 1][0]},${PADDING.top + plotH}L${points[0][0]},${PADDING.top + plotH}Z`

        const lastVal = pts[pts.length - 1]

        return (
          <g key={series.id}>
            {/* Gradient definition */}
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Area fill */}
            <path d={areaPath} fill={`url(#${gradientId})`} />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={series.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Current value label */}
            {showLabels && lastVal !== undefined && (
              <text
                x={width - PADDING.right}
                y={toY(lastVal) - 6}
                textAnchor="end"
                fill={series.color}
                fontSize={10}
                fontWeight={600}
              >
                {formatValue(lastVal)}
              </text>
            )}
          </g>
        )
      })}

      {/* Hover overlay */}
      <rect
        x={PADDING.left}
        y={PADDING.top}
        width={plotW}
        height={plotH}
        fill="transparent"
        onMouseMove={e => {
          const svg = e.currentTarget.closest('svg')
          if (!svg) return
          const rect = svg.getBoundingClientRect()
          const mouseX = ((e.clientX - rect.left) / rect.width) * width - PADDING.left
          const pts = data[0]?.data.slice(-maxPoints) ?? []
          if (pts.length === 0) return
          const step = plotW / Math.max(pts.length - 1, 1)
          const idx = Math.round(mouseX / step)
          setHoverIdx(Math.max(0, Math.min(idx, pts.length - 1)))
        }}
        onMouseLeave={() => setHoverIdx(null)}
      />

      {/* Hover guide line + dots + tooltip */}
      {hoverIdx !== null &&
        data.length > 0 &&
        (() => {
          const pts = data[0].data.slice(-maxPoints)
          if (hoverIdx >= pts.length) return null
          const x = toX(hoverIdx, pts.length)

          return (
            <g>
              <line
                x1={x}
                y1={PADDING.top}
                x2={x}
                y2={PADDING.top + plotH}
                stroke="var(--vos-text-tertiary)"
                strokeWidth={0.5}
                strokeDasharray="3,3"
              />
              {data.map(series => {
                const seriesPts = series.data.slice(-maxPoints)
                if (hoverIdx >= seriesPts.length) return null
                const val = seriesPts[hoverIdx]
                const cy = toY(val)
                return (
                  <g key={series.id}>
                    <circle cx={x} cy={cy} r={3} fill={series.color} stroke="#fff" strokeWidth={1} />
                    <rect
                      x={x + 6}
                      y={cy - 10}
                      width={60}
                      height={18}
                      rx={3}
                      fill="var(--vos-bg-elevated, rgba(0,0,0,0.75))"
                    />
                    <text x={x + 10} y={cy + 1} fill="#fff" fontSize={10}>
                      {formatValue(val)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })()}
    </svg>
  )
}
