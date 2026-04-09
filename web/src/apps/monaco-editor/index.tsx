/**
 * Code Editor — Full-featured VS Code-like editor
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ ActBar │     Sidebar     │       Editor Area         │
 *   │ (48px) │  (240px, toggle)│ TabBar                    │
 *   │ Files  │  File Tree      │ Monaco Editor             │
 *   │ Search │                 │                           │
 *   ├────────┴─────────────────┴───────────────────────────┤
 *   │ Status: Language │ Ln, Col │ Encoding │ Indent        │
 *   └─────────────────────────────────────────────────────┘
 *
 * Features:
 * - Multi-tab editing with dirty indicators
 * - Expandable file tree sidebar from VFS mount
 * - Activity bar (Files / Search)
 * - Monaco editor with syntax highlighting, minimap, etc.
 * - Status bar showing language, line/col, encoding
 * - File → Open (adds new tab), File → Open Folder (sets workspace)
 * - Ctrl+S save, Ctrl+W close tab
 */

import MonacoEditor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import {
  ChevronRight,
  Code2,
  File,
  Files,
  Folder,
  FolderOpen,
  Plus,
  Search,
  X
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { VfsFilePickerModal } from '@/shell/FilePicker'
import type { VfsNode } from '../explorer/api'
import { vfsApi } from '../explorer/api'

// ─── Language detection ─────────────────────────────────────────────────────

function getLanguageFromExt(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', jsonc: 'json',
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini', rs: 'rust', go: 'go',
    py: 'python', rb: 'ruby', php: 'php', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
    ps1: 'powershell', bat: 'bat', cmd: 'bat',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql', graphql: 'graphql',
    vue: 'html', svelte: 'html',
    txt: 'plaintext', log: 'plaintext',
    conf: 'ini', cfg: 'ini', ini: 'ini', env: 'ini',
  }
  return map[ext] ?? 'plaintext'
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface FileTab {
  id: string
  mountId: string
  node: VfsNode
  content: string
  savedContent: string
  language: string
}

interface WorkspaceRoot {
  mountId: string
  path: string
  name: string
}

interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  children?: DirEntry[]
  expanded?: boolean
  loading?: boolean
}

// ─── File tree node ──────────────────────────────────────────────────────────

function FileTreeNode({
  entry,
  depth,
  activeFilePath,
  onSelect,
  onExpand
}: {
  entry: DirEntry
  depth: number
  activeFilePath: string | null
  onSelect: (entry: DirEntry) => void
  onExpand: (entry: DirEntry) => void
}) {
  const isActive = !entry.is_dir && activeFilePath === entry.path
  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        className="flex items-center gap-1 cursor-pointer select-none"
        style={{
          paddingLeft: 8 + depth * 12,
          paddingTop: 2,
          paddingBottom: 2,
          paddingRight: 6,
          background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
          color: isActive ? '#fff' : 'var(--vos-text-secondary)',
          borderRadius: 2,
          fontSize: 12.5
        }}
        onClick={() => entry.is_dir ? onExpand(entry) : onSelect(entry)}
        onKeyDown={e => { if (e.key === 'Enter') { entry.is_dir ? onExpand(entry) : onSelect(entry) } }}
      >
        {entry.is_dir ? (
          <>
            <ChevronRight size={11} style={{ flexShrink: 0, transition: 'transform 0.12s', transform: entry.expanded ? 'rotate(90deg)' : 'none' }} />
            {entry.expanded
              ? <FolderOpen size={12} style={{ flexShrink: 0, color: isActive ? '#fff' : '#e8a320' }} />
              : <Folder size={12} style={{ flexShrink: 0, color: isActive ? '#fff' : '#e8a320' }} />}
          </>
        ) : (
          <>
            <span style={{ width: 11, flexShrink: 0 }} />
            <File size={12} style={{ flexShrink: 0, color: isActive ? '#fff' : 'var(--vos-text-tertiary)' }} />
          </>
        )}
        <span className="truncate flex-1 ml-1">{entry.name}</span>
        {entry.loading && <Spinner size={10} />}
      </div>
      {entry.is_dir && entry.expanded && entry.children && (
        <>
          {entry.children.map(child => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onSelect={onSelect}
              onExpand={onExpand}
            />
          ))}
        </>
      )}
    </>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActivityBarButton({ icon, active, title, onClick }: {
  icon: React.ReactNode; active: boolean; title: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 rounded"
      style={{
        background: active ? 'var(--vos-accent-primary)20' : 'transparent',
        color: active ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)',
        border: 'none', cursor: 'pointer',
        transition: 'color 0.15s, background 0.15s'
      }}
    >
      {icon}
    </button>
  )
}

