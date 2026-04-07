import {
  Bot,
  ChevronDown,
  Cpu,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  User,
  Wand2,
  Wrench
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentConfig, AgentProfile, ChatSession, ProviderConfig, StreamEvent } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { openWindow, useAppStorage } from '@/kernel'

const panelBorder = '0.5px solid var(--vos-border-subtle)'

function SelectInput({
  value,
  onChange,
  options,
  placeholder
}: {
  value?: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full text-xs rounded-lg px-2 py-1.5 border-none outline-none"
      style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)' }}
    >
      <option value="">{placeholder ?? '请选择'}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function MessageBubble({ msg }: { msg: ChatSession['messages'][number] }) {
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
            color: 'var(--vos-text-secondary)',
            border: panelBorder,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          <div className="text-xs mb-1" style={{ color: 'var(--vos-text-tertiary)' }}>
            <Wrench size={10} className="inline mr-1" />
            {msg.name ?? 'tool'}
          </div>
          {(msg.content ?? '').slice(0, 600)}
          {(msg.content?.length ?? 0) > 600 && '...'}
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
        className="max-w-[72%] px-3 py-2 rounded-lg text-sm leading-relaxed"
        style={{
          background: isUser ? 'var(--vos-accent-primary)' : 'var(--vos-bg-surface)',
          color: isUser ? '#fff' : 'var(--vos-text-primary)',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          whiteSpace: 'pre-wrap'
        }}
      >
        {msg.content ?? ''}
      </div>
    </div>
  )
}

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
            border: panelBorder,
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

