import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MessageSquare, Plus, Send, Sparkles, Trash2, User, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentMessage, ChatSession } from '@/apps/ai-assistant/api'
import { agentApi } from '@/apps/ai-assistant/api'
import { tokens } from '@/theme'
import { useAISidePanelStore } from './store'

const PANEL_WIDTH = 380
const TOP_BAR_H = tokens.topBar.height

export default function AISidePanel() {
  const { isOpen, close } = useAISidePanelStore()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(async () => {
    try {
      const r = await agentApi.getAgentSessions()
      setSessions(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (isOpen) loadSessions()
  }, [isOpen, loadSessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectSession = async (id: string) => {
    setCurrentSession(id)
    setShowSessions(false)
    try {
      const r = await agentApi.getAgentSession(id)
      setMessages(r.data.messages)
    } catch (e) {
      console.error(e)
    }
  }

  const newSession = () => {
    setCurrentSession(null)
    setMessages([])
    setShowSessions(false)
  }

  const deleteSession = async (id: string) => {
    await agentApi.deleteAgentSession(id)
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

    const userMsg: AgentMessage = {
      role: 'user',
      content: text
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const r = await agentApi.agentChat({ message: text, session_id: currentSession ?? undefined })
      setMessages(prev => [...prev, r.data.message])
      if (!currentSession && r.data.session_id) {
        setCurrentSession(r.data.session_id)
        loadSessions()
      }
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant' as const,
          content: '抱歉，出了点问题。'
        }
      ])
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
          className="fixed right-0 bottom-0 z-[9000] flex flex-col bg-[var(--vos-bg-primary)] border-l-[0.5px] border-l-solid border-l-[var(--vos-border-subtle)]"
          style={{
            top: TOP_BAR_H,
            width: PANEL_WIDTH,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)'
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] shrink-0">
            <Sparkles size={14} className="text-[var(--vos-accent-primary)]" />
            <span className="text-[13px] font-semibold flex-1 text-[var(--vos-text-primary)]">AI 助手</span>
            <button
              type="button"
              className="vos-topbar-btn p-1"
              onClick={() => setShowSessions(!showSessions)}
              title="会话列表"
            >
              <MessageSquare size={13} className="text-[var(--vos-text-tertiary)]" />
            </button>
            <button type="button" className="vos-topbar-btn p-1" onClick={newSession} title="新建会话">
              <Plus size={13} className="text-[var(--vos-text-tertiary)]" />
            </button>
            <button type="button" className="vos-topbar-btn p-1" onClick={close} title="关闭">
              <X size={13} className="text-[var(--vos-text-tertiary)]" />
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
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
                }}
              >
                {sessions.length === 0 && (
                  <div className="p-4 text-center text-xs text-[var(--vos-text-tertiary)]">暂无会话</div>
                )}
                {sessions.map(s => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs ${currentSession === s.id ? 'bg-[var(--vos-bg-item-hover)]' : 'bg-transparent'}`}
                  >
                    <MessageSquare size={12} className="text-[var(--vos-text-tertiary)] shrink-0" />
                    <span
                      className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--vos-text-primary)]"
                      onClick={() => selectSession(s.id)}
                    >
                      {s.title}
                    </span>
                    <button
                      type="button"
                      className="bg-transparent border-none p-0 cursor-pointer text-[var(--vos-text-tertiary)]"
                      onClick={() => deleteSession(s.id)}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat messages */}
          <div className="flex-1 overflow-auto p-3">
            {messages.length === 0 && (
              <div className="vos-flex-center h-full">
                <div className="text-center">
                  <Sparkles size={32} className="text-[var(--vos-text-tertiary)] mx-auto mb-2" />
                  <div className="text-[13px] text-[var(--vos-text-secondary)]">VentoOS AI 助手</div>
                  <div className="text-[11px] text-[var(--vos-text-tertiary)] mt-1">输入问题开始对话</div>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 mb-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={
                    msg.role === 'assistant'
                      ? 'shrink-0 w-6 h-6 rounded-full vos-flex-center bg-[var(--vos-accent-primary)] text-white'
                      : 'shrink-0 w-6 h-6 rounded-full vos-flex-center bg-[var(--vos-bg-input)] text-[var(--vos-text-primary)]'
                  }
                >
                  {msg.role === 'assistant' ? <Sparkles size={12} /> : <User size={12} />}
                </div>
                <div
                  className={
                    msg.role === 'user'
                      ? 'max-w-[80%] px-2.5 py-1.5 text-xs leading-normal rounded-[10px_10px_3px_10px] bg-[var(--vos-accent-primary)] text-white'
                      : 'max-w-[80%] px-2.5 py-1.5 text-xs leading-normal rounded-[10px_10px_10px_3px] bg-[var(--vos-bg-surface)] text-[var(--vos-text-primary)]'
                  }
                >
                  {msg.content ?? ''}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2 mb-3">
                <div className="shrink-0 w-6 h-6 rounded-full vos-flex-center bg-[var(--vos-accent-primary)] text-white">
                  <Sparkles size={12} />
                </div>
                <div className="px-2.5 py-1.5 rounded-[10px] bg-[var(--vos-bg-surface)]">
                  <Loader2 size={12} className="vos-spin text-[var(--vos-text-tertiary)]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 border-t-[0.5px] border-t-solid border-t-[var(--vos-border-subtle)] shrink-0">
            <input
              type="text"
              className="flex-1 text-xs bg-[var(--vos-bg-input)] text-[var(--vos-text-primary)] border-[0.5px] border-solid border-[var(--vos-border-subtle)] rounded-lg px-2.5 py-1.5 outline-none"
              placeholder="输入问题..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button
              type="button"
              className="vos-flex-center w-7 h-7 rounded-lg border-none cursor-pointer bg-[var(--vos-accent-primary)] text-white"
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
