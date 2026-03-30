import { Loader2, MessageSquare, Plus, Send, Sparkles, Trash2, User } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatSession } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'

export default function AIAssistantApp(_props: AppComponentProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(async () => {
    try {
      const r = await apiClient.getAgentSessions()
      setSessions(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectSession = async (id: string) => {
    setCurrentSession(id)
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

    // Optimistic user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const r = await apiClient.agentChat({ message: text, session_id: currentSession ?? undefined })
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: r.data.message.content,
          timestamp: new Date().toISOString()
        }
      ])
      if (!currentSession && r.data.session_id) {
        setCurrentSession(r.data.session_id)
        loadSessions()
      }
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong.',
          timestamp: new Date().toISOString()
        }
      ])
      console.error(e)
    }
    setSending(false)
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
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0"
            style={{ color: 'var(--vos-accent-primary)' }}
            onClick={newSession}
          >
            <Plus size={14} />
          </button>
        </div>
        {sessions.map(s => (
          <div
            key={s.id}
            className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group"
            style={{ background: currentSession === s.id ? 'var(--vos-bg-hover)' : 'transparent' }}
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
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center">
                <Sparkles size={36} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
                <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                  VentoOS AI Assistant
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                  Ask about K8s, databases, Redis, or anything else
                </div>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className="flex gap-3 mb-4"
              style={{ flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}
            >
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{
                  background: msg.role === 'assistant' ? 'var(--vos-accent-primary)' : 'var(--vos-bg-input)',
                  color: msg.role === 'assistant' ? '#fff' : 'var(--vos-text-primary)'
                }}
              >
                {msg.role === 'assistant' ? <Sparkles size={14} /> : <User size={14} />}
              </div>
              <div
                className="max-w-[70%] px-3 py-2 rounded-lg text-sm leading-relaxed"
                style={{
                  background: msg.role === 'user' ? 'var(--vos-accent-primary)' : 'var(--vos-bg-surface)',
                  color: msg.role === 'user' ? '#fff' : 'var(--vos-text-primary)',
                  borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px'
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
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
            placeholder="Ask anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded-lg border-none cursor-pointer"
            style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
            onClick={handleSend}
            disabled={sending}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
