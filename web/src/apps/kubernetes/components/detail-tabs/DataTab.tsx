import { useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import type { K8sResource } from '../../types'

interface Props {
  resource: K8sResource
}

export function DataTab({ resource }: Props) {
  const raw = resource.raw as Record<string, unknown> | undefined
  const isSecret = resource.kind.toLowerCase() === 'secret'
  const data = (raw?.data as Record<string, string> | undefined) ?? {}
  const dataKeys = Object.keys(data)

  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const toggleReveal = (key: string) => {
    setRevealed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const decode = (value: string) => {
    try {
      return atob(value)
    } catch {
      return value
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (dataKeys.length === 0) {
    return (
      <div className="text-xs text-[var(--vos-text-tertiary)] py-8 text-center">
        No data entries
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {dataKeys.map(key => {
        const rawValue = data[key]
        const displayValue = isSecret
          ? revealed[key]
            ? decode(rawValue)
            : '••••••••'
          : rawValue
        return (
          <div
            key={key}
            className="p-2 rounded border-[0.5px] border-[var(--vos-border-subtle)] bg-[var(--vos-bg-item-hover)]"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--vos-accent-primary)]">{key}</span>
              <div className="flex items-center gap-1">
                {isSecret && (
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-[var(--vos-bg-surface)] text-[var(--vos-text-tertiary)]"
                    onClick={() => toggleReveal(key)}
                    title={revealed[key] ? 'Hide' : 'Reveal'}
                  >
                    {revealed[key] ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                )}
                <button
                  type="button"
                  className="p-1 rounded hover:bg-[var(--vos-bg-surface)] text-[var(--vos-text-tertiary)]"
                  onClick={() => copy(displayValue)}
                  title="Copy"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-[var(--vos-text-secondary)]">
              {displayValue}
            </pre>
          </div>
        )
      })}
    </div>
  )
}
