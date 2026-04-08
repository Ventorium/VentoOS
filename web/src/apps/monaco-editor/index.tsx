/**
 * Monaco Editor App
 *
 * A full-featured VS Code-like editor that can open any file or directory.
 * Supports:
 * - Single file editing with syntax highlighting
 * - Directory browsing with file tree (sidebar)
 * - File→Open menu with Ctrl+O shortcut
 * - Auto-save, find/replace (Monaco built-in)
 * - Multi-tab (each window per file)
 */

import MonacoEditor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import {
  ChevronRight,
  Code2,
  File,
  Folder,
  FolderOpen,
  Plus,
  Save
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import { VfsFilePickerModal } from '@/shell/FilePicker'
import type { VfsNode } from '../explorer/api'
import { vfsApi } from '../explorer/api'

interface FileTab {
  mountId: string
  node: VfsNode
  content: string
  isDirty: boolean
  language: string
}

function getLanguageFromExt(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', jsonc: 'json',
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini',
    rs: 'rust',
    go: 'go',
    py: 'python',
    rb: 'ruby',
    php: 'php',
    java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
    ps1: 'powershell',
    bat: 'bat', cmd: 'bat',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'html',
    svelte: 'html'
  }
  return map[ext] ?? 'plaintext'
}

// Directory tree node
interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  children?: DirEntry[]
  expanded?: boolean
  loading?: boolean
}

function FileTreeNode({
  entry,
  depth,
  mountId,
  selectedPath,
  onSelect,
  onExpand
}: {
  entry: DirEntry
  depth: number
  mountId: string
  selectedPath: string | null
  onSelect: (entry: DirEntry) => void
  onExpand: (entry: DirEntry) => void
}) {
  const isSelected = selectedPath === entry.path
  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        className="flex items-center gap-1 cursor-pointer py-[2px] text-xs"
        style={{
          paddingLeft: 8 + depth * 14,
          background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
          color: isSelected ? '#fff' : 'var(--vos-text-primary)',
          borderRadius: 2
        }}
        onClick={() => {
          if (entry.is_dir) {
            onExpand(entry)
          } else {
            onSelect(entry)
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            if (entry.is_dir) onExpand(entry)
            else onSelect(entry)
          }
        }}
      >
        {entry.is_dir ? (
          <>
            <ChevronRight
              size={11}
              style={{
                flexShrink: 0,
                transition: 'transform 0.15s',
                transform: entry.expanded ? 'rotate(90deg)' : 'none',
                opacity: 0.7
              }}
            />
            {entry.expanded ? (
              <FolderOpen size={12} style={{ color: isSelected ? '#fff' : 'var(--vos-accent-warning)', flexShrink: 0 }} />
            ) : (
              <Folder size={12} style={{ color: isSelected ? '#fff' : 'var(--vos-accent-warning)', flexShrink: 0 }} />
            )}
          </>
        ) : (
          <>
            <span style={{ width: 11, flexShrink: 0 }} />
            <File size={12} style={{ color: isSelected ? '#fff' : 'var(--vos-text-tertiary)', flexShrink: 0 }} />
          </>
        )}
        <span className="truncate flex-1">{entry.name}</span>
        {entry.loading && <Spinner size={10} />}
      </div>
      {entry.is_dir && entry.expanded && entry.children && (
        <>
          {entry.children.map(child => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              mountId={mountId}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onExpand={onExpand}
            />
          ))}
        </>
      )}
    </>
  )
}

