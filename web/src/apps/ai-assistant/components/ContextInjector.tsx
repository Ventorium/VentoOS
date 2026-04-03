import { Database, FileText, Server, Terminal } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface ContextItem {
  type: 'k8s' | 'sql' | 'redis' | 'file' | 'terminal'
  label: string
  content: string
}

interface ContextInjectorProps {
  onInject: (context: ContextItem) => void
  disabled?: boolean
}

const CONTEXT_TYPES = [
  { type: 'k8s' as const, icon: Server, label: '发送 K8s YAML' },
  { type: 'sql' as const, icon: Database, label: '发送 SQL 结果' },
  { type: 'file' as const, icon: FileText, label: '发送文件内容' },
  { type: 'terminal' as const, icon: Terminal, label: '发送终端输出' },
]

export default function ContextInjector({ onInject, disabled }: ContextInjectorProps) {
  const [pendingContexts, setPendingContexts] = useState<ContextItem[]>([])

  // Listen for cross-app context messages via custom events (SystemChannel)
  useEffect(() => {
    const handler = (e: CustomEvent<ContextItem>) => {
      setPendingContexts(prev => [...prev, e.detail])
    }

    window.addEventListener('vos:context-inject', handler as EventListener)
    return () => window.removeEventListener('vos:context-inject', handler as EventListener)
  }, [])

  const handleInject = useCallback(
    (item: ContextItem) => {
      onInject(item)
      setPendingContexts(prev => prev.filter(c => c !== item))
    },
    [onInject],
  )

  const requestContext = useCallback(
    (type: ContextItem['type']) => {
      // Dispatch a request event; the target app will respond via vos:context-inject
      window.dispatchEvent(new CustomEvent('vos:context-request', { detail: { type } }))

      // Also create a placeholder for manual use
      onInject({
        type,
        label: `[${type.toUpperCase()}] 上下文`,
        content: `/* 请从 ${type} 应用发送当前内容 */`,
      })
    },
    [onInject],
  )

  return (
    <div className="flex items-center gap-1">
      {/* Quick inject buttons */}
      {CONTEXT_TYPES.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          type="button"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-transparent border-none cursor-pointer"
          style={{ color: 'var(--vos-text-tertiary)' }}
          onClick={() => requestContext(type)}
          disabled={disabled}
          title={label}
        >
          <Icon size={10} />
        </button>
      ))}

      {/* Pending context badges */}
      {pendingContexts.map((item, i) => (
        <button
          key={i}
          type="button"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border-none cursor-pointer"
          style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
          onClick={() => handleInject(item)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export type { ContextItem }