export default function AIAssistantApp(_props: AppComponentProps) {
  const storage = useAppStorage('ai-assistant')
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatSession['messages']>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [toolEvents, setToolEvents] = useState<StreamEvent[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load persisted preferences
  useEffect(() => {
    storage.getJSON<{ selectedAgentId?: string }>('preferences').then(prefs => {
      if (prefs?.selectedAgentId) setSelectedAgentId(prefs.selectedAgentId)
    })
  }, [storage])

  const activeProfile = useMemo(
    () => profiles.find(profile => profile.id === selectedAgentId) ?? null,
    [profiles, selectedAgentId]
  )
  const activeProvider = useMemo(
    () => providers.find(provider => provider.id === config?.default_provider_id) ?? null,
    [providers, config?.default_provider_id]
  )

  const loadSessions = useCallback(async () => {
    const response = await apiClient.getAgentSessions()
    setSessions(response.data)
  }, [])

  const loadProviders = useCallback(async () => {
    const response = await apiClient.getAgentProviders()
    setProviders(response.data)
  }, [])

  const loadProfiles = useCallback(async () => {
    const response = await apiClient.getAgentProfiles()
    setProfiles(response.data)
  }, [])

  const loadConfig = useCallback(async () => {
    const response = await apiClient.getAgentConfig()
    setConfig(response.data)
    setSelectedAgentId(response.data.default_agent_profile_id ?? '')
  }, [])

  useEffect(() => {
    void Promise.all([loadSessions(), loadProviders(), loadProfiles(), loadConfig()])
  }, [loadSessions, loadProviders, loadProfiles, loadConfig])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, toolEvents])

  const selectSession = async (id: string) => {
    setCurrentSession(id)
    setStreamingContent('')
    setToolEvents([])
    const response = await apiClient.getAgentSession(id)
    setMessages(response.data.messages)
    setSelectedAgentId(response.data.agent_profile_id ?? config?.default_agent_profile_id ?? '')
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
      newSession()
    }
    await loadSessions()
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    setStreamingContent('')
    setToolEvents([])
    setMessages(prev => [...prev, { role: 'user', content: text }])

    try {
      let sessionId = currentSession
      const nextEvents: StreamEvent[] = []

      for await (const event of apiClient.agentChatStream({
        message: text,
        session_id: currentSession ?? undefined,
        agent_profile_id: selectedAgentId || undefined
      })) {
        switch (event.type) {
          case 'content_delta':
            setStreamingContent(prev => prev + event.content)
            break
          case 'tool_call_start':
          case 'tool_result':
            nextEvents.push(event)
            setToolEvents([...nextEvents])
            break
          case 'message_complete':
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
      }

      await loadSessions()
    } catch (error) {
      console.error(error)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Check provider connectivity, API key, and selected agent config.'
        }
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-shrink-0 overflow-auto" style={{ width: 220, borderRight: panelBorder }}>
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
            会话
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="vos-btn-reset"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => openWindow('settings', { appState: { category: 'ai' } })}
              title="AI 设置"
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              className="vos-btn-reset"
              style={{ color: 'var(--vos-accent-primary)' }}
              onClick={newSession}
              title="New Session"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        {sessions.map(session => (
          <div
            key={session.id}
            className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group"
            style={{ background: currentSession === session.id ? 'var(--vos-bg-item-hover)' : 'transparent' }}
          >
            <MessageSquare size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
            <span className="flex-1 truncate" onClick={() => void selectSession(session.id)} onKeyDown={() => {}}>
              {session.title}
            </span>
            <button
              type="button"
              className="hidden group-hover:block vos-btn-reset"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => void deleteSession(session.id)}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: panelBorder }}>
          <div className="flex items-center gap-2">
            <Wand2 size={16} style={{ color: 'var(--vos-accent-primary)' }} />
            <span className="text-sm font-medium">AI 助手</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              className="vos-btn-reset p-1.5 rounded-lg"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => openWindow('settings', { appState: { category: 'ai' } })}
              title="AI 设置"
            >
              <Settings size={15} />
            </button>
            <div className="min-w-[220px]">
              <SelectInput
                value={selectedAgentId}
                onChange={(id: string) => {
                  setSelectedAgentId(id)
                  storage.setJSON('preferences', { selectedAgentId: id })
                }}
                options={profiles.map(profile => ({
                  value: profile.id,
                  label: profile.name
                }))}
                placeholder="选择 Agent"
              />
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
            >
              <Cpu size={12} />
              {activeProvider ? activeProvider.name : '未配置 Provider'}
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
            >
              <Bot size={12} />
              {activeProfile ? activeProfile.name : '未选择 Agent'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {messages.length === 0 && !streamingContent && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center max-w-[520px]">
                <Sparkles size={36} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
                <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                  VentoOS AI Control Center
                </div>
                <div className="text-xs mt-2" style={{ color: 'var(--vos-text-tertiary)' }}>
                  配置 provider、执行 1+1 最小探针、切换预设 / 自定义 agent，然后开始对话。
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <MessageBubble key={`msg-${index}`} msg={msg} />
          ))}

          {toolEvents.map((event, index) => (
            <ToolCallEvent key={`tool-${index}`} event={event} />
          ))}

          {streamingContent && (
            <div className="flex gap-3 mb-4">
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              >
                <Sparkles size={14} />
              </div>
              <div
                className="max-w-[72%] px-3 py-2 rounded-lg text-sm leading-relaxed"
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

        <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: panelBorder }}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <input
                type="text"
                className="w-full text-sm bg-transparent border-none outline-none rounded-lg px-3 py-2"
                style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)' }}
                placeholder={providers.length === 0 ? '请先在系统设置中配置 Provider...' : '输入消息…'}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleSend()}
                disabled={providers.length === 0 || !selectedAgentId}
              />
              <div className="flex items-center gap-4 mt-2 text-[11px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                <span className="flex items-center gap-1">
                  <Bot size={11} />
                  {activeProfile?.description ?? '请选择 Agent Profile'}
                </span>
                <span
                  className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                  onClick={() => openWindow('settings', { appState: { category: 'ai' } })}
                >
                  <ChevronDown size={11} />
                  运行时默认值来自 Provider / Agent 设置
                </span>
              </div>
            </div>
            <button
              type="button"
              className="flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer self-start"
              style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              onClick={() => void handleSend()}
              disabled={sending || providers.length === 0 || !selectedAgentId}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
