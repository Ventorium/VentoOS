/**
 * Super Terminal — Main application container
 *
 * Layout:
 * ┌──────┬──────────────────────────────────────────────┐
 * │ Left │  NavTabs (本地终端|SSH服务器|端口映射|外网) │ SessionTabs │
 * │Panel ├──────────────────────────────────────────────┤
 * │      │  Content Area                                │
 * │      │                                              │
 * └──────┴──────────────────────────────────────────────┘
 */
import { ChevronLeft, ChevronRight, Globe, Network, Server, Settings, TerminalSquare, X, Zap } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStorage } from '@/kernel'
import { superTerminalApi } from './api'
import { useSuperTerminalStore } from './store'
import type { CustomCommand, NavTab } from './types'

const LocalTerminal = lazy(() => import('./components/local-terminal/LocalTerminal'))
const SshServers = lazy(() => import('./components/ssh-servers/SshServers'))
const PortMapping = lazy(() => import('./components/port-mapping/PortMapping'))
const PublicAccess = lazy(() => import('./components/public-access/PublicAccess'))
const SshSession = lazy(() => import('./components/ssh-session/SshSession'))

const NAV_ITEMS: { key: NavTab; label: string; icon: typeof TerminalSquare }[] = [
  { key: 'local-terminal', label: '本地终端', icon: TerminalSquare },
  { key: 'ssh-servers', label: 'SSH 服务器', icon: Server },
  { key: 'port-mapping', label: '端口映射', icon: Network },
  { key: 'public-access', label: '外网访问', icon: Globe }
]

const MAX_VISIBLE_TABS = 6

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full" style={{ color: '#666' }}>
      加载中…
    </div>
  )
}