export default function MonacoEditorApp({ windowId, initialAppState }: AppComponentProps) {
  const mountId = (initialAppState?.mountId as string) ?? ''
  const node = initialAppState?.node as VfsNode | undefined
  const dirNode = initialAppState?.dirNode as VfsNode | undefined

  const [tab, setTab] = useState<FileTab | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)
  // Ref to always call the latest handleSave from Monaco keybinding
  const handleSaveRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Directory sidebar
  const [sidebarMountId, setSidebarMountId] = useState<string | null>(dirNode ? mountId : null)
  const [tree, setTree] = useState<DirEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(node?.path ?? null)

  const isMac = /Mac/.test(navigator.userAgent)
  const { showFilePicker, openFilePicker, closeFilePicker, handleFilePickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'monaco-editor',
    extraFileItems: [
      {
        id: 'save',
        label: '保存',
        shortcut: isMac ? '⌘S' : 'Ctrl+S',
        action: () => handleSave(),
        disabled: !tab?.isDirty
      }
    ]
  })

  // Mount Monaco keybinding for ⌘S / Ctrl+S
  const handleMonacoMount = useCallback((editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor
    editor.addAction({
      id: 'vos-save-file',
      label: '保存文件',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => { handleSaveRef.current() }
    })
  }, [])

  // Load file when app opens with a node
  useEffect(() => {
    if (!node || !mountId) return
    loadFile(mountId, node)
  }, [mountId, node?.path])

  // Load directory when app opens with a dirNode
  useEffect(() => {
    if (!dirNode || !mountId) return
    setSidebarMountId(mountId)
    loadDirectory(mountId, dirNode.path)
      .then(entries => setTree(entries))
      .catch(console.error)
  }, [mountId, dirNode?.path])

  const loadFile = async (mId: string, n: VfsNode) => {
    setLoading(true)
    setError(null)
    try {
      const r = await vfsApi.readVfsFile(mId, n.path, 10 * 1024 * 1024)
      const content = r.data.is_binary ? '// Binary file — cannot be edited as text' : r.data.content
      setTab({
        mountId: mId,
        node: n,
        content,
        isDirty: false,
        language: getLanguageFromExt(n.name)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadDirectory = async (mId: string, path: string): Promise<DirEntry[]> => {
    const r = await vfsApi.listVfsDir(mId, path, false)
    return r.data.map(n => ({
      name: n.name,
      path: n.path,
      is_dir: n.is_dir,
      children: n.is_dir ? [] : undefined,
      expanded: false
    }))
  }

  const handleExpandDir = async (entry: DirEntry) => {
    if (!sidebarMountId) return
    if (!entry.is_dir) return

    const update = (nodes: DirEntry[]): DirEntry[] =>
      nodes.map(n => {
        if (n.path === entry.path) {
          if (n.expanded) {
            return { ...n, expanded: false }
          }
          return { ...n, expanded: true, loading: true }
        }
        if (n.children) return { ...n, children: update(n.children) }
        return n
      })

    setTree(prev => update(prev))

    try {
      const children = await loadDirectory(sidebarMountId, entry.path)
      const withChildren = (nodes: DirEntry[]): DirEntry[] =>
        nodes.map(n => {
          if (n.path === entry.path) return { ...n, children, loading: false }
          if (n.children) return { ...n, children: withChildren(n.children) }
          return n
        })
      setTree(prev => withChildren(prev))
    } catch (e) {
      console.error('Load dir failed:', e)
    }
  }

  const handleSelectFile = (entry: DirEntry) => {
    if (!sidebarMountId || entry.is_dir) return
    setSelectedPath(entry.path)
    const vfsNode: VfsNode = { name: entry.name, path: entry.path, is_dir: false }
    loadFile(sidebarMountId, vfsNode)
  }

  const handleSave = useCallback(async () => {
    if (!tab || tab.node.is_dir) return
    setSaving(true)
    try {
      const content = editorRef.current?.getValue() ?? tab.content
      await vfsApi.writeVfsFile(tab.mountId, tab.node.path, content)
      setTab(prev => prev ? { ...prev, isDirty: false, content } : prev)
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }, [tab])

  // Keep ref up to date so Monaco keybinding always calls the latest version
  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

  const hasSidebar = tree.length > 0

  return (
    <div className="flex h-full" style={{ background: 'var(--vos-bg-base)', outline: 'none' }}>
      {/* Sidebar file tree */}
      {hasSidebar && (
        <div
          className="flex flex-col flex-shrink-0 overflow-y-auto"
          style={{
            width: 220,
            borderRight: '0.5px solid var(--vos-border-subtle)',
            background: 'var(--vos-bg-surface)'
          }}
        >
          <div
            className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
            style={{ color: 'var(--vos-text-tertiary)', borderBottom: '0.5px solid var(--vos-border-subtle)' }}
          >
            资源管理器
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {tree.map(entry => (
              <FileTreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                mountId={sidebarMountId!}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                onExpand={handleExpandDir}
              />
            ))}
          </div>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        {tab && (
          <div
            className="flex items-center flex-shrink-0 h-8"
            style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
          >
            <div
              className="flex items-center gap-1.5 px-3 h-full text-xs border-r"
              style={{
                borderBottom: '2px solid var(--vos-accent-primary)',
                borderRight: '0.5px solid var(--vos-border-subtle)',
                color: 'var(--vos-text-primary)',
                background: 'var(--vos-bg-base)'
              }}
            >
              <File size={11} style={{ color: 'var(--vos-text-tertiary)' }} />
              <span>{tab.node.name}</span>
              {tab.isDirty && (
                <span style={{ color: 'var(--vos-accent-warning)', fontSize: 16, lineHeight: 1 }}>●</span>
              )}
            </div>
            <div className="flex-1" />
            {tab && (
              <button
                type="button"
                className="flex items-center gap-1 h-full px-2.5 text-xs border-none cursor-pointer transition-colors"
                style={{
                  background: 'transparent',
                  color: saving ? 'var(--vos-text-tertiary)' : tab.isDirty ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)'
                }}
                disabled={saving || !tab.isDirty}
                onClick={handleSave}
                title="保存 (Ctrl+S / ⌘S)"
              >
                {saving ? <Spinner size={12} /> : <Save size={12} />}
                <span>{saving ? '保存中...' : '保存'}</span>
              </button>
            )}
          </div>
        )}

        {/* Monaco editor */}
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
              <Spinner size={20} />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-xs" style={{ color: 'var(--vos-accent-danger)' }}>
                加载失败：{error}
              </div>
            </div>
          )}
          {!loading && !error && !tab && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Code2 size={40} style={{ color: 'var(--vos-text-tertiary)' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>代码编辑器</div>
              <div className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>通过「文件 → 打开」或双击文件打开</div>
              <button
                type="button"
                className="vos-btn vos-btn-sm flex items-center gap-1.5 mt-2"
                onClick={() => openFilePicker()}
              >
                <Plus size={13} />
                打开文件...
              </button>
            </div>
          )}
          {!loading && !error && tab && (
            <MonacoEditor
              height="100%"
              language={tab.language}
              value={tab.content}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", "Menlo", monospace',
                minimap: { enabled: true },
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                renderWhitespace: 'boundary',
                bracketPairColorization: { enabled: true },
                guides: { indentation: true },
                padding: { top: 8, bottom: 8 }
              }}
              onMount={handleMonacoMount}
              onChange={value => {
                if (value !== undefined) {
                  setTab(prev => prev ? { ...prev, isDirty: value !== prev.content } : prev)
                }
              }}
            />
          )}
        </div>
      </div>

      {/* File picker modal */}
      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal
            mode="open"
            onConfirm={handleFilePickerConfirm}
            onClose={closeFilePicker}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