function EditorTab({ tab, isActive, isDirty, onActivate, onClose }: {
  tab: FileTab; isActive: boolean; isDirty: boolean
  onActivate: () => void; onClose: (e: React.MouseEvent) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex items-center gap-1.5 px-3 h-full flex-shrink-0 cursor-pointer text-xs group"
      style={{
        borderRight: '0.5px solid var(--vos-border-subtle)',
        background: isActive ? 'var(--vos-bg-base)' : 'transparent',
        color: isActive ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
        borderBottom: isActive ? '2px solid var(--vos-accent-primary)' : '2px solid transparent',
        minWidth: 80, maxWidth: 180, userSelect: 'none'
      }}
      onClick={onActivate}
      onKeyDown={e => e.key === 'Enter' && onActivate()}
    >
      <File size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span className="truncate flex-1">{tab.node.name}</span>
      <button
        type="button"
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit',
          ...(isDirty ? { opacity: 1, color: 'var(--vos-accent-warning)' } : {})
        }}
        onClick={onClose}
        title="关闭"
      >
        {isDirty ? <span style={{ fontSize: 14, lineHeight: 1 }}>●</span> : <X size={12} />}
      </button>
    </div>
  )
}

function StatusSep() {
  return <span style={{ opacity: 0.4 }}>|</span>
}

