import { defaultFormat } from './utils'

interface GaugeChartProps {
  value: number
  max?: number
  size?: number
  thickness?: number
  color?: string
  backgroundColor?: string
  label?: string
  formatValue?: (v: number) => string
  className?: string
}

export default function GaugeChart({
  value,
  max = 100,
  size = 100,
  thickness = 8,
  color = 'var(--vos-accent-primary)',
  backgroundColor = 'var(--vos-border-secondary)',
  label,
  formatValue = defaultFormat,
  className
}: GaugeChartProps) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  const dashOffset = circumference * (1 - ratio)

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      style={{ overflow: 'visible' }}
    >
      {/* Background ring */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={backgroundColor} strokeWidth={thickness} />

      {/* Foreground ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />

      {/* Center text */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--vos-text-primary)"
        fontSize={size * 0.22}
        fontWeight={600}
        dy={label ? -size * 0.06 : 0}
      >
        {formatValue(value)}
      </text>

      {/* Label below value */}
      {label && (
        <text
          x={size / 2}
          y={size / 2 + size * 0.14}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--vos-text-secondary)"
          fontSize={size * 0.11}
        >
          {label}
        </text>
      )}
    </svg>
  )
}
