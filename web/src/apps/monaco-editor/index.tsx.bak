/**
 * Code Editor — Full VS Code-like experience
 *
 * Features:
 * - Ctrl+P  Quick Open (full workspace file index via background scan)
 * - File tree with right-click context menu: New File, New Folder, Rename, Delete, Copy Path
 * - Inline rename & new-item creation
 * - Resizable sidebar (drag handle)
 * - Find-in-files: filename search + content search across indexed files
 * - Multi-tab editing (middle-click close, dirty indicator, Ctrl+W)
 * - Monaco: ligatures, sticky scroll, bracket colorization, minimap, smart suggestions
 * - Status bar: Language, Ln/Col, UTF-8, Spaces, modified indicator
 * - Ctrl+S save, Ctrl+N new untitled, Ctrl+P quick-open
 */

import MonacoEditor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import {
  ChevronRight,
  Code2,
  Copy,
  File,
  FilePlus,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog, Spinner } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { VfsFilePickerModal } from '@/shell/FilePicker'
import type { VfsNode } from '../explorer/api'
import { vfsApi } from '../explorer/api'

// ─── Language detection ───────────────────────────────────────────────────────

function getLanguageFromExt(name: string): string {
  const lower = name.toLowerCase()
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile'
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot + 1) : ''
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    json: 'json', jsonc: 'json', json5: 'json',
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini', rs: 'rust', go: 'go',
    py: 'python', pyw: 'python', rb: 'ruby', php: 'php', java: 'java',
    c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ksh: 'shell',
    ps1: 'powershell', psm1: 'powershell',
    bat: 'bat', cmd: 'bat',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', xhtml: 'html', xml: 'xml', xsl: 'xml', svg: 'xml',
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    vue: 'html', svelte: 'html',
    txt: 'plaintext', log: 'plaintext',
    conf: 'ini', cfg: 'ini', ini: 'ini', env: 'ini', properties: 'ini',
    tf: 'hcl', hcl: 'hcl', tfvars: 'hcl',
    kt: 'kotlin', kts: 'kotlin', swift: 'swift',
    dart: 'dart', lua: 'lua',
    ex: 'elixir', exs: 'elixir',
    hs: 'haskell', elm: 'elm',
    clj: 'clojure', cljs: 'clojure',
    proto: 'proto3', nix: 'plaintext', zig: 'plaintext',
  }
  return map[ext] ?? 'plaintext'
}