function WelcomeAction({ shortcut, label, icon }: { shortcut: string; label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ color: 'var(--vos-accent-primary)', width: 18 }}>{icon}</span>
      <span style={{ color: 'var(--vos-text-secondary)' }}>{label}</span>
      <kbd className="px-1.5 py-0.5 text-[10px] rounded" style={{ background: 'var(--vos-bg-panel)', color: 'var(--vos-text-tertiary)', border: '1px solid var(--vos-border-subtle)', fontFamily: 'monospace' }}>
        {shortcut}
      </kbd>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MonacoEditorApp({ windowId, initialAppState }: AppComponentProps) {
  const initMountId = (initialAppState?.mountId as string) ?? ''
  const initNode = initialAppState?.node as VfsNode | undefined
  const initDirNode = initialAppState?.dirNode as VfsNode | undefined

  const { setTitle } = useWindowActions(windowId)
  const isMac = /Mac/.test(navigator.userAgent)

  // ─── Tab state ────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<FileTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  // ─── Workspace / sidebar ──────────────────────────────────────────────
  const [workspace, setWorkspace] = useState<WorkspaceRoot | null>(
    initDirNode && initMountId
      ? { mountId: initMountId, path: initDirNode.path, name: initDirNode.name }
      : null
  )
  const [tree, setTree] = useState<DirEntry[]>([])
  const [sidebarView, setSidebarView] = useState<'files' | 'search'>('files')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // ─── Monaco refs ──────────────────────────────────────────────────────
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef<() => void>(() => {})

  // ─── Status bar ───────────────────────────────────────────────────────
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorCol, setCursorCol] = useState(1)
  const [loadingFile, setLoadingFile] = useState(false)

  // Make stable tab id
  const makeTabId = (mountId: string, path: string) => `${mountId}::${path}`

  // ─── Open file as tab ─────────────────────────────────────────────────
  const openFileAsTab = useCallback(async (mountId: string, node: VfsNode) => {
    const tabId = makeTabId(mountId, node.path)
    const existing = tabs.find(t => t.id === tabId)
    if (existing) { setActiveTabId(tabId); setTitle(node.name); return }

    setLoadingFile(true)
    try {
      const r = await vfsApi.readVfsFile(mountId, node.path, 16 * 1024 * 1024)
      const content = r.data.is_binary ? '// Binary file — cannot be displayed as text' : (r.data.content ?? '')
      const newTab: FileTab = { id: tabId, mountId, node, content, savedContent: content, language: getLanguageFromExt(node.name) }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(tabId)
      setTitle(node.name)
    } catch (e) { console.error('Open file failed:', e) }
    finally { setLoadingFile(false) }
  }, [tabs, setTitle])

  // ─── Close tab ────────────────────────────────────────────────────────
  const closeTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        const newActive = next[Math.min(idx, next.length - 1)]?.id ?? null
        setActiveTabId(newActive)
        const t = newActive ? next.find(t2 => t2.id === newActive) : null
        setTitle(t?.node.name ?? '代码编辑器')
      }
      return next
    })
  }, [activeTabId, setTitle])

  // ─── Save ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeTab) return
    const content = editorRef.current?.getValue() ?? activeTab.content
    if (content === activeTab.savedContent) return
    try {
      await vfsApi.writeVfsFile(activeTab.mountId, activeTab.node.path, content)
      setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, savedContent: content, content } : t))
    } catch (e) { console.error('Save failed:', e) }
  }, [activeTab])

  useEffect(() => { saveRef.current = handleSave }, [handleSave])

  // ─── Monaco mount ─────────────────────────────────────────────────────
  const handleMonacoMount = useCallback((editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor
    editor.addAction({
      id: 'vos-save', label: '保存',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveRef.current()
    })
    editor.onDidChangeCursorPosition(e => {
      setCursorLine(e.position.lineNumber)
      setCursorCol(e.position.column)
    })
  }, [])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, closeTab])

  // ─── Load initial state ───────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run once
  useEffect(() => {
    if (initNode && initMountId) openFileAsTab(initMountId, initNode)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run once
  useEffect(() => {
    if (initDirNode && initMountId) {
      loadDirEntries(initMountId, initDirNode.path).then(entries => setTree(entries))
    }
  }, [])

  // ─── Directory helpers ────────────────────────────────────────────────
  const loadDirEntries = async (mountId: string, dirPath: string): Promise<DirEntry[]> => {
    const r = await vfsApi.listVfsDir(mountId, dirPath, false)
    return [...r.data]
      .sort((a, b) => { if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1; return a.name.localeCompare(b.name) })
      .map(n => ({ name: n.name, path: n.path, is_dir: n.is_dir, children: n.is_dir ? [] : undefined }))
  }

  const patchNode = (nodes: DirEntry[], targetPath: string, patch: Partial<DirEntry>): DirEntry[] =>
    nodes.map(n => {
      if (n.path === targetPath) return { ...n, ...patch }
      if (n.children) return { ...n, children: patchNode(n.children, targetPath, patch) }
      return n
    })

  const handleExpandDir = useCallback(async (entry: DirEntry) => {
    if (!workspace) return
    if (entry.expanded) { setTree(prev => patchNode(prev, entry.path, { expanded: false })); return }
    setTree(prev => patchNode(prev, entry.path, { expanded: true, loading: true }))
    try {
      const children = await loadDirEntries(workspace.mountId, entry.path)
      setTree(prev => patchNode(prev, entry.path, { children, loading: false }))
    } catch { setTree(prev => patchNode(prev, entry.path, { loading: false })) }
  }, [workspace])

  const handleSelectFile = useCallback((entry: DirEntry) => {
    if (!workspace || entry.is_dir) return
    openFileAsTab(workspace.mountId, { name: entry.name, path: entry.path, is_dir: false })
  }, [workspace, openFileAsTab])

  // ─── File open / open folder handlers ────────────────────────────────
  const handleOpenFile = useCallback((result: VfsPickerResult) => {
    const name = result.path.split('/').filter(Boolean).pop() ?? result.path
    openFileAsTab(result.mountId, { name, path: result.path, is_dir: false })
  }, [openFileAsTab])

  const handleOpenDirectory = useCallback(async (result: VfsPickerResult) => {
    const name = result.path.split('/').filter(Boolean).pop() ?? (result.path || '/')
    setWorkspace({ mountId: result.mountId, path: result.path, name })
    setSidebarOpen(true)
    setSidebarView('files')
    setTitle(`${name} — 代码编辑器`)
    try {
      const entries = await loadDirEntries(result.mountId, result.path)
      setTree(entries)
    } catch (e) { console.error('Load workspace failed:', e) }
  }, [setTitle])

  // ─── Menus ────────────────────────────────────────────────────────────
  const activeIsDirty = activeTab ? activeTab.content !== activeTab.savedContent : false

  const { showFilePicker, closeFilePicker, handleFilePickerConfirm,
          showDirPicker, closeDirPicker, handleDirPickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'monaco-editor',
    onOpenFile: handleOpenFile,
    onOpenDirectory: handleOpenDirectory,
    extraFileItems: [
      {
        id: 'save', label: '保存',
        shortcut: isMac ? '⌘S' : 'Ctrl+S',
        action: handleSave,
        disabled: !activeIsDirty
      },
      { type: 'separator' },
      {
        id: 'close-tab', label: '关闭编辑器',
        shortcut: isMac ? '⌘W' : 'Ctrl+W',
        action: () => activeTabId && closeTab(activeTabId),
        disabled: !activeTabId
      }
    ]
  })

  // ─── Editor content change ────────────────────────────────────────────
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined || !activeTabId) return
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: value } : t))
  }, [activeTabId])

  // ─── Search filter ────────────────────────────────────────────────────
  function flattenTree(nodes: DirEntry[]): DirEntry[] {
    return nodes.flatMap(n => n.is_dir ? flattenTree(n.children ?? []) : [n])
  }
  const filteredTreeFiles = searchQuery
    ? flattenTree(tree).filter(e => !e.is_dir && e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--vos-bg-base)' }}>

      {/* ── Activity Bar ── */}
      <div
        className="flex flex-col items-center gap-1 py-2 flex-shrink-0"
        style={{ width: 48, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-panel)' }}
      >
        <ActivityBarButton icon={<Files size={20} />} active={sidebarOpen && sidebarView === 'files'} title="资源管理器"
          onClick={() => { if (sidebarView === 'files') setSidebarOpen(v => !v); else { setSidebarView('files'); setSidebarOpen(true) } }} />
        <ActivityBarButton icon={<Search size={20} />} active={sidebarOpen && sidebarView === 'search'} title="搜索"
          onClick={() => { if (sidebarView === 'search') setSidebarOpen(v => !v); else { setSidebarView('search'); setSidebarOpen(true) } }} />
      </div>

      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="flex flex-col flex-shrink-0 overflow-hidden" style={{ width: 240, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}>
          {sidebarView === 'files' ? (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest flex items-center justify-between flex-shrink-0"
                style={{ color: 'var(--vos-text-tertiary)', borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                <span>资源管理器</span>
                {workspace && <span className="truncate ml-2 normal-case tracking-normal" style={{ fontSize: 10.5, color: 'var(--vos-text-secondary)', maxWidth: 120 }}>{workspace.name}</span>}
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {!workspace
                  ? <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                      <FolderOpen size={32} style={{ color: 'var(--vos-text-tertiary)', opacity: 0.5 }} />
                      <p className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>通过「文件 → 打开文件夹」打开项目</p>
                    </div>
                  : tree.length === 0
                    ? <div className="flex items-center justify-center py-6"><Spinner size={14} /></div>
                    : tree.map(entry => (
                        <FileTreeNode key={entry.path} entry={entry} depth={0}
                          activeFilePath={activeTab?.node.path ?? null}
                          onSelect={handleSelectFile} onExpand={handleExpandDir} />
                      ))
                }
              </div>
            </>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest flex-shrink-0"
                style={{ color: 'var(--vos-text-tertiary)', borderBottom: '0.5px solid var(--vos-border-subtle)' }}>搜索</div>
              <div className="px-2 py-2 flex-shrink-0" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜索文件名…" className="w-full px-2 py-1 text-xs rounded outline-none"
                  style={{ background: 'var(--vos-bg-input)', border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }} />
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {searchQuery && filteredTreeFiles.length === 0 && (
                  <p className="text-xs px-3 py-2" style={{ color: 'var(--vos-text-tertiary)' }}>未找到匹配文件</p>
                )}
                {filteredTreeFiles.map(entry => (
                  <button key={entry.path} type="button"
                    className="w-full flex items-center gap-1.5 px-3 py-1 text-xs text-left cursor-pointer"
                    style={{ background: 'transparent', border: 'none', color: 'var(--vos-text-secondary)' }}
                    onClick={() => workspace && handleSelectFile(entry)}>
                    <File size={11} style={{ flexShrink: 0 }} />
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Editor Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Tab Bar */}
        <div className="flex items-center flex-shrink-0 overflow-x-auto"
          style={{ height: 35, minHeight: 35, borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-panel)' }}>
          {tabs.map(tab => (
            <EditorTab key={tab.id} tab={tab}
              isActive={tab.id === activeTabId}
              isDirty={tab.content !== tab.savedContent}
              onActivate={() => { setActiveTabId(tab.id); setTitle(tab.node.name) }}
              onClose={e => closeTab(tab.id, e)} />
          ))}
          <button type="button"
            className="flex-shrink-0 px-2 h-full flex items-center"
            style={{ color: 'var(--vos-text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="打开文件 (Ctrl+O)"
            onClick={() => { /* triggers useFileOpenMenu */ }}>
            <Plus size={14} />
          </button>
        </div>

        {/* Breadcrumb */}
        {activeTab && (
          <div className="flex items-center gap-1 px-3 flex-shrink-0 overflow-hidden text-xs"
            style={{ height: 22, background: 'var(--vos-bg-surface)', borderBottom: '0.5px solid var(--vos-border-subtle)', color: 'var(--vos-text-tertiary)' }}>
            {workspace && <><span className="truncate">{workspace.name}</span><ChevronRight size={10} /></>}
            {activeTab.node.path.split('/').filter(Boolean).map((seg, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                <span style={i === arr.length - 1 ? { color: 'var(--vos-text-primary)' } : {}}>{seg}</span>
                {i < arr.length - 1 && <ChevronRight size={10} />}
              </span>
            ))}
          </div>
        )}

        {/* Monaco / Welcome / Loading */}
        <div className="flex-1 relative overflow-hidden">
          {loadingFile ? (
            <div className="absolute inset-0 flex items-center justify-center"><Spinner size={20} /></div>
          ) : !activeTab ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6"
              style={{ background: 'var(--vos-bg-base)', color: 'var(--vos-text-tertiary)' }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0078d4 0%, #005a9e 100%)' }}>
                  <Code2 size={32} color="#fff" />
                </div>
                <div className="text-base font-medium" style={{ color: 'var(--vos-text-primary)' }}>代码编辑器</div>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <WelcomeAction shortcut="Ctrl+O" label="打开文件…" icon={<File size={14} />} />
                <WelcomeAction shortcut="Ctrl+Shift+O" label="打开文件夹…" icon={<FolderOpen size={14} />} />
              </div>
              <p className="text-xs" style={{ opacity: 0.6 }}>或在资源管理器中双击文件打开</p>
            </div>
          ) : (
            <MonacoEditor
              key={activeTab.id}
              height="100%"
              language={activeTab.language}
              value={activeTab.content}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, Menlo, monospace',
                fontLigatures: true,
                minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
                lineNumbers: 'on',
                wordWrap: 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                renderWhitespace: 'boundary',
                bracketPairColorization: { enabled: true },
                guides: { indentation: true, bracketPairs: true },
                padding: { top: 8, bottom: 8 },
                smoothScrolling: true,
                cursorBlinking: 'phase',
                cursorSmoothCaretAnimation: 'on',
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                overviewRulerLanes: 3,
                renderLineHighlight: 'all',
                suggest: { showIcons: true },
                quickSuggestions: { other: true, comments: false, strings: false },
                parameterHints: { enabled: true },
                formatOnPaste: true,
                stickyScroll: { enabled: true },
              }}
              onMount={handleMonacoMount}
              onChange={handleEditorChange}
            />
          )}
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-3 px-3 flex-shrink-0 text-[11px] select-none"
          style={{ height: 22, background: 'var(--vos-accent-primary)', color: '#ffffffcc' }}>
          {activeTab ? (
            <>
              <span style={{ textTransform: 'capitalize' }}>
                {activeTab.language === 'plaintext' ? 'Plain Text' : activeTab.language}
              </span>
              <StatusSep />
              <span>Ln {cursorLine}, Col {cursorCol}</span>
              <StatusSep />
              <span>UTF-8</span>
              <StatusSep />
              <span>Spaces: 2</span>
              {activeIsDirty && <><StatusSep /><span style={{ color: '#ffdd88' }}>● 已修改</span></>}
            </>
          ) : <span>代码编辑器</span>}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
        )}
        {showDirPicker && (
          <VfsFilePickerModal mode="directory" onConfirm={handleDirPickerConfirm} onClose={closeDirPicker} />
        )}
      </AnimatePresence>
    </div>
  )
}
