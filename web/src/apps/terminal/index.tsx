/**
 * Terminal App — Multi-tab local terminal emulator
 *
 * Each tab runs an independent WebShell (xterm.js + WebSocket).
 * Supports: add/close tabs, rename tabs, font size adjustment.
 * When opened via SSH app, accepts sshTarget in appState.
 */
import { Minus, Plus, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStorage, useWindowStore } from '@/kernel'

const WebShell = lazy(() => import('@/shell/WebShell'))

interface Tab {
  id: string
  title: string
  target: string
  cwd?: string
}

let tabCounter = 0
function nextTabId() {
  return `tab-${++tabCounter}`
}

export default function TerminalApp(_props: { windowId: string; processId: number }) {
  const storage = useAppStorage('terminal')
  // Check if opened from SSH app with a target
  const win = useWindowStore(s => s.windows.find(w => w.id === _props.windowId))
  const sshTarget = win?.appState?.sshTarget as string | undefined
  const sshName = win?.appState?.sshName as string | undefined
  const initialCwd = win?.appState?.cwd as string | undefined

  const [tabs, setTabs] = useState<Tab[]>(() => {
    const id = nextTabId()
    const title = sshName ? `SSH: ${sshName}` : 'Shell 1'
    const target = sshTarget ?? 'local'
    return [{ id, title, target, cwd: initialCwd }]
  })
  const [activeTab, setActiveTab] = useState(tabs[0].id)
  const [fontSize, setFontSize] = useState(13)
  const editingRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Load persisted font size
  useEffect(() => {
    storage.getJSON<{ fontSize?: number }>('preferences').then(prefs => {
      if (prefs?.fontSize) setFontSize(prefs.fontSize)
    })
  }, [storage])

  const addTab = useCallback(() => {
    const id = nextTabId()
    const num = tabs.length + 1
    const tab: Tab = { id, title: `Shell ${num}`, target: 'local' }
    setTabs(prev => [...prev, tab])
    setActiveTab(id)
  }, [tabs.length])

  const closeTab = useCallback(
    (id: string) => {
      setTabs(prev => {
        const next = prev.filter(t => t.id !== id)
        if (next.length === 0) {
          // Always keep at least one tab
          const newId = nextTabId()
          return [{ id: newId, title: 'Shell 1' }]
        }
        return next
      })
      setActiveTab(prev => {
        if (prev !== id) return prev
        const remaining = tabs.filter(t => t.id !== id)
        if (remaining.length === 0) return ''
        return remaining[Math.max(0, remaining.length - 1)].id
      })
    },
    [tabs]
  )

  const startRename = (id: string) => {
    editingRef.current = id
    // Force re-render to show input
    setTabs(prev => [...prev])
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitRename = (id: string, newTitle: string) => {
    editingRef.current = null
    const title = newTitle.trim() || 'Shell'
    setTabs(prev => prev.map(t => (t.id === id ? { ...t, title } : t)))
  }

  const adjustFontSize = (delta: number) => {
    setFontSize(prev => {
      const next = Math.min(24, Math.max(8, prev + delta))
      storage.setJSON('preferences', { fontSize: next })
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center h-8 flex-shrink-0 overflow-x-auto border-b border-b-[#333]">
        {tabs.map(tab => {
          const isActive = tab.id === activeTab
          const isEditing = editingRef.current === tab.id
          return (
            <div
              key={tab.id}
              className="group flex items-center gap-1 px-3 h-full cursor-pointer text-xs select-none flex-shrink-0 border-r border-r-[#333] max-w-[160px]"
              style={{
                background: isActive ? '#0d0d0d' : 'transparent',
                color: isActive ? '#d4d4d4' : '#888'
              }}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => startRename(tab.id)}
              onKeyDown={() => {}}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="bg-transparent border-none outline-none text-xs text-[#d4d4d4] w-[80px]"
                  defaultValue={tab.title}
                  onBlur={e => commitRename(tab.id, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(tab.id, (e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') {
                      editingRef.current = null
                      setTabs(prev => [...prev])
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="truncate">{tab.title}</span>
              )}
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="bg-transparent border-none cursor-pointer p-0 opacity-0 group-hover:opacity-100 text-[#888] leading-[0]"
                  onClick={e => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          )
        })}
        <button
          type="button"
          className="bg-transparent border-none cursor-pointer px-2 h-full flex items-center text-[#888]"
          onClick={addTab}
          title="新建标签"
        >
          <Plus size={12} />
        </button>
        <span className="flex-1" />
        {/* Font size controls */}
        <div className="flex items-center gap-1 px-2">
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0 text-[#888]"
            onClick={() => adjustFontSize(-1)}
            title="缩小字体"
          >
            <Minus size={10} />
          </button>
          <span className="text-[10px] text-[#666]">
            {fontSize}px
          </span>
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0 text-[#888]"
            onClick={() => adjustFontSize(1)}
            title="放大字体"
          >
            <Plus size={10} />
          </button>
        </div>
      </div>

      {/* Terminal panels — each tab keeps an independent terminal alive */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{
              visibility: tab.id === activeTab ? 'visible' : 'hidden'
            }}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-[#666]">
                  加载中…
                </div>
              }
            >
              <WebShell target={tab.target} cwd={tab.cwd} />
            </Suspense>
          </div>
        ))}
      </div>
    </div>
  )
}
