import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MessageSquare, Plus, Send, Sparkles, Trash2, User, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/infra/api'
import type { ChatMessage, ChatSession } from '@/infra/api'
import { tokens } from '@/theme'
import { useAISidePanelStore } from './store'

const PANEL_WIDTH = 380
const TOP_BAR_H = tokens.topBar.height

export default function AISidePanel() {
  const { isOpen, close } = useAISidePanelStore()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(async () => {
    try { const r = await apiClient.getAgentSessions(); setSessions(r.data) } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { if (isOpen) loadSessions() }, [isOpen, loadSessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectSession = async (id: string) => {
    setCurrentSession(id)
    setShowSessions(false)
    try {
      const r = await apiClient.getAgentSession(id)
      setMessages(r.data.messages)
    } catch (e) { console.error(e) }
  }

  const newSession = () => {
    setCurrentSession(null)
    setMessages([])
    setShowSessions(false)
  }

  const deleteSession = async (id: string) => {
    await apiClient.deleteAgentSession(id)
    if (currentSession === id) { setCurrentSession(null); setMessages([]) }
    loadSessions()
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    try {
      const r = await apiClient.agentChat({ message: text, session_id: currentSession ?? undefined })
      setMessages(prev => [...prev, { role: 'assistant', content: r.data.message, timestamp: new Date().toISOString() }])
      if (!currentSession && r.data.session_id) {
        setCurrentSession(r.data.session_id)
        loadSessions()
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，出了点问题。', timestamp: new Date().toISOString() }])
      console.error(e)
    }
    setSending(false)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: PANEL_WIDTH }}
          animate={{ x: 0 }}
          exit={{ x: PANEL_WIDTH }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          style={{
            position: 'fixed',
            top: TOP_BAR_H,
            right: 0,
            bottom: 0,
            width: PANEL_WIDTH,
            zIndex: 9000,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--vos-bg-primary)',
            borderLeft: '0.5px solid var(--vos-border-subtle)',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderBottom: '0.5px solid var(--vos-border-subtle)',
            background: 'var(--vos-bg-surface)',
            flexShrink: 0,
          }}>
            <Sparkles size={14} style={{ color: 'var(--vos-accent-primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: 'var(--vos-text-primary)' }}>AI 助手</span>
            <button type="button" className="vos-topbar-btn" onClick={() => setShowSessions(!showSessions)} title="会话列表" style={{ padding: 4 }}>
              <MessageSquare size={13} style={{ color: 'var(--vos-text-tertiary)' }} />
            </button>
            <button type="button" className="vos-topbar-btn" onClick={newSession} title="新建会话" style={{ padding: 4 }}>
              <Plus size={13} style={{ color: 'var(--vos-text-tertiary)' }} />
            </button>
            <button type="button" className="vos-topbar-btn" onClick={close} title="关闭" style={{ padding: 4 }}>
              <X size={13} style={{ color: 'var(--vos-text-tertiary)' }} />
            </button>
          </div>

          {/* Session list overlay */}
          <AnimatePresence>
            {showSessions && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  position: 'absolute',
                  top: 42,
                  left: 0,
                  right: 0,
                  maxHeight: 240,
                  overflow: 'auto',
                  zIndex: 10,
                  background: 'var(--vos-bg-surface)',
                  borderBottom: '0.5px solid var(--vos-border-subtle)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                }}
              >
                {sessions.length === 0 && (
                  <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--vos-text-tertiary)' }}>暂无会话</div>
                )}
                {sessions.map(s => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                      background: currentSession === s.id ? 'var(--vos-bg-item-hover)' : 'transparent',
                    }}
                  >
                    <MessageSquare size={12} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--vos-text-primary)' }} onClick={() => selectSession(s.id)}>{s.title}</span>
                    <button type="button" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--vos-text-tertiary)' }} onClick={() => deleteSession(s.id)}><Trash2 size={10} /></button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                  <Sparkles size={32} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: 'var(--vos-text-secondary)' }}>VentoOS AI 助手</div>
                  <div style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', marginTop: 4 }}>输入问题开始对话</div>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 12,
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                <div style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: msg.role === 'assistant' ? 'var(--vos-accent-primary)' : 'var(--vos-bg-input)',
                  color: msg.role === 'assistant' ? '#fff' : 'var(--vos-text-primary)',
                }}>
                  {msg.role === 'assistant' ? <Sparkles size={12} /> : <User size={12} />}
                </div>
                <div style={{
                  maxWidth: '80%',
                  padding: '6px 10px',
                  borderRadius: msg.role === 'user' ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                  fontSize: 12,
                  lineHeight: 1.5,
                  background: msg.role === 'user' ? 'var(--vos-accent-primary)' : 'var(--vos-bg-surface)',
                  color: msg.role === 'user' ? '#fff' : 'var(--vos-text-primary)',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--vos-accent-primary)', color: '#fff' }}>
                  <Sparkles size={12} />
                </div>
                <div style={{ padding: '6px 10px', borderRadius: 10, background: 'var(--vos-bg-surface)' }}>
                  <Loader2 size={12} className="vos-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderTop: '0.5px solid var(--vos-border-subtle)',
            flexShrink: 0,
          }}>
            <input
              type="text"
              style={{
                flex: 1,
                fontSize: 12,
                background: 'var(--vos-bg-input)',
                color: 'var(--vos-text-primary)',
                border: '0.5px solid var(--vos-border-subtle)',
                borderRadius: 8,
                padding: '6px 10px',
                outline: 'none',
              }}
              placeholder="输入问题..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: 'var(--vos-accent-primary)',
                color: '#fff',
              }}
              onClick={handleSend}
              disabled={sending}
            >
              <Send size={12} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
