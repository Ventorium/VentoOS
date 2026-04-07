import { Loader2 } from 'lucide-react'

export interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 20, className }: SpinnerProps) {
  return (
    <Loader2 size={size} className={`animate-spin ${className ?? ''}`} style={{ color: 'var(--vos-text-tertiary)' }} />
  )
}
