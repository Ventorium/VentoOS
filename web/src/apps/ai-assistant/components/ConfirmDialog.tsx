import { AlertTriangle, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface ConfirmDialogProps {
  visible: boolean
  toolName: string
  arguments: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  onApprove: () => void
  onDeny: () => void
  timeoutSecs?: number
}

const RISK_COLORS: Record<string, string> = {
  low: 'var(--vos-text-secondary)',
  medium: '#f5a623',
  high: '#ff3b30',
  critical: '#ff3b30',
}

export default function ConfirmDialog({
  visible,
  toolName,
  arguments: args,
  riskLevel,
  onApprove,
  onDeny,
  timeoutSecs = 30,
}: ConfirmDialogProps) {
  const [countdown, setCountdown] = useState(timeoutSecs)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!visible) {
      setCountdown(timeoutSecs)
      return
    }
    setCountdown(timeoutSecs)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          onDeny()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [visible, timeoutSecs, onDeny])

  const handleApprove = useCallback(() => {
    onApprove()
  }, [onApprove])

  const handleDeny = useCallback(() => {
    onDeny()
  }, [onDeny])

  if (!visible) return null

  const riskColor = RISK_COLORS[riskLevel] ?? RISK_COLORS.medium

  let parsedArgs: string
  try {
    parsedArgs = JSON.stringify(JSON.parse(args), null, 2)
  } catch {
    parsedArgs = args
  }

  return (
    <div
      className="mx-3 my-2 rounded-lg overflow-hidden"
      style={{ border: `1px solid ${riskColor}`, background: 'var(--vos-bg-surface)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: `${riskColor}15` }}>
        <AlertTriangle size={14} style={{ color: riskColor }} />
        <span className="text-xs font-medium flex-1" style={{ color: riskColor }}>
          危险操作确认
        </span>
        <Shield size={12} style={{ color: riskColor }} />
        <span className="text-[10px] uppercase font-mono" style={{ color: riskColor }}>
          {riskLevel}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <div className="text-xs mb-2">
          <span style={{ color: 'var(--vos-text-tertiary)' }}>Tool: </span>
          <span className="font-mono font-medium" style={{ color: 'var(--vos-text-primary)' }}>
            {toolName}
          </span>
        </div>

        {/* Arguments toggle */}
        <button
          type="button"
          className="flex items-center gap-1 bg-transparent border-none cursor-pointer text-[10px] mb-2 p-0"
          style={{ color: 'var(--vos-text-tertiary)' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          参数详情
        </button>

        {expanded && (
          <pre
            className="text-[11px] p-2 rounded overflow-x-auto mb-2"
            style={{
              background: 'var(--vos-bg-input)',
              color: 'var(--vos-text-secondary)',
              fontFamily: "'SF Mono', Menlo, monospace",
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {parsedArgs}
          </pre>
        )}

        {/* Countdown */}
        <div className="text-[10px] mb-2" style={{ color: 'var(--vos-text-tertiary)' }}>
          将在 {countdown} 秒后自动拒绝
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer"
            style={{ background: riskColor, color: '#fff' }}
            onClick={handleApprove}
          >
            批准执行
          </button>
          <button
            type="button"
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              background: 'transparent',
              color: 'var(--vos-text-secondary)',
              border: '0.5px solid var(--vos-border-subtle)',
            }}
            onClick={handleDeny}
          >
            拒绝
          </button>
        </div>
      </div>
    </div>
  )
}
