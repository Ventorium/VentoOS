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
import { ChevronLeft, ChevronRight, Folder, Globe, Network, Plus, Server, Settings, TerminalSquare, X, Zap } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAuthHeaders } from '@/infra/api/client'
import { useAppStorage, useAppStateSync, useWindowStore } from '@/kernel'
import { VfsFilePickerModal } from '@/shell/FilePicker'
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
    <div className="flex items-center justify-center h-full text-[#666]">
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
    setTerminalSettings,
    terminalSettings
  } = useSuperTerminalStore()

  // Restore activeNavTab from app state
  useEffect(() => {
    const win = useWindowStore.getState().windows.find(w => w.id === _props.windowId)
    const savedNavTab = win?.appState?.activeNavTab as NavTab | undefined
    if (savedNavTab) {
      setActiveNavTab(savedNavTab)
    }
  }, [_props.windowId, setActiveNavTab])

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

  // Sync app state
  useAppStateSync(_props.windowId, { activeNavTab }, [activeNavTab])

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
    <div className="flex h-full text-[#d4d4d4] relative" style={{ background: terminalSettings.backgroundColor ?? '#0e0e0e' }}>
      {terminalSettings.backgroundImage && (
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
          style={{
            backgroundImage: `url(${terminalSettings.backgroundImage})`,
            opacity: 1 - (terminalSettings.backgroundOpacity ?? 1)
          }}
        />
      )}
      {/* Left narrow panel */}
      <div
        className="flex flex-col flex-shrink-0 border-r border-r-[#333]"
        style={{ width: leftPanelWidth }}
      >
        <div className="flex-1 flex flex-col items-center pt-2 gap-1">
          <button
            type="button"
            className={`flex items-center justify-center border-none cursor-pointer w-8 h-8 rounded-[6px] ${leftPanelTab === 'commands' ? 'bg-[#1668dc30] text-[#1668dc]' : 'bg-transparent text-[#888]'}`}
            onClick={() => setLeftPanelTab('commands')}
            title="常用命令"
          >
            <Zap size={16} />
          </button>
          <button
            type="button"
            className={`flex items-center justify-center border-none cursor-pointer w-8 h-8 rounded-[6px] ${leftPanelTab === 'settings' ? 'bg-[#1668dc30] text-[#1668dc]' : 'bg-transparent text-[#888]'}`}
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
          className="flex items-center h-9 flex-shrink-0 border-b border-b-[#333]"
        >
          {/* Nav tabs */}
          {NAV_ITEMS.map(item => {
            const isActive = activeNavTab === item.key && !isShowingSession
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                className={`flex items-center gap-1.5 px-3 h-full border-none cursor-pointer text-xs select-none whitespace-nowrap border-r border-r-[#333] ${isActive ? 'bg-[rgba(14,14,14,0.5)] text-[#d4d4d4]' : 'bg-transparent text-[#888]'}`}
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

          {/* Separator — adds space between public-access nav tab and SSH session tabs */}
          <div className="w-10 shrink-0 border-r border-r-[#333] h-full" />

          {/* Session tabs */}
          <div className="flex items-center flex-1 min-w-0 overflow-hidden">
            {visibleSessionTabs.map(tab => {
              const isActive = tab.id === activeSessionTabId
              return (
                <div
                  key={tab.id}
                  className={`group flex items-center gap-1 px-2.5 h-full cursor-pointer text-xs select-none flex-shrink-0 border-r border-r-[#333] max-w-[150px] ${isActive ? 'bg-[#0e0e0e] text-[#d4d4d4]' : 'bg-transparent text-[#888]'}`}
                  onClick={() => setActiveSessionTab(tab.id)}
                  onKeyDown={() => {}}
                >
                  <Server size={11} className="shrink-0" />
                  <span className="truncate">{tab.title}</span>
                  <button
                    type="button"
                    className="bg-transparent border-none cursor-pointer p-0 opacity-0 group-hover:opacity-100 text-[#888] leading-[0] shrink-0"
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
                  className="flex items-center gap-1 px-2 h-full border-none cursor-pointer text-xs bg-transparent text-[#888]"
                  onClick={() => setShowMoreTabs(!showMoreTabs)}
                >
                  +{hiddenSessionTabs.length} 更多
                  {showMoreTabs ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
                </button>
                {showMoreTabs && (
                  <div
                    className="absolute top-full right-0 z-50 bg-[#252525] border border-[#444] rounded-[6px] py-1 min-w-[160px] shadow-[0_4px_12px_rgba(0,0,0,.4)]"
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
                          className="bg-transparent border-none cursor-pointer p-0 text-[#888] leading-[0]"
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
            className={`absolute inset-0 ${!isShowingSession && activeNavTab === 'local-terminal' ? 'visible z-[1]' : 'invisible z-0'}`}
          >
            <Suspense fallback={<LoadingFallback />}>
              <LocalTerminal />
            </Suspense>
          </div>
          <div
            className={`absolute inset-0 ${!isShowingSession && activeNavTab === 'ssh-servers' ? 'visible z-[1]' : 'invisible z-0'}`}
          >
            <Suspense fallback={<LoadingFallback />}>
              <SshServers />
            </Suspense>
          </div>
          <div
            className={`absolute inset-0 ${!isShowingSession && activeNavTab === 'port-mapping' ? 'visible z-[1]' : 'invisible z-0'}`}
          >
            <Suspense fallback={<LoadingFallback />}>
              <PortMapping />
            </Suspense>
          </div>
          <div
            className={`absolute inset-0 ${!isShowingSession && activeNavTab === 'public-access' ? 'visible z-[1]' : 'invisible z-0'}`}
          >
            <Suspense fallback={<LoadingFallback />}>
              <PublicAccess />
            </Suspense>
          </div>

          {/* Session tab content */}
          {sessionTabs.map(tab => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${tab.id === activeSessionTabId ? 'visible z-[1]' : 'invisible z-0'}`}
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
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div
      className="flex flex-col flex-shrink-0 w-[240px] border-r border-r-[#333]"
    >
      <div
        className="flex items-center justify-between px-3 h-9 flex-shrink-0 border-b border-b-[#333]"
      >
        <span className="text-xs font-medium text-[#ccc]">
          {tab === 'commands' ? '常用命令' : '终端设置'}
        </span>
        <div className="flex items-center gap-2">
          {tab === 'commands' && (
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0 text-[#888] leading-[0] transition-colors"
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1668dc' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
              onClick={() => setShowAdd(true)}
              title="添加命令"
            >
              <Plus size={14} />
            </button>
          )}
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0 text-[#888] leading-[0]"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'commands' ? (
          <CommandsPanel storage={storage} showAdd={showAdd} setShowAdd={setShowAdd} />
        ) : (
          <SettingsPanel storage={storage} />
        )}
      </div>
    </div>
  )
}

// ── Commands Panel ────────────────────────────────────────────────────────

function CommandsPanel({
  storage,
  showAdd,
  setShowAdd
}: {
  storage: ReturnType<typeof useAppStorage>
  showAdd: boolean
  setShowAdd: (v: boolean) => void
}) {
  const { commands, addCommand, removeCommand, updateCommand, setCommands } = useSuperTerminalStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCmd, setEditCmd] = useState('')
  const [newName, setNewName] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const [cmdContextMenu, setCmdContextMenu] = useState<{ cmd: CustomCommand; x: number; y: number } | null>(null)

  const persist = useCallback(
    (cmds: typeof commands) => {
      storage.setJSON('commands', cmds)
    },
    [storage]
  )

  const startEdit = (cmd: { id: string; name: string; command: string }) => {
    setEditingId(cmd.id)
    setEditName(cmd.name)
    setEditCmd(cmd.command)
  }

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

  const handleUpdate = () => {
    if (!editingId || !editName.trim() || !editCmd.trim()) return
    updateCommand(editingId, { name: editName, command: editCmd })
    const next = commands.map(c => (c.id === editingId ? { ...c, name: editName, command: editCmd } : c))
    persist(next)
    setEditingId(null)
  }

  // Copy command to clipboard
  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
  }

  return (
    <div className="flex flex-col gap-1 relative">
      {commands.map(cmd =>
        editingId === cmd.id ? (
          <div key={cmd.id} className="flex flex-col gap-1 p-2 bg-[#1a1a1a] rounded-[6px]">
            <input
              className="text-xs px-2 py-1 border-none outline-none bg-[#252525] text-[#d4d4d4] rounded"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="名称"
            />
            <textarea
              className="text-xs px-2 py-1 border-none outline-none bg-[#252525] text-[#d4d4d4] rounded resize-y min-h-[48px] font-mono overflow-y-auto"
              value={editCmd}
              onChange={e => setEditCmd(e.target.value)}
              placeholder="命令内容"
              rows={3}
            />
            <div className="flex gap-1 justify-end">
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 border-none cursor-pointer bg-[#333] text-[#ccc] rounded"
                onClick={() => setEditingId(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 border-none cursor-pointer bg-[#1668dc] text-white rounded"
                onClick={handleUpdate}
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div
            key={cmd.id}
            className="flex items-start gap-1 px-2 py-1.5 cursor-pointer text-xs rounded"
            onClick={() => handleCopy(cmd.command)}
            onContextMenu={e => {
              e.preventDefault()
              e.stopPropagation()
              setCmdContextMenu({ cmd, x: e.clientX, y: e.clientY })
            }}
            onKeyDown={() => {}}
            title={`${cmd.command}\n点击复制 | 右键菜单`}
          >
            <Zap size={11} className="text-[#666] shrink-0 mt-0.5" />
            <div className="flex flex-col min-w-0">
              <span className="truncate text-[#ccc]">
                {cmd.name}
              </span>
              <span
                className="text-[10px] text-[#666] overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px]"
              >
                {cmd.command}
              </span>
            </div>
          </div>
        )
      )}

      {showAdd && (
        <div className="flex flex-col gap-1 p-2 mt-1 bg-[#1a1a1a] rounded-[6px]">
          <input
            className="text-xs px-2 py-1 border-none outline-none bg-[#252525] text-[#d4d4d4] rounded"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="命令名称"
          />
          <textarea
            className="text-xs px-2 py-1 border-none outline-none bg-[#252525] text-[#d4d4d4] rounded resize-y min-h-[48px] font-mono overflow-y-auto"
            value={newCmd}
            onChange={e => setNewCmd(e.target.value)}
            placeholder="命令内容"
            rows={3}
          />
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              className="text-[10px] px-2 py-0.5 border-none cursor-pointer bg-[#333] text-[#ccc] rounded"
              onClick={() => setShowAdd(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="text-[10px] px-2 py-0.5 border-none cursor-pointer bg-[#1668dc] text-white rounded"
              onClick={handleAdd}
            >
              添加
            </button>
          </div>
        </div>
      )}

      {commands.length === 0 && !showAdd && (
        <div className="text-[11px] py-4 text-center text-[#555]">
          暂无常用命令
          <br />
          点击右上角 + 添加
        </div>
      )}

      {/* Right-click context menu */}
      {cmdContextMenu && (
        <CmdContextMenu
          x={cmdContextMenu.x}
          y={cmdContextMenu.y}
          onEdit={() => {
            startEdit(cmdContextMenu.cmd)
            setCmdContextMenu(null)
          }}
          onCopyCommand={() => {
            handleCopy(cmdContextMenu.cmd.command)
            setCmdContextMenu(null)
          }}
          onDelete={() => {
            handleDelete(cmdContextMenu.cmd.id)
            setCmdContextMenu(null)
          }}
          onDismiss={() => setCmdContextMenu(null)}
        />
      )}
    </div>
  )
}

// ── Command Right-click Context Menu ─────────────────────────────────────

function CmdContextMenu({
  x,
  y,
  onEdit,
  onCopyCommand,
  onDelete,
  onDismiss
}: {
  x: number
  y: number
  onEdit: () => void
  onCopyCommand: () => void
  onDelete: () => void
  onDismiss: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const nx = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : x
    const ny = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onDismiss])

  const itemClassName = "py-[5px] px-[14px] cursor-pointer text-xs text-[#d4d4d4] whitespace-nowrap"

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[#252525] border border-[#444] rounded-[6px] py-1 min-w-[140px] select-none shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      style={{
        left: pos.x,
        top: pos.y
      }}
    >
      <div className={`${itemClassName} cmd-ctx-item`} onClick={onEdit}>编辑</div>
      <div className={`${itemClassName} cmd-ctx-item`} onClick={onCopyCommand}>复制命令</div>
      <div className="h-px bg-[#3a3a3a] my-1" />
      <div className={`${itemClassName} cmd-ctx-item text-[#f14c4c]`} onClick={onDelete}>删除</div>
      <style>{`.cmd-ctx-item:hover { background: #333 !important; }`}</style>
    </div>
  )
}

// ── Settings group heading ────────────────────────────────────────────────

function SettingGroup({ title }: { title: string }) {
  return (
    <div
      className="text-[10px] font-bold tracking-[0.8px] text-[#555] uppercase pt-2.5 pb-1 border-b border-b-[#2a2a2a] mb-1"
    >
      {title}
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────

function SettingsPanel({ storage }: { storage: ReturnType<typeof useAppStorage> }) {
  const { terminalSettings, setTerminalSettings } = useSuperTerminalStore()
  const [shells, setShells] = useState<{ name: string; path: string; is_default: boolean }[]>([])
  const [shellsLoaded, setShellsLoaded] = useState(false)

  useEffect(() => {
    superTerminalApi.detectShells().then(res => {
      if (res.success && res.data) {
        setShells(res.data)
        // If no shell set yet and we have shells, auto-select the default one
        if (!terminalSettings.shell && res.data.length > 0) {
          // Prefer modern shells: zsh > fish > bash > others
          const PREF_ORDER = ['zsh', 'fish', 'bash']
          const sorted = [...res.data].sort((a, b) => {
            const ai = PREF_ORDER.indexOf(a.name.toLowerCase())
            const bi = PREF_ORDER.indexOf(b.name.toLowerCase())
            if (ai === -1 && bi === -1) return 0
            if (ai === -1) return 1
            if (bi === -1) return -1
            return ai - bi
          })
          handleChange('shell', sorted[0].path)
        }
      }
      setShellsLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (key: string, value: unknown) => {
    const update = { [key]: value }
    setTerminalSettings(update)
    const newSettings = { ...terminalSettings, ...update }
    storage.setJSON('terminal-settings', newSettings)
  }

  const inputStyle = "w-full bg-[#252525] text-[#d4d4d4] rounded border-none outline-none text-[11px] py-1 px-2 box-border"

  const [showVfsBgPicker, setShowVfsBgPicker] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      {/* ── 通用设置（全局背景） ── */}
      <SettingGroup title="通用" />

      {/* Background color — always shown, image overlays on top */}
      <div>
          <label className="text-[11px] mb-1 block text-[#888]">
            背景颜色（全局）
          </label>
          <div className="flex gap-1.5 items-center">
            <input
              type="color"
              value={terminalSettings.backgroundColor ?? '#0d0d0d'}
              onChange={e => handleChange('backgroundColor', e.target.value)}
              className="w-7 h-6 border-none rounded-[3px] cursor-pointer p-0"
            />
            <input
              className={`${inputStyle} flex-1`}
              value={terminalSettings.backgroundColor ?? '#0d0d0d'}
              onChange={e => handleChange('backgroundColor', e.target.value)}
              placeholder="#0d0d0d"
            />
          </div>
        </div>

      {/* Background opacity */}
      <div>
        <label className="text-[11px] mb-1 block text-[#888]">
          背景不透明度 ({Math.round((terminalSettings.backgroundOpacity ?? 1) * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((terminalSettings.backgroundOpacity ?? 1) * 100)}
          onChange={e => handleChange('backgroundOpacity', Number(e.target.value) / 100)}
          className="w-full accent-[#1668dc]"
        />
      </div>

      {/* Background image */}
      <div>
        <label className="text-[11px] mb-1 block text-[#888]">
          背景图片（全局）
        </label>
        <div className="flex gap-1.5 items-center">
          <input
            className={`${inputStyle} flex-1`}
            value={terminalSettings.backgroundImage ?? ''}
            onChange={e => handleChange('backgroundImage', e.target.value || undefined)}
            placeholder="https://... 或留空"
          />
          <button
            type="button"
            className="bg-[#333] text-[#aaa] border-none rounded cursor-pointer py-[3px] px-[7px] text-[11px] flex items-center gap-1 shrink-0"
            onClick={() => setShowVfsBgPicker(true)}
            title="从 VFS 选择图片"
          >
            <Folder size={12} />
            浏览
          </button>
        </div>
        {terminalSettings.backgroundImage && (
          <div className="mt-1">
            <img
              src={terminalSettings.backgroundImage}
              alt="背景预览"
              className="w-full h-[60px] object-cover rounded opacity-70"
            />
            <button
              type="button"
              className="mt-1 text-[10px] bg-transparent border border-[#444] rounded-[3px] text-[#888] cursor-pointer py-[2px] px-1.5"
              onClick={() => handleChange('backgroundImage', undefined)}
            >
              清除图片
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showVfsBgPicker && (
          <VfsFilePickerModal
            key="vfs-bg-picker"
            mode="file"
            onConfirm={async result => {
              const filePath = result.isRemote
                ? result.path.replace(`vfs://${result.mountId}`, '')
                : result.path
              const bgUrl = `/api/vfs/mounts/${result.mountId}/raw?path=${encodeURIComponent(filePath)}`
              // Fetch with auth and convert to base64 data URL so it can be loaded without auth headers
              try {
                const resp = await fetch(bgUrl, { headers: getAuthHeaders() })
                if (resp.ok) {
                  const blob = await resp.blob()
                  const reader = new FileReader()
                  reader.onload = () => handleChange('backgroundImage', reader.result as string)
                  reader.readAsDataURL(blob)
                } else {
                  handleChange('backgroundImage', bgUrl)
                }
              } catch {
                handleChange('backgroundImage', bgUrl)
              }
              setShowVfsBgPicker(false)
            }}
            onClose={() => setShowVfsBgPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* ── 终端设置 ── */}
      <SettingGroup title="终端" />

      {/* Shell program — supports free text input + datalist suggestions */}
      <div>
        <label className="text-[11px] mb-1 block text-[#888]">
          默认 Shell
        </label>
        <input
          list="super-terminal-shells-list"
          className={inputStyle}
          value={terminalSettings.shell ?? ''}
          onChange={e => handleChange('shell', e.target.value)}
          placeholder={shellsLoaded && shells.length === 0 ? '未检测到可用的 Shell' : '输入或选择 Shell 路径…'}
        />
        <datalist id="super-terminal-shells-list">
          {shells.map(s => (
            <option key={s.path} value={s.path}>
              {s.name}{s.is_default ? ' ★' : ''} — {s.path}
            </option>
          ))}
        </datalist>
      </div>

      {/* Font size */}
      <div>
        <label className="text-[11px] mb-1 block text-[#888]">
          字体大小 ({terminalSettings.fontSize}px)
        </label>
        <input
          type="range"
          min={8}
          max={24}
          value={terminalSettings.fontSize}
          onChange={e => handleChange('fontSize', Number(e.target.value))}
          className="w-full accent-[#1668dc]"
        />
      </div>

      {/* Font family */}
      <div>
        <label className="text-[11px] mb-1 block text-[#888]">
          字体
        </label>
        <input
          className={inputStyle}
          value={terminalSettings.fontFamily}
          onChange={e => handleChange('fontFamily', e.target.value)}
          placeholder="JetBrains Mono, monospace"
        />
      </div>

      {/* Scrollback */}
      <div>
        <label className="text-[11px] mb-1 block text-[#888]">
          回滚行数
        </label>
        <input
          type="number"
          className={inputStyle}
          value={terminalSettings.scrollback}
          onChange={e => handleChange('scrollback', Number(e.target.value))}
          min={100}
          max={100000}
          step={100}
        />
      </div>

      {/* ── SSH 服务器设置 ── */}
      <SettingGroup title="SSH 服务器" />
      <div className="text-[11px] text-[#666] leading-[1.5]">
        连接超时、心跳间隔等可在新建/编辑服务器时按服务器配置。
      </div>

      {/* ── 端口映射设置 ── */}
      <SettingGroup title="端口映射" />
      <div className="text-[11px] text-[#666] leading-[1.5]">
        端口映射规则在「端口映射」标签页内管理。
      </div>

      {/* ── 外网访问设置 ── */}
      <SettingGroup title="外网访问" />
      <div className="text-[11px] text-[#666] leading-[1.5]">
        通过 SSH 隧道将本地服务暴露到公网。在「外网访问」标签页内管理隧道。
      </div>
    </div>
  )
}

function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#888]">
        {label}
      </span>
      <button
        type="button"
        className={value
          ? 'border-none cursor-pointer w-8 h-[18px] rounded-[9px] relative transition-colors bg-[#1668dc]'
          : 'border-none cursor-pointer w-8 h-[18px] rounded-[9px] relative transition-colors bg-[#444]'}
        onClick={() => onChange(!value)}
      >
        <div
          className="w-3.5 h-3.5 rounded-full bg-white absolute top-[2px] transition-[left]"
          style={{ left: value ? 16 : 2 }}
        />
      </button>
    </div>
  )
}
