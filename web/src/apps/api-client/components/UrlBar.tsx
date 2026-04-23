import { Check, Loader2, Send, Terminal } from 'lucide-react'
import { useState } from 'react'
import { DropdownSelect } from '@/components/ui'
import { HTTP_METHODS, METHOD_COLORS } from '../constants'
import { toast } from '@/components/Toast'
import { useApiClientStore } from '../store'
import type { HttpMethod } from '../types'
import { parseCurl, toCurl } from '../utils/curl'

export default function UrlBar() {
  const tabs = useApiClientStore(s => s.tabs)
  const activeTabId = useApiClientStore(s => s.activeTabId)
  const updateTabRequest = useApiClientStore(s => s.updateTabRequest)
  const sendRequest = useApiClientStore(s => s.sendRequest)
  const isSending = useApiClientStore(s => s.isSending)

  const activeTab = tabs.find(t => t.id === activeTabId)
  const [copied, setCopied] = useState(false)
  if (!activeTab) return null

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 shrink-0"
      style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
    >
      {/* Method selector */}
      <DropdownSelect
        className="w-[92px] shrink-0"
        value={activeTab.method}
        options={HTTP_METHODS.map(method => ({ value: method, label: method, color: METHOD_COLORS[method] }))}
        onChange={value => updateTabRequest(activeTab.id, { method: value as HttpMethod })}
        renderTriggerContent={option => (
          <span className="text-xs font-bold uppercase" style={{ color: METHOD_COLORS[(option?.value ?? activeTab.method) as HttpMethod] }}>
            {option?.label ?? activeTab.method}
          </span>
        )}
        renderOption={(option, selected) => (
          <span
            className="flex items-center justify-between min-w-0 flex-1 text-xs font-bold uppercase"
            style={{ color: selected ? METHOD_COLORS[option.value as HttpMethod] : option.color }}
          >
            <span>{option.label}</span>
          </span>
        )}
      />

      {/* URL input */}
      <input
        className="flex-1 px-3 py-1.5 rounded text-sm bg-transparent outline-none"
        style={{
          color: 'var(--vos-text-primary)',
          background: 'var(--vos-bg-tertiary)',
          border: '1px solid var(--vos-border-subtle)'
        }}
        value={activeTab.url}
        placeholder="Enter request URL or paste a cURL command..."
        onChange={e => updateTabRequest(activeTab.id, { url: e.target.value })}
        onPaste={e => {
          const text = e.clipboardData.getData('text')
          const parsed = parseCurl(text)
          if (parsed) {
            e.preventDefault()
            updateTabRequest(activeTab.id, {
              url: parsed.url,
              method: parsed.method,
              request: {
                ...(activeTab.request ?? {}),
                headers: parsed.headers,
                body: parsed.body,
                auth: parsed.auth
              }
            })
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !isSending) {
            sendRequest(activeTab.id)
          }
        }}
      />

      {/* Copy as cURL */}
      <button
        className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] cursor-pointer"
        style={{
          color: copied ? 'var(--vos-accent-success)' : 'var(--vos-text-tertiary)',
          background: 'var(--vos-bg-tertiary)',
          border: '1px solid var(--vos-border-subtle)'
        }}
        title="Copy as cURL"
        onClick={() => {
          const curl = toCurl({
            url: activeTab.url,
            method: activeTab.method,
            headers: activeTab.request.headers,
            body: activeTab.request.body,
            auth: activeTab.request.auth
          })
          navigator.clipboard.writeText(curl).then(() => toast.success('已复制'))
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check size={12} /> : <Terminal size={12} />}
        {copied ? 'Copied' : 'cURL'}
      </button>

      {/* Send button */}
      <button
        className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium text-white"
        style={{
          background: isSending ? '#9ca3af' : 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
          opacity: isSending ? 0.7 : 1
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
