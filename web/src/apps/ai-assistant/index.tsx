import {
  ChevronDown,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  User,
  Wrench,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentMessage, ChatSession, ProviderConfig, StreamEvent, ToolDefinition } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'

// ─── Message display component ─────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AgentMessage }) {
  if (msg.role === 'system') return null

  if (msg.role === 'tool') {
    return (
      <div className="flex gap-3 mb-3">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
        >
          <Terminal size={14} />
        </div>
        <div
          className="max-w-[80%] px-3 py-2 rounded-lg text-xs leading-relaxed"
          style={{
            background: 'var(--vos-bg-surface)',
            color: 'var(--vos-text-secondary)',
            border: '0.5px solid var(--vos-border-subtle)',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          <div className="text-xs mb-1" style={{ color: 'var(--vos-text-tertiary)' }}>
            <Wrench size={10} className="inline mr-1" />
            {msg.name ?? 'tool'}
          </div>
          {(msg.content ?? '').slice(0, 500)}
          {(msg.content?.length ?? 0) > 500 && '...'}
        </div>
      </div>
    )
  }

  const isUser = msg.role === 'user'

  return (
    <div className="flex gap-3 mb-4" style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{
          background: isUser ? 'var(--vos-bg-input)' : 'var(--vos-accent-primary)',
          color: isUser ? 'var(--vos-text-primary)' : '#fff'
        }}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>
      <div
        className="max-w-[70%] px-3 py-2 rounded-lg text-sm leading-relaxed"
        style={{
          background: isUser ? 'var(--vos-accent-primary)' : 'var(--vos-bg-surface)',
          color: isUser ? '#fff' : 'var(--vos-text-primary)',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          whiteSpace: 'pre-wrap'
        }}
      >
        {msg.content ?? ''}
        {msg.tool_calls?.map(tc => (
          <div
            key={tc.id}
            className="mt-2 px-2 py-1 rounded text-xs"
            style={{ background: 'rgba(0,0,0,0.1)', fontFamily: 'monospace' }}
          >
            <Wrench size={10} className="inline mr-1" />
            {tc.function.name}({tc.function.arguments})
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tool call event display ───────────────────────────────────────────────

function ToolCallEvent({ event }: { event: StreamEvent }) {
  if (event.type === 'tool_call_start') {
    return (
      <div className="flex gap-3 mb-2">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
        >
          <Wrench size={14} />
        </div>
        <div className="text-xs py-2" style={{ color: 'var(--vos-text-tertiary)' }}>
          Calling <strong>{event.name}</strong>...
        </div>
      </div>
    )
  }

  if (event.type === 'tool_result') {
    return (
      <div className="flex gap-3 mb-3">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: event.success ? 'var(--vos-bg-input)' : 'rgba(255,59,48,0.15)',
            color: event.success ? 'var(--vos-text-tertiary)' : '#ff3b30'
          }}
        >
          <Terminal size={14} />
        </div>
        <div
          className="max-w-[80%] px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'var(--vos-bg-surface)',
            border: `0.5px solid ${event.success ? 'var(--vos-border-subtle)' : 'rgba(255,59,48,0.3)'}`,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          <div className="mb-1" style={{ color: 'var(--vos-text-tertiary)' }}>
            {event.name} → {event.success ? '✓' : '✗'}
          </div>
          <div style={{ color: 'var(--vos-text-secondary)' }}>
            {event.content.slice(0, 300)}
            {event.content.length > 300 && '...'}
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ─── Settings Panel ────────────────────────────────────────────────────────

function SettingsPanel({
  onClose,
  providers,
  onReload
}: {
  onClose: () => void
  providers: ProviderConfig[]
  onReload: () => void
}) {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!name || !apiKey || !baseUrl || !model) return
    setSaving(true)
    try {
      await apiClient.createAgentProvider({
        id: '',
        name,
        provider_type: 'open_ai',
        api_key: apiKey,
        base_url: baseUrl,
        default_model: model,
        enabled: true
      })
      onReload()
      setName('')
      setApiKey('')
      setModel('gpt-4o')
    } catch (e) {
      console.error(e)
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteAgentProvider(id)
      onReload()
    } catch (e) {
      console.error(e)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      const config = await apiClient.getAgentConfig()
      await apiClient.updateAgentConfig({ ...config.data, default_provider_id: id })
    } catch (e) {
      console.error(e)
    }
  }

  const inputStyle = {
    width: '100%',
    fontSize: 12,
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '0.5px solid var(--vos-border-subtle)',
    borderRadius: 6,
    padding: '6px 8px',
    outline: 'none'
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
      >
        <Settings size={14} style={{ color: 'var(--vos-text-tertiary)' }} />
        <span className="text-xs font-medium flex-1">Provider Settings</span>
        <button
          type="button"
          className="bg-transparent border-none cursor-pointer p-0"
          style={{ color: 'var(--vos-text-tertiary)' }}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Existing providers */}
        {providers.map(p => (
          <div
            key={p.id}
            className="mb-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'var(--vos-bg-surface)', border: '0.5px solid var(--vos-border-subtle)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                {p.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                {p.default_model}
              </span>
            </div>
            <div style={{ color: 'var(--vos-text-tertiary)' }}>
              {p.base_url} · Key: {p.api_key}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="text-xs bg-transparent border-none cursor-pointer"
                style={{ color: 'var(--vos-accent-primary)' }}
                onClick={() => handleSetDefault(p.id)}
              >
                Set Default
              </button>
              <button
                type="button"
                className="text-xs bg-transparent border-none cursor-pointer"
                style={{ color: '#ff3b30' }}
                onClick={() => handleDelete(p.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {providers.length === 0 && (
          <div className="text-xs mb-3 text-center py-4" style={{ color: 'var(--vos-text-tertiary)' }}>
            No providers configured. Add one to start chatting.
          </div>
        )}

        {/* Add new provider form */}
        <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid var(--vos-border-subtle)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
            Add Provider
          </div>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Name (e.g. OpenAI)"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Base URL"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="API Key"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Model (e.g. gpt-4o)"
              value={model}
              onChange={e => setModel(e.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              className="w-full text-xs py-1.5 rounded-lg border-none cursor-pointer"
              style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              onClick={handleAdd}
              disabled={saving}
            >
              {saving ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main AI Assistant App ─────────────────────────────────────────────────

export default function AIAssistantApp(_props: AppComponentProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [toolEvents, setToolEvents] = useState<StreamEvent[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(async () => {
    try {
      const r = await apiClient.getAgentSessions()
      setSessions(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  const loadProviders = useCallback(async () => {
    try {
      const r = await apiClient.getAgentProviders()
      setProviders(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadSessions()
    loadProviders()
  }, [loadSessions, loadProviders])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, toolEvents])

  const selectSession = async (id: string) => {
    setCurrentSession(id)
    setStreamingContent('')
    setToolEvents([])
    try {
      const r = await apiClient.getAgentSession(id)
      setMessages(r.data.messages)
    } catch (e) {
      console.error(e)
    }
  }

  const newSession = () => {
    setCurrentSession(null)
    setMessages([])
    setStreamingContent('')
    setToolEvents([])
  }

  const deleteSession = async (id: string) => {
    await apiClient.deleteAgentSession(id)
    if (currentSession === id) {
      setCurrentSession(null)
      setMessages([])
    }
    loadSessions()
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setStreamingContent('')
    setToolEvents([])

    // Optimistic user message
    const userMsg: AgentMessage = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    try {
      // Use streaming API
      let sessionId = currentSession
      const events: StreamEvent[] = []

      for await (const event of apiClient.agentChatStream({
        message: text,
        session_id: currentSession ?? undefined
      })) {
        switch (event.type) {
          case 'content_delta':
            setStreamingContent(prev => prev + event.content)
            break
          case 'tool_call_start':
          case 'tool_result':
            events.push(event)
            setToolEvents([...events])
            break
          case 'message_complete':
            // Replace streaming content with the final message
            setStreamingContent('')
            setToolEvents([])
            setMessages(prev => [...prev, event.message])
            break
          case 'done':
            sessionId = event.session_id
            break
          case 'error':
            setStreamingContent('')
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.message}` }])
            break
        }
      }

      if (!currentSession && sessionId) {
        setCurrentSession(sessionId)
        loadSessions()
      }
    } catch (e) {
      setStreamingContent('')
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Make sure a provider is configured.' }
      ])
      console.error(e)
    }
    setSending(false)
  }

  if (showSettings) {
    return (
      <div className="flex h-full">
        <SettingsPanel onClose={() => setShowSettings(false)} providers={providers} onReload={loadProviders} />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{ width: 200, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
            SESSIONS
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-accent-primary)' }}
              onClick={newSession}
              title="New Session"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        {sessions.map(s => (
          <div
            key={s.id}
            className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group"
            style={{ background: currentSession === s.id ? 'var(--vos-bg-item-hover)' : 'transparent' }}
          >
            <MessageSquare size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
            <span className="flex-1 truncate" onClick={() => selectSession(s.id)} onKeyDown={() => {}}>
              {s.title}
            </span>
            <button
              type="button"
              className="hidden group-hover:block bg-transparent border-none p-0 cursor-pointer"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => deleteSession(s.id)}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div
            className="flex-1 flex items-center justify-center text-xs"
            style={{ color: 'var(--vos-text-tertiary)' }}
          >
            No sessions
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto px-4 py-3">
          {messages.length === 0 && !streamingContent && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center">
                <Sparkles size={36} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
                <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                  VentoOS AI Assistant
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                  {providers.length === 0
                    ? 'Configure a provider in Settings to get started'
                    : 'Ask about K8s, databases, Redis, or anything else'}
                </div>
              </div>
            </div>
          )}

          {/* Render messages */}
          {messages.map((msg, i) => (
            <MessageBubble key={`msg-${i}`} msg={msg} />
          ))}

          {/* Render tool events during streaming */}
          {toolEvents.map((evt, i) => (
            <ToolCallEvent key={`tool-${i}`} event={evt} />
          ))}

          {/* Streaming content */}
          {streamingContent && (
            <div className="flex gap-3 mb-4">
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              >
                <Sparkles size={14} />
              </div>
              <div
                className="max-w-[70%] px-3 py-2 rounded-lg text-sm leading-relaxed"
                style={{
                  background: 'var(--vos-bg-surface)',
                  color: 'var(--vos-text-primary)',
                  borderRadius: '12px 12px 12px 4px',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {streamingContent}
                <span className="animate-pulse">▊</span>
              </div>
            </div>
          )}

          {/* Loading indicator when sending but no content yet */}
          {sending && !streamingContent && toolEvents.length === 0 && (
            <div className="flex gap-3 mb-4">
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              >
                <Sparkles size={14} />
              </div>
              <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--vos-bg-surface)' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div
          className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
          style={{ borderTop: '0.5px solid var(--vos-border-subtle)' }}
        >
          <input
            type="text"
            className="flex-1 text-sm bg-transparent border-none outline-none rounded-lg px-3 py-2"
            style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)' }}
            placeholder={providers.length === 0 ? 'Configure a provider first...' : 'Ask anything…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            disabled={providers.length === 0}
          />
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded-lg border-none cursor-pointer"
            style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
            onClick={handleSend}
            disabled={sending || providers.length === 0}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
