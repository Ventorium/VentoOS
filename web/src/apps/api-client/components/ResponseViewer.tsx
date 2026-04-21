import { CheckCircle, Clock, Database, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApiClientStore } from '../store'
import type { KeyValueItem, ProxyResponse } from '../types'

type ResponseTab = 'body' | 'headers'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return '#22c55e'
  if (status >= 300 && status < 400) return '#3b82f6'
  if (status >= 400 && status < 500) return '#f97316'
  return '#ef4444'
}

function tryFormatJson(body: string): { formatted: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(body)
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true }
  } catch {
    return { formatted: body, isJson: false }
  }
}

export default function ResponseViewer() {
  const [activeTab, setActiveTab] = useState<ResponseTab>('body')
  const activeTabId = useApiClientStore(s => s.activeTabId)
  const responses = useApiClientStore(s => s.responses)
  const isSending = useApiClientStore(s => s.isSending)

  const response = activeTabId ? responses[activeTabId] : null

  if (isSending) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ borderTop: '1px solid var(--vos-border-subtle)' }}
      >
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          <Clock size={14} className="animate-pulse" />
          Sending request...
        </div>
      </div>
    )
  }

  if (!response) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ borderTop: '1px solid var(--vos-border-subtle)' }}
      >
        <div className="text-center">
          <div className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
            Enter a URL and click Send to get a response
          </div>
        </div>
      </div>
    )
  }

  const { formatted, isJson } = tryFormatJson(response.body)

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ borderTop: '1px solid var(--vos-border-subtle)' }}>
      {/* Status bar */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        <span className="flex items-center gap-1 text-xs font-bold" style={{ color: statusColor(response.status) }}>
          {response.status >= 200 && response.status < 400 ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {response.status} {response.statusText}
        </span>
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--vos-text-tertiary)' }}>
          <Clock size={11} />
          {formatDuration(response.durationMs)}
        </span>
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--vos-text-tertiary)' }}>
          <Database size={11} />
          {formatSize(response.sizeBytes)}
        </span>

        <div className="flex-1" />

        {/* Response tabs */}
        <div className="flex items-center gap-0.5">
          <button
            className="px-2.5 py-1 rounded text-xs"
            style={{
              background: activeTab === 'body' ? 'var(--vos-bg-tertiary)' : 'transparent',
              color: activeTab === 'body' ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)'
            }}
            onClick={() => setActiveTab('body')}
          >
            Body
          </button>
          <button
            className="px-2.5 py-1 rounded text-xs"
            style={{
              background: activeTab === 'headers' ? 'var(--vos-bg-tertiary)' : 'transparent',
              color: activeTab === 'headers' ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)'
            }}
            onClick={() => setActiveTab('headers')}
          >
            Headers ({response.headers.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'body' && (
          <pre
            className="p-3 text-xs font-mono whitespace-pre-wrap break-all"
            style={{ color: 'var(--vos-text-primary)' }}
          >
            {formatted}
          </pre>
        )}

        {activeTab === 'headers' && (
          <div className="text-xs">
            {response.headers.map((h, i) => (
              <div
                key={i}
                className="flex items-center px-3 py-1.5"
                style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
              >
                <span className="w-48 shrink-0 font-medium" style={{ color: 'var(--vos-text-secondary)' }}>
                  {h.key}
                </span>
                <span className="flex-1 truncate" style={{ color: 'var(--vos-text-primary)' }}>
                  {h.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
