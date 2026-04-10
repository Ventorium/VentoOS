import type React from 'react'
import { Loader2 } from 'lucide-react'

export interface SpinnerProps {
  size?: number
  className?: string
  style?: React.CSSProperties
  color?: string
}

export function Spinner({ size = 20, className, style, color }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={`animate-spin ${className ?? ''}`}
      style={{ color: color ?? 'var(--vos-text-tertiary)', ...style }}
    />
  )
}