export default function SuperTerminalApp(_props: { windowId: string; processId: number }) {
  const storage = useAppStorage('super-terminal')
  const {
    activeNavTab,
    setActiveNavTab,
    sessionTabs,
    activeSessionTabId,
    setActiveSessionTab,
    removeSessionTab,
    leftPanelTab,
    setLeftPanelTab,
    setCommands,
    setTerminalSettings
  } = useSuperTerminalStore()

  const [leftPanelWidth] = useState(44)
  const [showMoreTabs, setShowMoreTabs] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  // Load persisted settings & commands on mount
  useEffect(() => {
    storage.getJSON<CustomCommand[]>('commands').then(cmds => {
      if (cmds) setCommands(cmds)
    })
    storage.getJSON('terminal-settings').then(settings => {
      if (settings) setTerminalSettings(settings as Record<string, unknown>)
    })
    // Load servers
    superTerminalApi.getSshServers().then(res => {
      if (res.success && res.data) {
        useSuperTerminalStore.getState().setServers(res.data)
      }
    })
    // Load port mappings
    superTerminalApi.getPortMappings().then(res => {
      if (res.success && res.data) {
        useSuperTerminalStore.getState().setPortMappings(res.data)
      }
    })
  }, [storage, setCommands, setTerminalSettings])

  // Close "more" dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMoreTabs(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const visibleSessionTabs = useMemo(() => sessionTabs.slice(0, MAX_VISIBLE_TABS), [sessionTabs])
  const hiddenSessionTabs = useMemo(() => sessionTabs.slice(MAX_VISIBLE_TABS), [sessionTabs])

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation()
      removeSessionTab(tabId)
    },
    [removeSessionTab]
  )

  // Determine what content to show
  const isShowingSession = activeSessionTabId !== null
  const activeSession = sessionTabs.find(t => t.id === activeSessionTabId)

  return (
    <div className="flex h-full" style={{ background: '#0e0e0e', color: '#d4d4d4' }}>
      {/* Left narrow panel */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          width: leftPanelWidth,
          borderRight: '1px solid #333',
          background: '#111'
        }}
      >
        <div className="flex-1 flex flex-col items-center pt-2 gap-1">
          <button
            type="button"
            className="flex items-center justify-center border-none cursor-pointer"
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: leftPanelTab === 'commands' ? '#1668dc30' : 'transparent',
              color: leftPanelTab === 'commands' ? '#1668dc' : '#888'
            }}
            onClick={() => setLeftPanelTab('commands')}
            title="常用命令"
          >
            <Zap size={16} />
          </button>
          <button
            type="button"
            className="flex items-center justify-center border-none cursor-pointer"
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: leftPanelTab === 'settings' ? '#1668dc30' : 'transparent',
              color: leftPanelTab === 'settings' ? '#1668dc' : '#888'
            }}
            onClick={() => setLeftPanelTab('settings')}
            title="终端设置"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Left panel content (commands or settings) */}
      {leftPanelTab && <LeftPanelContent tab={leftPanelTab} onClose={() => setLeftPanelTab(null)} storage={storage} />}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar: Nav tabs + Session tabs */}
        <div
          className="flex items-center h-9 flex-shrink-0"
          style={{ borderBottom: '1px solid #333', background: '#151515' }}
        >
          {/* Nav tabs */}
          {NAV_ITEMS.map(item => {
            const isActive = activeNavTab === item.key && !isShowingSession
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                className="flex items-center gap-1.5 px-3 h-full border-none cursor-pointer text-xs select-none"
                style={{
                  background: isActive ? '#0e0e0e' : 'transparent',
                  color: isActive ? '#d4d4d4' : '#888',
                  borderRight: '1px solid #333',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => {
                  setActiveNavTab(item.key)
                  setActiveSessionTab(null)
                }}
              >
                <Icon size={13} />
                {item.label}
              </button>
            )
          })}

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: '#444', margin: '0 2px', flexShrink: 0 }} />

          {/* Session tabs */}
          <div className="flex items-center flex-1 min-w-0 overflow-hidden">
            {visibleSessionTabs.map(tab => {
              const isActive = tab.id === activeSessionTabId
              return (
                <div
                  key={tab.id}
                  className="group flex items-center gap-1 px-2.5 h-full cursor-pointer text-xs select-none flex-shrink-0"
                  style={{
                    background: isActive ? '#0e0e0e' : 'transparent',
                    color: isActive ? '#d4d4d4' : '#888',
                    borderRight: '1px solid #333',
                    maxWidth: 150
                  }}
                  onClick={() => setActiveSessionTab(tab.id)}
                  onKeyDown={() => {}}
                >
                  <Server size={11} style={{ flexShrink: 0 }} />
                  <span className="truncate">{tab.title}</span>
                  <button
                    type="button"
                    className="bg-transparent border-none cursor-pointer p-0 opacity-0 group-hover:opacity-100"
                    style={{ color: '#888', lineHeight: 0, flexShrink: 0 }}
                    onClick={e => handleCloseTab(e, tab.id)}
                  >
                    <X size={10} />
                  </button>
                </div>
              )
            })}
            {hiddenSessionTabs.length > 0 && (
              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 h-full border-none cursor-pointer text-xs"
                  style={{ background: 'transparent', color: '#888' }}
                  onClick={() => setShowMoreTabs(!showMoreTabs)}
                >
                  +{hiddenSessionTabs.length} 更多
                  {showMoreTabs ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
                </button>
                {showMoreTabs && (
                  <div
                    className="absolute top-full right-0 z-50"
                    style={{
                      background: '#252525',
                      border: '1px solid #444',
                      borderRadius: 6,
                      minWidth: 160,
                      padding: '4px 0',
                      boxShadow: '0 4px 12px rgba(0,0,0,.4)'
                    }}
                  >
                    {hiddenSessionTabs.map(tab => (
                      <div
                        key={tab.id}
                        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-white/8"
                        onClick={() => {
                          setActiveSessionTab(tab.id)
                          setShowMoreTabs(false)
                        }}
                        onKeyDown={() => {}}
                      >
                        <Server size={11} />
                        <span className="flex-1 truncate">{tab.title}</span>
                        <button
                          type="button"
                          className="bg-transparent border-none cursor-pointer p-0"
                          style={{ color: '#888', lineHeight: 0 }}
                          onClick={e => handleCloseTab(e, tab.id)}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 relative overflow-hidden">
          {/* Nav tab content (visible when no session is active) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              visibility: !isShowingSession && activeNavTab === 'local-terminal' ? 'visible' : 'hidden',
              zIndex: !isShowingSession && activeNavTab === 'local-terminal' ? 1 : 0
            }}
          >
            <Suspense fallback={<LoadingFallback />}>
              <LocalTerminal />
            </Suspense>
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              visibility: !isShowingSession && activeNavTab === 'ssh-servers' ? 'visible' : 'hidden',
              zIndex: !isShowingSession && activeNavTab === 'ssh-servers' ? 1 : 0
            }}
          >
            <Suspense fallback={<LoadingFallback />}>
              <SshServers />
            </Suspense>
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              visibility: !isShowingSession && activeNavTab === 'port-mapping' ? 'visible' : 'hidden',
              zIndex: !isShowingSession && activeNavTab === 'port-mapping' ? 1 : 0
            }}
          >
            <Suspense fallback={<LoadingFallback />}>
              <PortMapping />
            </Suspense>
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              visibility: !isShowingSession && activeNavTab === 'public-access' ? 'visible' : 'hidden',
              zIndex: !isShowingSession && activeNavTab === 'public-access' ? 1 : 0
            }}
          >
            <Suspense fallback={<LoadingFallback />}>
              <PublicAccess />
            </Suspense>
          </div>

          {/* Session tab content */}
          {sessionTabs.map(tab => (
            <div
              key={tab.id}
              style={{
                position: 'absolute',
                inset: 0,
                visibility: tab.id === activeSessionTabId ? 'visible' : 'hidden',
                zIndex: tab.id === activeSessionTabId ? 1 : 0
              }}
            >
              <Suspense fallback={<LoadingFallback />}>
                <SshSession serverId={tab.serverId} serverName={tab.serverName} />
              </Suspense>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Left Panel Content (Commands / Settings) ──────────────────────────────

interface LeftPanelContentProps {
  tab: 'commands' | 'settings'
  onClose: () => void
  storage: ReturnType<typeof useAppStorage>
}

function LeftPanelContent({ tab, onClose, storage }: LeftPanelContentProps) {
  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width: 240,
        borderRight: '1px solid #333',
        background: '#141414'
      }}
    >
      <div
        className="flex items-center justify-between px-3 h-9 flex-shrink-0"
        style={{ borderBottom: '1px solid #333' }}
      >
        <span className="text-xs font-medium" style={{ color: '#ccc' }}>
          {tab === 'commands' ? '常用命令' : '终端设置'}
        </span>
        <button
          type="button"
          className="bg-transparent border-none cursor-pointer p-0"
          style={{ color: '#888', lineHeight: 0 }}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'commands' ? <CommandsPanel storage={storage} /> : <SettingsPanel storage={storage} />}
      </div>
    </div>
  )
}

// ── Commands Panel ────────────────────────────────────────────────────────

function CommandsPanel({ storage }: { storage: ReturnType<typeof useAppStorage> }) {
  const { commands, addCommand, removeCommand, updateCommand, setCommands } = useSuperTerminalStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const persist = useCallback(
    (cmds: typeof commands) => {
      storage.setJSON('commands', cmds)
    },
    [storage]
  )

  const handleAdd = () => {
    if (!newName.trim() || !newCmd.trim()) return
    const cmd = { id: crypto.randomUUID(), name: newName.trim(), command: newCmd.trim() }
    addCommand(cmd)
    const next = [...commands, cmd]
    persist(next)
    setNewName('')
    setNewCmd('')
    setShowAdd(false)
  }

  const handleDelete = (id: string) => {
    removeCommand(id)
    const next = commands.filter(c => c.id !== id)
    persist(next)
  }

  const handleUpdate = (id: string, name: string, command: string) => {
    updateCommand(id, { name, command })
    const next = commands.map(c => (c.id === id ? { ...c, name, command } : c))
    persist(next)
    setEditingId(null)
  }

  // Copy command to clipboard
  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
  }

  return (
    <div className="flex flex-col gap-1">
      {commands.map(cmd =>
        editingId === cmd.id ? (
          <div key={cmd.id} className="flex flex-col gap-1 p-2" style={{ background: '#1a1a1a', borderRadius: 6 }}>
            <input
              className="text-xs px-2 py-1 border-none outline-none"
              style={{ background: '#252525', color: '#d4d4d4', borderRadius: 4 }}
              defaultValue={cmd.name}
              id={`cmd-name-${cmd.id}`}
              placeholder="名称"
            />
            <input
              className="text-xs px-2 py-1 border-none outline-none"
              style={{ background: '#252525', color: '#d4d4d4', borderRadius: 4 }}
              defaultValue={cmd.command}
              id={`cmd-val-${cmd.id}`}
              placeholder="命令"
            />
            <div className="flex gap-1 justify-end">
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 border-none cursor-pointer"
                style={{ background: '#333', color: '#ccc', borderRadius: 4 }}
                onClick={() => setEditingId(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 border-none cursor-pointer"
                style={{ background: '#1668dc', color: '#fff', borderRadius: 4 }}
                onClick={() => {
                  const nameEl = document.getElementById(`cmd-name-${cmd.id}`) as HTMLInputElement
                  const valEl = document.getElementById(`cmd-val-${cmd.id}`) as HTMLInputElement
                  handleUpdate(cmd.id, nameEl.value, valEl.value)
                }}
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div
            key={cmd.id}
            className="flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs"
            style={{ borderRadius: 4 }}
            onDoubleClick={() => setEditingId(cmd.id)}
            onClick={() => handleCopy(cmd.command)}
            onContextMenu={e => {
              e.preventDefault()
              handleDelete(cmd.id)
            }}
            onKeyDown={() => {}}
            title={`${cmd.command}\n双击编辑 | 右键删除 | 点击复制`}
          >
            <Zap size={11} style={{ color: '#666', flexShrink: 0 }} />
            <span className="truncate" style={{ color: '#ccc' }}>
              {cmd.name}
            </span>
          </div>
        )
      )}

      {showAdd ? (
        <div className="flex flex-col gap-1 p-2 mt-1" style={{ background: '#1a1a1a', borderRadius: 6 }}>
          <input
            className="text-xs px-2 py-1 border-none outline-none"
            style={{ background: '#252525', color: '#d4d4d4', borderRadius: 4 }}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="命令名称"
          />
          <input
            className="text-xs px-2 py-1 border-none outline-none"
            style={{ background: '#252525', color: '#d4d4d4', borderRadius: 4 }}
            value={newCmd}
            onChange={e => setNewCmd(e.target.value)}
            placeholder="命令内容"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              className="text-[10px] px-2 py-0.5 border-none cursor-pointer"
              style={{ background: '#333', color: '#ccc', borderRadius: 4 }}
              onClick={() => setShowAdd(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="text-[10px] px-2 py-0.5 border-none cursor-pointer"
              style={{ background: '#1668dc', color: '#fff', borderRadius: 4 }}
              onClick={handleAdd}
            >
              添加
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="text-xs px-2 py-1.5 border-none cursor-pointer mt-1"
          style={{ background: 'transparent', color: '#1668dc', textAlign: 'left' }}
          onClick={() => setShowAdd(true)}
        >
          + 添加命令
        </button>
      )}

      {commands.length === 0 && !showAdd && (
        <div className="text-[11px] py-4 text-center" style={{ color: '#555' }}>
          暂无常用命令
          <br />
          点击上方按钮添加
        </div>
      )}
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────

function SettingsPanel({ storage }: { storage: ReturnType<typeof useAppStorage> }) {
  const { terminalSettings, setTerminalSettings } = useSuperTerminalStore()
  const [shells, setShells] = useState<{ name: string; path: string; is_default: boolean }[]>([])

  useEffect(() => {
    superTerminalApi.detectShells().then(res => {
      if (res.success && res.data) setShells(res.data)
    })
  }, [])

  const handleChange = (key: string, value: unknown) => {
    const update = { [key]: value }
    setTerminalSettings(update)
    const newSettings = { ...terminalSettings, ...update }
    storage.setJSON('terminal-settings', newSettings)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Shell program */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: '#888' }}>
          默认终端程序
        </label>
        <select
          className="w-full text-xs px-2 py-1 border-none outline-none"
          style={{ background: '#252525', color: '#d4d4d4', borderRadius: 4 }}
          value={terminalSettings.shell || ''}
          onChange={e => handleChange('shell', e.target.value || undefined)}
        >
          <option value="">自动检测</option>
          {shells.map(s => (
            <option key={s.path} value={s.path}>
              {s.name} {s.is_default ? '(推荐)' : ''} — {s.path}
            </option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: '#888' }}>
          字体大小
        </label>
        <input
          type="range"
          min={8}
          max={24}
          value={terminalSettings.fontSize}
          onChange={e => handleChange('fontSize', Number(e.target.value))}
          className="w-full"
        />
        <span className="text-[10px]" style={{ color: '#666' }}>
          {terminalSettings.fontSize}px
        </span>
      </div>

      {/* Cursor style */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: '#888' }}>
          光标样式
        </label>
        <select
          className="w-full text-xs px-2 py-1 border-none outline-none"
          style={{ background: '#252525', color: '#d4d4d4', borderRadius: 4 }}
          value={terminalSettings.cursorStyle}
          onChange={e => handleChange('cursorStyle', e.target.value)}
        >
          <option value="block">方块 (Block)</option>
          <option value="underline">下划线 (Underline)</option>
          <option value="bar">竖线 (Bar)</option>
        </select>
      </div>

      {/* Cursor blink */}
      <SettingToggle
        label="光标闪烁"
        value={terminalSettings.cursorBlink}
        onChange={v => handleChange('cursorBlink', v)}
      />

      {/* Scrollback */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: '#888' }}>
          回滚行数
        </label>
        <input
          type="number"
          className="w-full text-xs px-2 py-1 border-none outline-none"
          style={{ background: '#252525', color: '#d4d4d4', borderRadius: 4 }}
          value={terminalSettings.scrollback}
          onChange={e => handleChange('scrollback', Number(e.target.value))}
          min={100}
          max={100000}
          step={100}
        />
      </div>

      {/* Copy on select */}
      <SettingToggle
        label="选中即复制"
        value={terminalSettings.copyOnSelect}
        onChange={v => handleChange('copyOnSelect', v)}
      />

      {/* Right click paste */}
      <SettingToggle
        label="右键粘贴"
        value={terminalSettings.rightClickPaste}
        onChange={v => handleChange('rightClickPaste', v)}
      />

      {/* Bell sound */}
      <SettingToggle label="响铃声音" value={terminalSettings.bellSound} onChange={v => handleChange('bellSound', v)} />
    </div>
  )
}

function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: '#888' }}>
        {label}
      </span>
      <button
        type="button"
        className="border-none cursor-pointer"
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          background: value ? '#1668dc' : '#444',
          position: 'relative',
          transition: 'background 0.2s'
        }}
        onClick={() => onChange(!value)}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: value ? 16 : 2,
            transition: 'left 0.2s'
          }}
        />
      </button>
    </div>
  )
}