function displayLanguage(lang: string): string {
  const names: Record<string, string> = {
    javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', rust: 'Rust',
    go: 'Go', java: 'Java', csharp: 'C#', cpp: 'C++', c: 'C', css: 'CSS', scss: 'SCSS',
    html: 'HTML', xml: 'XML', json: 'JSON', yaml: 'YAML', markdown: 'Markdown', sql: 'SQL',
    graphql: 'GraphQL', shell: 'Shell Script', powershell: 'PowerShell', bat: 'Batch',
    ruby: 'Ruby', php: 'PHP', swift: 'Swift', kotlin: 'Kotlin', dart: 'Dart',
    lua: 'Lua', hcl: 'HCL', dockerfile: 'Dockerfile', makefile: 'Makefile',
    plaintext: 'Plain Text', ini: 'INI', elixir: 'Elixir', haskell: 'Haskell',
    elm: 'Elm', clojure: 'Clojure', proto3: 'Protocol Buffers',
  }
  return names[lang] ?? lang
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileTab {
  id: string
  mountId: string
  node: VfsNode
  content: string
  savedContent: string
  language: string
  isNew?: boolean
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

interface QuickOpenItem {
  path: string
  name: string
  relativePath: string
  mountId: string
}

interface ContextMenuInfo {
  visible: boolean
  x: number
  y: number
  entry: DirEntry | null
}

interface NewItemState {
  parentPath: string
  isDir: boolean
  value: string
}

interface SearchMatch {
  line: number
  col: number
  preview: string
}

interface SearchResult {
  file: QuickOpenItem
  matches: SearchMatch[]
}

// ─── Command Palette ──────────────────────────────────────────────────────────

function CommandPalette({
  items,
  isIndexing,
  onSelect,
  onClose,
}: {
  items: QuickOpenItem[]
  isIndexing: boolean
  onSelect: (item: QuickOpenItem) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { requestAnimationFrame(() => inputRef.current?.focus()) }, [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 100)
    return items
      .filter(i => i.name.toLowerCase().includes(q) || i.relativePath.toLowerCase().includes(q))
      .slice(0, 100)
  }, [items, query])

  useEffect(() => { setFocused(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.children[focused] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[focused]) onSelect(filtered[focused]) }
  }

  return (
    <div
      className="absolute inset-0 flex flex-col items-center pt-10 z-50"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ maxHeight: '65%', background: 'var(--vos-bg-overlay)', border: '1px solid var(--vos-border-subtle)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b" style={{ borderColor: 'var(--vos-border-subtle)' }}>
          <Search size={14} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="输入文件名以快速打开..."
            className="flex-1 py-3 text-sm outline-none"
            style={{ background: 'transparent', color: 'var(--vos-text-primary)' }}
          />
          {isIndexing && <Spinner size={12} />}
        </div>
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 380 }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--vos-text-tertiary)' }}>
              {query ? '无匹配文件' : isIndexing ? '正在建立文件索引...' : '请先打开文件夹'}
            </div>
          ) : filtered.map((item, i) => (
            <button
              key={item.path}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left"
              style={{
                background: i === focused ? 'var(--vos-accent-primary)' : 'transparent',
                color: i === focused ? '#fff' : 'var(--vos-text-primary)',
                border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={() => setFocused(i)}
              onClick={() => onSelect(item)}
            >
              <File size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate font-medium">{item.name}</span>
                {item.relativePath !== item.name && (
                  <span className="text-xs truncate" style={{ opacity: 0.6 }}>{item.relativePath}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function ContextMenu({
  info,
  hasWorkspace,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopyPath,
  onRefresh,
  onClose,
}: {
  info: ContextMenuInfo
  hasWorkspace: boolean
  onNewFile: (parentPath: string) => void
  onNewFolder: (parentPath: string) => void
  onRename: (entry: DirEntry) => void
  onDelete: (entry: DirEntry) => void
  onCopyPath: (path: string) => void
  onRefresh: () => void
  onClose: () => void
}) {
  const entry = info.entry
  const isDir = entry?.is_dir ?? true
  const targetPath = entry?.path ?? ''

  type MenuItem = { label: string; icon: React.ReactNode; action: () => void } | { separator: true }
  const items: MenuItem[] = [
    ...(!entry || entry.is_dir ? [
      { label: '新建文件', icon: <FilePlus size={13} />, action: () => { onNewFile(targetPath); onClose() } },
      { label: '新建文件夹', icon: <FolderPlus size={13} />, action: () => { onNewFolder(targetPath); onClose() } },
      { separator: true as const },
    ] : []),
    ...(entry ? [
      ...(!isDir ? [
        { label: '重命名', icon: <span style={{ width: 13, display: 'inline-block' }} />, action: () => { onRename(entry); onClose() } },
        { label: '删除', icon: <Trash2 size={13} />, action: () => { onDelete(entry); onClose() } },
        { separator: true as const },
        { label: '复制路径', icon: <Copy size={13} />, action: () => { onCopyPath(entry.path); onClose() } },
      ] : [
        { label: '重命名', icon: <span style={{ width: 13, display: 'inline-block' }} />, action: () => { onRename(entry); onClose() } },
        { label: '删除', icon: <Trash2 size={13} />, action: () => { onDelete(entry); onClose() } },
        { separator: true as const },
        { label: '复制路径', icon: <Copy size={13} />, action: () => { onCopyPath(entry.path); onClose() } },
      ]),
    ] : []),
    ...(hasWorkspace ? [{ label: '刷新', icon: <RefreshCw size={13} />, action: () => { onRefresh(); onClose() } }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50" style={{ background: 'transparent' }} onMouseDown={onClose}>
      <div
        className="absolute flex flex-col py-1 rounded shadow-2xl"
        style={{
          left: info.x, top: info.y,
          minWidth: 160,
          background: 'var(--vos-bg-context-menu)',
          border: '1px solid var(--vos-border-subtle)',
          zIndex: 1000,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {items.map((item, i) =>
          'separator' in item ? (
            <div key={i} style={{ height: 1, background: 'var(--vos-border-subtle)', margin: '3px 0' }} />
          ) : (
            <button
              key={i}
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-left w-full"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--vos-text-primary)' }}
              onMouseEnter={e => { (e.currentTarget).style.background = 'var(--vos-bg-item-hover)' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'transparent' }}
              onMouseDown={e => e.stopPropagation()}
              onClick={item.action}
            >
              <span style={{ color: 'var(--vos-text-tertiary)', width: 16, display: 'flex', alignItems: 'center' }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ─── Inline input for new item ────────────────────────────────────────────────

function NewItemInput({
  depth,
  isDir,
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  depth: number
  isDir: boolean
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { requestAnimationFrame(() => inputRef.current?.focus()) }, [])
  return (
    <div
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: 8 + depth * 12, paddingRight: 6 }}
    >
      {isDir
        ? <Folder size={12} style={{ flexShrink: 0, color: '#e8a320' }} />
        : <File size={12} style={{ flexShrink: 0, color: 'var(--vos-text-tertiary)' }} />}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 ml-1 px-1 text-xs outline-none rounded"
        style={{
          background: 'var(--vos-bg-input)',
          color: 'var(--vos-text-primary)',
          border: '1px solid var(--vos-accent-primary)',
          height: 18,
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onConfirm() }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
          e.stopPropagation()
        }}
        onBlur={onCancel}
      />
    </div>
  )
}

// ─── File Tree Node ───────────────────────────────────────────────────────────

function FileTreeNode({
  entry,
  depth,
  activeFilePath,
  renamingPath,
  renameValue,
  newItem,
  onSelect,
  onExpand,
  onContextMenu,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onNewItemChange,
  onNewItemConfirm,
  onNewItemCancel,
}: {
  entry: DirEntry
  depth: number
  activeFilePath: string | null
  renamingPath: string | null
  renameValue: string
  newItem: NewItemState | null
  onSelect: (entry: DirEntry) => void
  onExpand: (entry: DirEntry) => void
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void
  onRenameChange: (v: string) => void
  onRenameConfirm: (entry: DirEntry, value: string) => void
  onRenameCancel: () => void
  onNewItemChange: (v: string) => void
  onNewItemConfirm: (parentPath: string, isDir: boolean, value: string) => void
  onNewItemCancel: () => void
}) {
  const isActive = !entry.is_dir && activeFilePath === entry.path
  const isRenaming = renamingPath === entry.path
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) requestAnimationFrame(() => { renameInputRef.current?.focus(); renameInputRef.current?.select() })
  }, [isRenaming])

  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        className="flex items-center gap-1 cursor-pointer select-none group"
        style={{
          paddingLeft: 8 + depth * 12,
          paddingTop: 2, paddingBottom: 2, paddingRight: 6,
          background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
          color: isActive ? '#fff' : 'var(--vos-text-secondary)',
          fontSize: 12.5,
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget).style.background = 'var(--vos-bg-item-hover)' }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget).style.background = 'transparent' }}
        onClick={() => entry.is_dir ? onExpand(entry) : onSelect(entry)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, entry) }}
        onKeyDown={e => { if (e.key === 'Enter') entry.is_dir ? onExpand(entry) : onSelect(entry) }}
      >
        {entry.is_dir ? (
          <>
            <ChevronRight size={11} style={{ flexShrink: 0, transition: 'transform 0.1s', transform: entry.expanded ? 'rotate(90deg)' : 'none' }} />
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
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            className="flex-1 ml-1 px-1 text-xs outline-none rounded"
            style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)', border: '1px solid var(--vos-accent-primary)', height: 18 }}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onRenameConfirm(entry, renameValue) }
              if (e.key === 'Escape') { e.preventDefault(); onRenameCancel() }
              e.stopPropagation()
            }}
            onBlur={() => onRenameCancel()}
          />
        ) : (
          <span className="truncate flex-1 ml-1">{entry.name}</span>
        )}
        {entry.loading && <Spinner size={10} />}
      </div>

      {/* New item input inside this directory */}
      {entry.is_dir && entry.expanded && newItem && newItem.parentPath === entry.path && (
        <NewItemInput
          depth={depth + 1}
          isDir={newItem.isDir}
          value={newItem.value}
          onChange={onNewItemChange}
          onConfirm={() => onNewItemConfirm(newItem.parentPath, newItem.isDir, newItem.value)}
          onCancel={onNewItemCancel}
        />
      )}

      {entry.is_dir && entry.expanded && entry.children && (
        <>
          {entry.children.map(child => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              renamingPath={renamingPath}
              renameValue={renameValue}
              newItem={newItem}
              onSelect={onSelect}
              onExpand={onExpand}
              onContextMenu={onContextMenu}
              onRenameChange={onRenameChange}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
              onNewItemChange={onNewItemChange}
              onNewItemConfirm={onNewItemConfirm}
              onNewItemCancel={onNewItemCancel}
            />
          ))}
        </>
      )}
    </>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ActivityBarButton({ icon, active, title, onClick }: {
  icon: React.ReactNode; active: boolean; title: string; onClick: () => void
}) {
  return (
    <button
      type="button" title={title} onClick={onClick}
      className="flex items-center justify-center w-10 h-10 rounded"
      style={{
        background: active ? 'color-mix(in srgb, var(--vos-accent-primary) 20%, transparent)' : 'transparent',
        color: active ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)',
        border: 'none', cursor: 'pointer', transition: 'color 0.15s, background 0.15s',
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
        background: isActive ? 'var(--vos-bg-window)' : 'transparent',
        color: isActive ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
        borderBottom: isActive ? '1px solid var(--vos-accent-primary)' : '1px solid transparent',
        minWidth: 80, maxWidth: 200, userSelect: 'none',
      }}
      onClick={onActivate}
      onAuxClick={e => { if (e.button === 1) onClose(e) }}
      onKeyDown={e => e.key === 'Enter' && onActivate()}
    >
      <File size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span className="truncate flex-1">
        {isDirty && <span style={{ color: 'var(--vos-accent-warning)', marginRight: 2 }}>●</span>}
        {tab.node.name}
      </span>
      <button
        type="button"
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit',
          ...(isDirty ? { opacity: 1 } : {}),
        }}
        onClick={onClose}
        title="关闭 (Ctrl+W)"
      >
        <X size={11} />
      </button>
    </div>
  )
}

