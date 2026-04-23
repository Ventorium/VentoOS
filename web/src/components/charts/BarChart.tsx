import type { BarItem } from './types'
import { defaultFormat } from './utils'

interface BarChartProps {
  items: BarItem[]
  className?: string
  formatValue?: (v: number) => string
}

export default function BarChart({ items, className, formatValue = defaultFormat }: BarChartProps) {
  return (
    <div className={className ? `${className} flex flex-col gap-2` : 'flex flex-col gap-2'}>
      {items.map(item => {
        const pct = item.max > 0 ? Math.min((item.value / item.max) * 100, 100) : 0
        const barColor = item.color ?? 'var(--vos-accent-primary)'

        return (
          <div key={item.label}>
            <div className="flex justify-between items-baseline mb-[3px] text-xs">
              <span className="text-[var(--vos-text-secondary)]">{item.label}</span>
              <span className="text-[var(--vos-text-tertiary)] text-[11px]">{formatValue(item.value)}</span>
            </div>
            <div className="h-[6px] rounded-[3px] bg-[var(--vos-border-subtle)] overflow-hidden">
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: 3,
                  backgroundColor: barColor,
                  transition: 'width 0.6s ease'
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
