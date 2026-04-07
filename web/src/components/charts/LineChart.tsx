import { useId, useMemo } from 'react'
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
  className,
}: LineChartProps) {
  const uid = useId()

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
      className={className}
      style={{ overflow: 'visible' }}
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
              <text
                x={PADDING.left - 4}
                y={y + 3}
                textAnchor="end"
                fill="var(--vos-text-tertiary)"
                fontSize={9}
              >
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
    </svg>
  )
}
