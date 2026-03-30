import { Send, Sparkles, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppComponentProps } from '@/kernel'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export default function AIAssistantApp(_props: AppComponentProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "Hello! I'm VentoOS AI Assistant. I can help you manage Kubernetes clusters, databases, Redis instances, and more. What would you like to do?",
      timestamp: Date.now()
    }
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  })

  const handleSend = () => {
    const text = input.trim()
    if (!text) return

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')

    // Simulated assistant response
    setTimeout(() => {
      const reply: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `I received your message: "${text}". AI Agent integration is coming in a future release.`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, reply])
    }, 600)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {messages.map(msg => (
          <div
            key={msg.id}
            className="flex gap-3 mb-4"
            style={{
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}
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
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '0.5px solid var(--vos-border-subtle)' }}
      >
        <input
          type="text"
          className="flex-1 text-sm bg-transparent border-none outline-none rounded-lg px-3 py-2"
          style={{
            background: 'var(--vos-bg-input)',
            color: 'var(--vos-text-primary)'
          }}
          placeholder="Ask anything…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 rounded-lg border-none cursor-pointer"
          style={{
            background: 'var(--vos-accent-primary)',
            color: '#fff'
          }}
          onClick={handleSend}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
