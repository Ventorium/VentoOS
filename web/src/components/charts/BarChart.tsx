import type { BarItem } from './types'
import { defaultFormat } from './utils'

interface BarChartProps {
  items: BarItem[]
  className?: string
  formatValue?: (v: number) => string
}

export default function BarChart({
  items,
  className,
  formatValue = defaultFormat,
}: BarChartProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const pct = item.max > 0 ? Math.min((item.value / item.max) * 100, 100) : 0
        const barColor = item.color ?? 'var(--vos-accent-primary)'

        return (
          <div key={item.label}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 3,
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--vos-text-secondary)' }}>{item.label}</span>
              <span style={{ color: 'var(--vos-text-tertiary)', fontSize: 11 }}>
                {formatValue(item.value)}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: 'var(--vos-border-secondary)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: 3,
                  backgroundColor: barColor,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
