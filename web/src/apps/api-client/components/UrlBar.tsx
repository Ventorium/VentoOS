import { ChevronDown, Loader2, Save, Send } from 'lucide-react'
import { useState } from 'react'
import { useApiClientStore } from '../store'
import { HTTP_METHODS, METHOD_COLORS } from '../constants'
import type { HttpMethod } from '../types'

export default function UrlBar() {
  const tabs = useApiClientStore((s) => s.tabs)
  const activeTabId = useApiClientStore((s) => s.activeTabId)
  const updateTabRequest = useApiClientStore((s) => s.updateTabRequest)
  const sendRequest = useApiClientStore((s) => s.sendRequest)
  const isSending = useApiClientStore((s) => s.isSending)
  const [methodDropdownOpen, setMethodDropdownOpen] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  if (!activeTab) return null

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 shrink-0"
      style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
    >
      {/* Method selector */}
      <div className="relative">
        <button
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold uppercase"
          style={{
            color: METHOD_COLORS[activeTab.method],
            background: 'var(--vos-bg-tertiary)',
            border: '1px solid var(--vos-border-subtle)',
          }}
          onClick={() => setMethodDropdownOpen(!methodDropdownOpen)}
        >
          {activeTab.method}
          <ChevronDown size={11} />
        </button>
        {methodDropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMethodDropdownOpen(false)} />
            <div
              className="absolute left-0 top-full mt-1 z-50 min-w-24 rounded-md shadow-lg py-1"
              style={{
                background: 'var(--vos-bg-elevated)',
                border: '1px solid var(--vos-border-subtle)',
              }}
            >
              {HTTP_METHODS.map((m) => (
                <div
                  key={m}
                  className="px-3 py-1.5 text-xs font-bold cursor-pointer hover:opacity-80"
                  style={{ color: METHOD_COLORS[m] }}
                  onClick={() => {
                    updateTabRequest(activeTab.id, { method: m })
                    setMethodDropdownOpen(false)
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* URL input */}
      <input
        className="flex-1 px-3 py-1.5 rounded text-sm bg-transparent outline-none"
        style={{
          color: 'var(--vos-text-primary)',
          background: 'var(--vos-bg-tertiary)',
          border: '1px solid var(--vos-border-subtle)',
        }}
        value={activeTab.url}
        placeholder="Enter request URL..."
        onChange={(e) => updateTabRequest(activeTab.id, { url: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isSending) {
            sendRequest(activeTab.id)
          }
        }}
      />

      {/* Send button */}
      <button
        className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium text-white"
        style={{
          background: isSending ? '#9ca3af' : 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
          opacity: isSending ? 0.7 : 1,
        }}
        disabled={isSending}
        onClick={() => sendRequest(activeTab.id)}
      >
        {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        Send
      </button>
    </div>
  )
}
