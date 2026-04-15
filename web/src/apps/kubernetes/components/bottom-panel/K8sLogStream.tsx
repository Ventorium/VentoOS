import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/services/auth'

interface LogEntry {
  type: string
  pod: string
  container: string
  timestamp?: string
  message: string
}

interface Props {
  clusterId: string
  namespace: string
  podName: string
  container?: string
  follow?: boolean
  tailLines?: number
  filter?: string
}

export function K8sLogStream({
  clusterId,
  namespace,
  podName,
  container,
  follow = true,
  tailLines = 200,
  filter,
}: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(follow)

  useEffect(() => {
    followRef.current = follow
  }, [follow])

  useEffect(() => {
    setEntries([])
    setError(null)

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${wsProtocol}//${window.location.host}`
    const token = useAuthStore.getState().token ?? ''
    let url = `${wsBase}/api/k8s/clusters/${encodeURIComponent(clusterId)}/pods/${encodeURIComponent(podName)}/logs/stream?`
    const params = new URLSearchParams({ namespace, tail_lines: String(tailLines) })
    if (container) params.set('container', container)
    if (filter) params.set('filter', filter)
    if (token) params.set('token', token)
    url += params.toString()

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as LogEntry | { type: string; message: string }
        if (data.type === 'error') {
          setError((data as { message: string }).message)
          return
        }
        setEntries((prev) => [...prev, data as LogEntry])
      } catch {
        setEntries((prev) => [
          ...prev,
          { type: 'log', pod: podName, container: container || 'default', message: String(ev.data) },
        ])
      }
    }

    ws.onclose = () => {
      setConnected(false)
    }

    ws.onerror = () => {
      setError('WebSocket error')
      setConnected(false)
    }

    return () => {
      ws.close()
    }
  }, [clusterId, namespace, podName, container, tailLines, filter])

  useEffect(() => {
    if (followRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-7 px-2 text-[10px] border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
        <span className="text-[var(--vos-text-tertiary)]">
          {connected ? 'Streaming' : 'Disconnected'}
          {error && ` | ${error}`}
        </span>
        <span className="text-[var(--vos-text-muted)]">{entries.length} lines</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto font-mono text-[11px] p-2 bg-[var(--vos-bg-panel)]"
      >
        {entries.map((entry, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {entry.timestamp && (
              <span className="text-[var(--vos-text-tertiary)] mr-1">[{entry.timestamp}]</span>
            )}
            {entry.container && entry.container !== 'default' && (
              <span className="text-[var(--vos-accent-primary)] mr-1">[{entry.container}]</span>
            )}
            <span
              className="text-[var(--vos-text-primary)]"
              style={{
                color: /error|fail|exception/i.test(entry.message)
                  ? 'var(--vos-accent-danger)'
                  : 'var(--vos-text-primary)',
              }}
            >
              {entry.message}
            </span>
          </div>
        ))}
        {entries.length === 0 && !error && (
          <div className="text-[var(--vos-text-tertiary)]">Waiting for logs...</div>
        )}
        {error && entries.length === 0 && (
          <div className="text-[var(--vos-accent-danger)]">{error}</div>
        )}
      </div>
    </div>
  )
}