function StatusSep() {
  return <span style={{ opacity: 0.35, margin: '0 4px' }}>|</span>
}



// ─── Main component ───────────────────────────────────────────────────────────

let untitledCounter = 0

async function loadDirEntries(mountId: string, dirPath: string): Promise<DirEntry[]> {
  const r = await vfsApi.listVfsDir(mountId, dirPath, false)
  return [...r.data]
    .sort((a, b) => { if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1; return a.name.localeCompare(b.name) })
    .map(n => ({ name: n.name, path: n.path, is_dir: n.is_dir, children: n.is_dir ? [] : undefined }))
}

function patchNode(nodes: DirEntry[], targetPath: string, patch: Partial<DirEntry>): DirEntry[] {
  return nodes.map(n => {
    if (n.path === targetPath) return { ...n, ...patch }
    if (n.children) return { ...n, children: patchNode(n.children, targetPath, patch) }
    return n
  })
}

function removeNode(nodes: DirEntry[], targetPath: string): DirEntry[] {
  return nodes
    .filter(n => n.path !== targetPath)
    .map(n => n.children ? { ...n, children: removeNode(n.children, targetPath) } : n)
}

function insertSorted(list: DirEntry[], entry: DirEntry): DirEntry[] {
  return [...list, entry].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function insertNodeAt(nodes: DirEntry[], parentPath: string | null, entry: DirEntry): DirEntry[] {
  if (!parentPath) return insertSorted(nodes, entry)
  return nodes.map(n => {
    if (n.path === parentPath) return { ...n, children: insertSorted(n.children ?? [], entry) }
    if (n.children) return { ...n, children: insertNodeAt(n.children, parentPath, entry) }
    return n
  })
}

function flattenTree(nodes: DirEntry[]): DirEntry[] {
  return nodes.flatMap(n => n.is_dir ? [n, ...flattenTree(n.children ?? [])] : [n])
}

export default function MonacoEditorApp({ windowId, initialAppState }: AppComponentProps) {
  const initMountId = (initialAppState?.mountId as string) ?? ''
  const initNode = initialAppState?.node as VfsNode | undefined
  const initDirNode = initialAppState?.dirNode as VfsNode | undefined

  const { setTitle } = useWindowActions(windowId)
  const isMac = /Mac/.test(navigator.userAgent)

  // ── Tabs ──────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<FileTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  // ── Workspace ─────────────────────────────────────────────────────────
  const [workspace, setWorkspace] = useState<WorkspaceRoot | null>(
    initDirNode && initMountId ? { mountId: initMountId, path: initDirNode.path, name: initDirNode.name } : null
  )
  const [tree, setTree] = useState<DirEntry[]>([])

  // ── File index for Ctrl+P ─────────────────────────────────────────────
  const [fileIndex, setFileIndex] = useState<QuickOpenItem[]>([])
  const [isIndexing, setIsIndexing] = useState(false)
  const indexCancelRef = useRef(false)

  // ── Sidebar ───────────────────────────────────────────────────────────
  const [sidebarView, setSidebarView] = useState<'files' | 'search'>('files')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const resizingRef = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  // ── Search panel ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [contentQuery, setContentQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // ── UI state ──────────────────────────────────────────────────────────
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuInfo>({ visible: false, x: 0, y: 0, entry: null })
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newItem, setNewItem] = useState<NewItemState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DirEntry | null>(null)

  // ── Monaco refs ───────────────────────────────────────────────────────
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef<() => void>(() => {})
  const pendingRevealRef = useRef<{ line: number; col: number } | null>(null)

  // ── Status bar ────────────────────────────────────────────────────────
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorCol, setCursorCol] = useState(1)
  const [loadingFile, setLoadingFile] = useState(false)

  const makeTabId = (mountId: string, path: string) => `${mountId}::${path}`

  // ── Background file indexer ───────────────────────────────────────────
  const buildFullIndex = useCallback(async (mountId: string, rootPath: string) => {
    setIsIndexing(true)
    indexCancelRef.current = false
    const index: QuickOpenItem[] = []
    const queue: string[] = [rootPath]
    const rootDepth = rootPath.split('/').filter(Boolean).length
    const MAX_FILES = 8000

    while (queue.length > 0 && index.length < MAX_FILES && !indexCancelRef.current) {
      const dir = queue.shift()!
      const dirDepth = dir.split('/').filter(Boolean).length - rootDepth
      if (dirDepth > 8) continue
      try {
        const r = await vfsApi.listVfsDir(mountId, dir, false)
        for (const node of r.data) {
          if (indexCancelRef.current) break
          if (node.is_dir) {
            queue.push(node.path)
          } else {
            const rel = node.path.startsWith(rootPath)
              ? node.path.slice(rootPath.length).replace(/^\//, '')
              : node.path
            index.push({ path: node.path, name: node.name, relativePath: rel, mountId })
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    if (!indexCancelRef.current) setFileIndex(index)
    setIsIndexing(false)
  }, [])

  // ── Open file as tab ──────────────────────────────────────────────────
  const openFileAsTab = useCallback(async (mountId: string, node: VfsNode, revealPos?: { line: number; col: number }) => {
    const tabId = makeTabId(mountId, node.path)
    const existing = tabs.find(t => t.id === tabId)
    if (existing) {
      setActiveTabId(tabId)
      setTitle(node.name)
      if (revealPos) {
        pendingRevealRef.current = revealPos
        requestAnimationFrame(() => {
          editorRef.current?.revealLineInCenter(revealPos.line)
          editorRef.current?.setPosition({ lineNumber: revealPos.line, column: revealPos.col })
          editorRef.current?.focus()
          pendingRevealRef.current = null
        })
      }
      return
    }

    setLoadingFile(true)
    try {
      const r = await vfsApi.readVfsFile(mountId, node.path, 16 * 1024 * 1024)
      const content = r.data.is_binary
        ? `// Binary file: ${node.name}\n// Cannot be displayed as text.`
        : (r.data.content ?? '')
      const newTab: FileTab = {
        id: tabId, mountId, node, content, savedContent: content,
        language: getLanguageFromExt(node.name),
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(tabId)
      setTitle(node.name)
      if (revealPos) pendingRevealRef.current = revealPos
    } catch (e) { console.error('Open file failed:', e) }
    finally { setLoadingFile(false) }
  }, [tabs, setTitle])

  // ── New untitled tab ──────────────────────────────────────────────────
  const openNewUntitled = useCallback(() => {
    const n = ++untitledCounter
    const id = `untitled-${n}`
    const node: VfsNode = { name: `Untitled-${n}`, path: id, is_dir: false }
    const tab: FileTab = { id, mountId: '', node, content: '', savedContent: '', language: 'plaintext', isNew: true }
    setTabs(prev => [...prev, tab])
    setActiveTabId(id)
    setTitle(node.name)
  }, [setTitle])

  // ── Close tab ─────────────────────────────────────────────────────────
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

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeTab) return
    const content = editorRef.current?.getValue() ?? activeTab.content
    if (content === activeTab.savedContent && !activeTab.isNew) return
    try {
      await vfsApi.writeVfsFile(activeTab.mountId, activeTab.node.path, content)
      setTabs(prev => prev.map(t =>
        t.id === activeTab.id ? { ...t, savedContent: content, content, isNew: false } : t
      ))
    } catch (e) { console.error('Save failed:', e) }
  }, [activeTab])

  useEffect(() => { saveRef.current = handleSave }, [handleSave])

  // ── File tree operations ──────────────────────────────────────────────
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

  // ── File CRUD ─────────────────────────────────────────────────────────
  const handleStartNewItem = useCallback((parentPath: string, isDir: boolean) => {
    if (parentPath && parentPath !== workspace?.path) {
      setTree(prev => patchNode(prev, parentPath, { expanded: true }))
    }
    setNewItem({ parentPath, isDir, value: '' })
  }, [workspace])

  const handleNewItemConfirm = useCallback(async (parentPath: string, isDir: boolean, name: string) => {
    if (!workspace || !name.trim()) { setNewItem(null); return }
    const base = parentPath || workspace.path
    const newPath = `${base.replace(/\/$/, '')}/${name.trim()}`
    setNewItem(null)
    try {
      if (isDir) {
        await vfsApi.mkdirVfs(workspace.mountId, newPath)
        setTree(prev => insertNodeAt(prev, base === workspace.path ? null : base,
          { name: name.trim(), path: newPath, is_dir: true, children: [], expanded: false }))
      } else {
        await vfsApi.writeVfsFile(workspace.mountId, newPath, '')
        setTree(prev => insertNodeAt(prev, base === workspace.path ? null : base,
          { name: name.trim(), path: newPath, is_dir: false }))
        await openFileAsTab(workspace.mountId, { name: name.trim(), path: newPath, is_dir: false })
      }
      // Update index
      const rel = newPath.startsWith(workspace.path) ? newPath.slice(workspace.path.length).replace(/^\//, '') : newPath
      if (!isDir) setFileIndex(prev => [...prev, { path: newPath, name: name.trim(), relativePath: rel, mountId: workspace.mountId }])
    } catch (e) { console.error('Create failed:', e) }
  }, [workspace, openFileAsTab])

  const handleStartRename = useCallback((entry: DirEntry) => {
    setRenamingPath(entry.path)
    setRenameValue(entry.name)
  }, [])

  const handleRenameConfirm = useCallback(async (entry: DirEntry, newName: string) => {
    setRenamingPath(null)
    if (!workspace || !newName.trim() || newName === entry.name) return
    const dir = entry.path.split('/').slice(0, -1).join('/')
    const newPath = `${dir}/${newName.trim()}`
    try {
      await vfsApi.moveVfsFile(workspace.mountId, entry.path, newPath)
      setTree(prev => patchNode(prev, entry.path, { name: newName.trim(), path: newPath }))
      setTabs(prev => prev.map(t =>
        t.node.path === entry.path
          ? { ...t, node: { ...t.node, name: newName.trim(), path: newPath }, id: makeTabId(workspace.mountId, newPath) }
          : t
      ))
      setFileIndex(prev => prev.map(f =>
        f.path === entry.path ? { ...f, name: newName.trim(), path: newPath } : f
      ))
    } catch (e) { console.error('Rename failed:', e) }
  }, [workspace])

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteTarget || !workspace) return
    const entry = deleteTarget
    setDeleteTarget(null)
    try {
      await vfsApi.deleteVfs(workspace.mountId, entry.path)
      setTree(prev => removeNode(prev, entry.path))
      if (!entry.is_dir) {
        closeTab(makeTabId(workspace.mountId, entry.path))
        setFileIndex(prev => prev.filter(f => !f.path.startsWith(entry.path)))
      } else {
        setFileIndex(prev => prev.filter(f => !f.path.startsWith(entry.path + '/')))
      }
    } catch (e) { console.error('Delete failed:', e) }
  }, [deleteTarget, workspace, closeTab])

  const handleRefreshWorkspace = useCallback(async () => {
    if (!workspace) return
    try {
      const entries = await loadDirEntries(workspace.mountId, workspace.path)
      setTree(entries)
      buildFullIndex(workspace.mountId, workspace.path)
    } catch (e) { console.error('Refresh failed:', e) }
  }, [workspace, buildFullIndex])

  // ── Content search ────────────────────────────────────────────────────
  const doContentSearch = useCallback(async (query: string) => {
    if (!query.trim() || fileIndex.length === 0) return
    setIsSearching(true)
    setSearchResults([])
    const results: SearchResult[] = []
    const MAX_FILES_TO_SEARCH = 150

    for (const file of fileIndex.slice(0, MAX_FILES_TO_SEARCH)) {
      try {
        const r = await vfsApi.readVfsFile(file.mountId, file.path, 512 * 1024)
        if (r.data.is_binary) continue
        const lines = (r.data.content ?? '').split('\n')
        const matches: SearchMatch[] = []
        const q = query.toLowerCase()
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            matches.push({ line: i + 1, col: lines[i].toLowerCase().indexOf(q) + 1, preview: lines[i].trim().slice(0, 120) })
          }
          if (matches.length >= 10) break // max 10 matches per file
        }
        if (matches.length > 0) results.push({ file, matches })
      } catch { /* skip */ }
      if (results.length >= 30) break // max 30 files in results
    }

    setSearchResults(results)
    setIsSearching(false)
  }, [fileIndex])

  // ── File open / open folder ───────────────────────────────────────────
  const handleOpenFile = useCallback((result: VfsPickerResult) => {
    const name = result.path.split('/').filter(Boolean).pop() ?? result.path
    openFileAsTab(result.mountId, { name, path: result.path, is_dir: false })
  }, [openFileAsTab])

  const handleOpenDirectory = useCallback(async (result: VfsPickerResult) => {
    const name = result.path.split('/').filter(Boolean).pop() ?? (result.path || '/')
    const ws: WorkspaceRoot = { mountId: result.mountId, path: result.path, name }
    indexCancelRef.current = true // cancel any in-progress index
    setWorkspace(ws)
    setSidebarOpen(true)
    setSidebarView('files')
    setFileIndex([])
    setTree([])
    setTitle(`${name} — 代码编辑器`)
    try {
      const entries = await loadDirEntries(result.mountId, result.path)
      setTree(entries)
      buildFullIndex(result.mountId, result.path)
    } catch (e) { console.error('Load workspace failed:', e) }
  }, [setTitle, buildFullIndex])

  // ── Menu registration ─────────────────────────────────────────────────
  const activeIsDirty = activeTab ? activeTab.content !== activeTab.savedContent : false

  const { showFilePicker, closeFilePicker, handleFilePickerConfirm,
    showDirPicker, closeDirPicker, handleDirPickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'monaco-editor',
    onOpenFile: handleOpenFile,
    onOpenDirectory: handleOpenDirectory,
    extraFileItems: [
      { id: 'new-file', label: '新建文件', shortcut: isMac ? '⌘N' : 'Ctrl+N', action: openNewUntitled },
      { type: 'separator' },
      { id: 'save', label: '保存', shortcut: isMac ? '⌘S' : 'Ctrl+S', action: handleSave, disabled: !activeIsDirty },
      { type: 'separator' },
      { id: 'close-tab', label: '关闭编辑器', shortcut: isMac ? '⌘W' : 'Ctrl+W', action: () => activeTabId && closeTab(activeTabId), disabled: !activeTabId },
    ],
  })

  // ── Editor change ─────────────────────────────────────────────────────
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined || !activeTabId) return
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: value } : t))
  }, [activeTabId])

  // ── Monaco mount ──────────────────────────────────────────────────────
  const handleMonacoMount = useCallback((editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor

    editor.addAction({
      id: 'vos-save', label: '保存',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveRef.current(),
    })
    editor.addAction({
      id: 'vos-quick-open', label: '快速打开文件...',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
      run: () => setCmdPaletteOpen(true),
    })
    editor.addAction({
      id: 'vos-format', label: '格式化文档',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: e => e.getAction('editor.action.formatDocument')?.run(),
    })
    editor.onDidChangeCursorPosition(e => {
      setCursorLine(e.position.lineNumber)
      setCursorCol(e.position.column)
    })

    // Apply pending line reveal (from search result click)
    if (pendingRevealRef.current) {
      const pos = pendingRevealRef.current
      pendingRevealRef.current = null
      requestAnimationFrame(() => {
        editor.revealLineInCenter(pos.line)
        editor.setPosition({ lineNumber: pos.line, column: pos.col })
        editor.focus()
      })
    }
  }, [])

  // ── Keyboard shortcuts (window-level) ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.key === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId) }
      if (mod && !e.shiftKey && e.key === 'p') { e.preventDefault(); setCmdPaletteOpen(true) }
      if (mod && !e.shiftKey && e.key === 'n') { e.preventDefault(); openNewUntitled() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, closeTab, openNewUntitled])

  // ── Sidebar resize ────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = e.clientX - resizeStartX.current
      setSidebarWidth(Math.max(160, Math.min(520, resizeStartW.current + delta)))
    }
    const onUp = () => { resizingRef.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Load initial state ────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once
  useEffect(() => {
    if (initNode && initMountId) openFileAsTab(initMountId, initNode)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once
  useEffect(() => {
    if (initDirNode && initMountId) {
      loadDirEntries(initMountId, initDirNode.path).then(entries => {
        setTree(entries)
        buildFullIndex(initMountId, initDirNode.path)
      })
    }
  }, [])

  // ── Search filter (filename) ──────────────────────────────────────────
  const filteredFiles = searchQuery.trim()
    ? flattenTree(tree).filter(e => !e.is_dir && e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden relative" style={{ background: 'var(--vos-bg-window)', userSelect: resizingRef.current ? 'none' : 'auto' }}>

      {/* ── Activity Bar ── */}
      <div
        className="flex flex-col items-center gap-1 py-2 flex-shrink-0"
        style={{ width: 48, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        <ActivityBarButton
          icon={<Files size={20} />}
          active={sidebarOpen && sidebarView === 'files'}
          title="资源管理器"
          onClick={() => {
            if (sidebarView === 'files') setSidebarOpen(v => !v)
            else { setSidebarView('files'); setSidebarOpen(true) }
          }}
        />
        <ActivityBarButton
          icon={<Search size={20} />}
          active={sidebarOpen && sidebarView === 'search'}
          title="搜索"
          onClick={() => {
            if (sidebarView === 'search') setSidebarOpen(v => !v)
            else { setSidebarView('search'); setSidebarOpen(true) }
          }}
        />
      </div>

      {/* ── Sidebar + Resize Handle ── */}
      {sidebarOpen && (
        <>
          <div
            className="flex flex-col flex-shrink-0 overflow-hidden"
            style={{ width: sidebarWidth, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
          >
            {sidebarView === 'files' ? (
              /* ── Explorer Panel ── */
              <>
                <div
                  className="px-3 py-1.5 flex items-center justify-between flex-shrink-0"
                  style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: 'var(--vos-text-tertiary)' }}>
                    资源管理器
                  </span>
                  {workspace && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button type="button" title="新建文件"
                        onClick={() => handleStartNewItem(workspace.path, false)}
                        className="w-5 h-5 flex items-center justify-center rounded"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--vos-text-tertiary)' }}
                        onMouseEnter={e => { (e.currentTarget).style.color = 'var(--vos-text-primary)' }}
                        onMouseLeave={e => { (e.currentTarget).style.color = 'var(--vos-text-tertiary)' }}
                      >
                        <FilePlus size={13} />
                      </button>
                      <button type="button" title="新建文件夹"
                        onClick={() => handleStartNewItem(workspace.path, true)}
                        className="w-5 h-5 flex items-center justify-center rounded"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--vos-text-tertiary)' }}
                        onMouseEnter={e => { (e.currentTarget).style.color = 'var(--vos-text-primary)' }}
                        onMouseLeave={e => { (e.currentTarget).style.color = 'var(--vos-text-tertiary)' }}
                      >
                        <FolderPlus size={13} />
                      </button>
                      <button type="button" title="刷新"
                        onClick={handleRefreshWorkspace}
                        className="w-5 h-5 flex items-center justify-center rounded"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--vos-text-tertiary)' }}
                        onMouseEnter={e => { (e.currentTarget).style.color = 'var(--vos-text-primary)' }}
                        onMouseLeave={e => { (e.currentTarget).style.color = 'var(--vos-text-tertiary)' }}
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {workspace && (
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider truncate flex-shrink-0"
                    style={{ color: 'var(--vos-text-tertiary)', borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                    {workspace.name}
                  </div>
                )}

                <div
                  className="flex-1 overflow-y-auto py-1"
                  onContextMenu={e => {
                    if ((e.target as HTMLElement).closest('[role="button"]')) return
                    e.preventDefault()
                    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, entry: null })
                  }}
                >
                  {!workspace ? (
                    <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                      <FolderOpen size={28} style={{ color: 'var(--vos-text-tertiary)', opacity: 0.4 }} />
                      <p className="text-xs leading-5" style={{ color: 'var(--vos-text-tertiary)' }}>
                        通过「文件 → 打开文件夹」<br />打开项目
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Root-level new item input */}
                      {newItem && newItem.parentPath === workspace.path && (
                        <NewItemInput
                          depth={0}
                          isDir={newItem.isDir}
                          value={newItem.value}
                          onChange={v => setNewItem(prev => prev ? { ...prev, value: v } : null)}
                          onConfirm={() => handleNewItemConfirm(newItem.parentPath, newItem.isDir, newItem.value)}
                          onCancel={() => setNewItem(null)}
                        />
                      )}
                      {tree.length === 0 && !newItem
                        ? <div className="flex justify-center py-6"><Spinner size={14} /></div>
                        : tree.map(entry => (
                          <FileTreeNode
                            key={entry.path}
                            entry={entry}
                            depth={0}
                            activeFilePath={activeTab?.node.path ?? null}
                            renamingPath={renamingPath}
                            renameValue={renameValue}
                            newItem={newItem}
                            onSelect={handleSelectFile}
                            onExpand={handleExpandDir}
                            onContextMenu={(e, en) => setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, entry: en })}
                            onRenameChange={setRenameValue}
                            onRenameConfirm={handleRenameConfirm}
                            onRenameCancel={() => setRenamingPath(null)}
                            onNewItemChange={v => setNewItem(prev => prev ? { ...prev, value: v } : null)}
                            onNewItemConfirm={handleNewItemConfirm}
                            onNewItemCancel={() => setNewItem(null)}
                          />
                        ))
                      }
                    </>
                  )}
                </div>
              </>
            ) : (
              /* ── Search Panel ── */
              <>
                <div className="px-3 py-1.5 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--vos-text-tertiary)', borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                  搜索
                </div>
                <div className="px-2 py-2 flex flex-col gap-1.5 flex-shrink-0" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                  <input
                    type="text"
                    value={contentQuery}
                    onChange={e => setContentQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doContentSearch(contentQuery) }}
                    placeholder="搜索内容 (Enter 确认)..."
                    className="w-full px-2 py-1.5 text-xs rounded outline-none"
                    style={{ background: 'var(--vos-bg-input)', border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="筛选文件名..."
                    className="w-full px-2 py-1.5 text-xs rounded outline-none"
                    style={{ background: 'var(--vos-bg-input)', border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }}
                  />
                </div>

                <div className="flex-1 overflow-y-auto">
                  {isSearching && (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Spinner size={12} />
                      <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>搜索中...</span>
                    </div>
                  )}

                  {/* Content search results */}
                  {!isSearching && searchResults.length > 0 && (
                    <div>
                      <div className="px-3 py-1 text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                        找到 {searchResults.reduce((s, r) => s + r.matches.length, 0)} 处匹配
                      </div>
                      {searchResults.map(result => (
                        <div key={result.file.path}>
                          <div className="px-3 py-1 flex items-center gap-1.5 text-xs font-medium"
                            style={{ color: 'var(--vos-text-primary)', background: 'var(--vos-bg-input)' }}>
                            <File size={11} style={{ flexShrink: 0 }} />
                            <span className="truncate">{result.file.name}</span>
                          </div>
                          {result.matches.map((m, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-4 py-1 text-xs"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--vos-text-secondary)', display: 'block' }}
                              onMouseEnter={e => { (e.currentTarget).style.background = 'var(--vos-bg-item-hover)' }}
                              onMouseLeave={e => { (e.currentTarget).style.background = 'transparent' }}
                              onClick={() => openFileAsTab(
                                result.file.mountId,
                                { name: result.file.name, path: result.file.path, is_dir: false },
                                { line: m.line, col: m.col }
                              )}
                            >
                              <span style={{ color: 'var(--vos-text-tertiary)', marginRight: 4 }}>{m.line}:</span>
                              <span className="font-mono">{m.preview}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Filename filter results */}
                  {searchQuery.trim() && filteredFiles.length === 0 && !isSearching && (
                    <p className="text-xs px-3 py-2" style={{ color: 'var(--vos-text-tertiary)' }}>无匹配文件</p>
                  )}
                  {searchQuery.trim() && filteredFiles.map(entry => (
                    <button key={entry.path} type="button"
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-left"
                      style={{ background: 'transparent', border: 'none', color: 'var(--vos-text-secondary)', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget).style.background = 'var(--vos-bg-item-hover)' }}
                      onMouseLeave={e => { (e.currentTarget).style.background = 'transparent' }}
                      onClick={() => workspace && handleSelectFile(entry)}>
                      <File size={11} style={{ flexShrink: 0 }} />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))}

                  {!contentQuery && !searchQuery && (
                    <p className="text-xs px-3 py-3" style={{ color: 'var(--vos-text-tertiary)' }}>
                      在上方输入内容关键词，按 Enter 搜索
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Resize Handle ── */}
          <div
            style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
            onMouseDown={e => {
              e.preventDefault()
              resizingRef.current = true
              resizeStartX.current = e.clientX
              resizeStartW.current = sidebarWidth
            }}
          />
        </>
      )}

      {/* ── Editor Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Tab Bar */}
        <div
          className="flex items-center flex-shrink-0 overflow-x-auto"
          style={{ height: 35, minHeight: 35, borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
        >
          {tabs.map(tab => (
            <EditorTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isDirty={tab.content !== tab.savedContent}
              onActivate={() => { setActiveTabId(tab.id); setTitle(tab.node.name); editorRef.current?.focus() }}
              onClose={e => closeTab(tab.id, e)}
            />
          ))}
          <button
            type="button"
            className="flex-shrink-0 px-2 h-full flex items-center"
            style={{ color: 'var(--vos-text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title={`新建文件 (${isMac ? '⌘N' : 'Ctrl+N'})`}
            onClick={openNewUntitled}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Breadcrumb */}
        {activeTab && (
          <div
            className="flex items-center gap-1 px-3 flex-shrink-0 overflow-hidden text-xs"
            style={{ height: 22, background: 'var(--vos-bg-surface)', borderBottom: '0.5px solid var(--vos-border-subtle)', color: 'var(--vos-text-tertiary)' }}
          >
            {workspace && (
              <><span className="flex-shrink-0 max-w-20 truncate">{workspace.name}</span><ChevronRight size={10} style={{ flexShrink: 0 }} /></>
            )}
            {!activeTab.isNew
              ? activeTab.node.path.split('/').filter(Boolean).map((seg, i, arr) => (
                <span key={i} className="flex items-center gap-1 flex-shrink-0">
                  <span style={i === arr.length - 1 ? { color: 'var(--vos-text-primary)' } : {}}>{seg}</span>
                  {i < arr.length - 1 && <ChevronRight size={10} />}
                </span>
              ))
              : <span style={{ color: 'var(--vos-text-primary)' }}>{activeTab.node.name}</span>
            }
          </div>
        )}

        {/* Monaco / Welcome / Loading */}
        <div className="flex-1 relative overflow-hidden">
          {loadingFile ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner size={20} />
            </div>
          ) : !activeTab ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-6"
              style={{ background: 'var(--vos-bg-window)', color: 'var(--vos-text-tertiary)' }}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0078d4 0%, #005a9e 100%)' }}>
                  <Code2 size={32} color="#fff" />
                </div>
                <div className="text-base font-medium" style={{ color: 'var(--vos-text-primary)' }}>代码编辑器</div>
              </div>
              <div className="flex flex-col gap-3 text-sm">
                {[
                  { key: isMac ? '⌘P' : 'Ctrl+P', label: '快速打开文件', icon: <Search size={14} /> },
                  { key: isMac ? '⌘O' : 'Ctrl+O', label: '打开文件', icon: <File size={14} /> },
                  { key: isMac ? '⌘⇧O' : 'Ctrl+Shift+O', label: '打开文件夹', icon: <FolderOpen size={14} /> },
                  { key: isMac ? '⌘N' : 'Ctrl+N', label: '新建文件', icon: <Plus size={14} /> },
                ].map(({ key, label, icon }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span style={{ color: 'var(--vos-accent-primary)', width: 16 }}>{icon}</span>
                    <span style={{ color: 'var(--vos-text-secondary)' }}>{label}</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] rounded font-mono"
                      style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)', border: '1px solid var(--vos-border-subtle)' }}>
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
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
                scrollBeyondLastLine: true,
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
                linkedEditing: true,
              }}
              onMount={handleMonacoMount}
              onChange={handleEditorChange}
            />
          )}
        </div>

        {/* Status Bar */}
        <div
          className="flex items-center px-2 flex-shrink-0 text-[11px] select-none overflow-hidden"
          style={{ height: 22, background: 'var(--vos-accent-primary)', color: '#ffffffcc' }}
        >
          {activeTab ? (
            <>
              <span className="px-1">{displayLanguage(activeTab.language)}</span>
              <StatusSep />
              <span className="px-1">Ln {cursorLine}, Col {cursorCol}</span>
              <StatusSep />
              <span className="px-1">UTF-8</span>
              <StatusSep />
              <span className="px-1">Spaces: 2</span>
              {activeIsDirty && <><StatusSep /><span className="px-1" style={{ color: '#ffd86e' }}>● 已修改</span></>}
            </>
          ) : (
            <>
              <span className="px-1">代码编辑器</span>
              {isIndexing && <><StatusSep /><span className="px-1 flex items-center gap-1"><Spinner size={10} /> 建立索引中...</span></>}
            </>
          )}
        </div>
      </div>

      {/* ── Command Palette ── */}
      {cmdPaletteOpen && (
        <CommandPalette
          items={fileIndex}
          isIndexing={isIndexing}
          onSelect={item => {
            setCmdPaletteOpen(false)
            openFileAsTab(item.mountId, { name: item.name, path: item.path, is_dir: false })
          }}
          onClose={() => setCmdPaletteOpen(false)}
        />
      )}

      {/* ── Context Menu ── */}
      {ctxMenu.visible && (
        <ContextMenu
          info={ctxMenu}
          hasWorkspace={!!workspace}
          onNewFile={p => { handleStartNewItem(p || workspace?.path || '', false); setCtxMenu(prev => ({ ...prev, visible: false })) }}
          onNewFolder={p => { handleStartNewItem(p || workspace?.path || '', true); setCtxMenu(prev => ({ ...prev, visible: false })) }}
          onRename={entry => { handleStartRename(entry); setCtxMenu(prev => ({ ...prev, visible: false })) }}
          onDelete={entry => { setDeleteTarget(entry); setCtxMenu(prev => ({ ...prev, visible: false })) }}
          onCopyPath={path => { navigator.clipboard?.writeText(path); setCtxMenu(prev => ({ ...prev, visible: false })) }}
          onRefresh={() => { handleRefreshWorkspace(); setCtxMenu(prev => ({ ...prev, visible: false })) }}
          onClose={() => setCtxMenu(prev => ({ ...prev, visible: false }))}
        />
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
        title={`删除${deleteTarget?.is_dir ? '文件夹' : '文件'}`}
        danger
        confirmText="删除"
      >
        确定要删除 <strong>{deleteTarget?.name}</strong>？此操作不可撤销。
      </ConfirmDialog>

      {/* ── VFS Pickers ── */}
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
