import Editor from '@monaco-editor/react'
import {
  ChevronRight,
  Download,
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  HardDrive,
  Monitor,
  Plus,
  Redo2,
  Save,
  Search,
  Settings,
  Undo2,
  Upload,
  X
} from 'lucide-react'
import type * as Monaco from 'monaco-editor'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { superTerminalApi } from '@/apps/super-terminal/api'

const WebShell = React.lazy(() => import('@/shell/WebShell'))

// ─── File Icon Resolver ─────────────────────────────────────────────────────

const EXT_ICON_MAP: Record<string, React.ReactNode> = {
  js: <FileCode size={14} color="#f7df1e" />,
  jsx: <FileCode size={14} color="#61dafb" />,
  ts: <FileCode size={14} color="#3178c6" />,
  tsx: <FileCode size={14} color="#3178c6" />,
  py: <FileCode size={14} color="#3776ab" />,
  rs: <FileCode size={14} color="#dea584" />,
  go: <FileCode size={14} color="#00add8" />,
  json: <FileJson size={14} color="#cbcb41" />,
  yaml: <FileText size={14} color="#cb171e" />,
  yml: <FileText size={14} color="#cb171e" />,
  md: <FileText size={14} color="#519aba" />,
  toml: <FileText size={14} color="#9c4121" />,
  sh: <FileType size={14} color="#89e051" />,
  bash: <FileType size={14} color="#89e051" />,
  css: <FileCode size={14} color="#563d7c" />,
  html: <FileCode size={14} color="#e34c26" />,
  sql: <FileCode size={14} color="#e38c00" />,
  dockerfile: <FileCode size={14} color="#384d54" />
}

function getFileIcon(name: string): React.ReactNode {
  const lower = name.toLowerCase()
  if (lower === 'dockerfile') return EXT_ICON_MAP.dockerfile
  const ext = lower.split('.').pop() || ''
  return EXT_ICON_MAP[ext] || <File size={14} color="#8f8f8f" />
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    css: 'css',
    html: 'html',
    sql: 'sql',
    xml: 'xml',
    dockerfile: 'dockerfile',
    conf: 'ini',
    ini: 'ini',
    env: 'dotenv',
    txt: 'plaintext'
  }
  return map[ext] || 'plaintext'
}

// ─── Mock File Tree ─────────────────────────────────────────────────────────

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
}

// ─── Open File Tab ──────────────────────────────────────────────────────────

interface OpenFile {
  path: string
  name: string
  content: string
  originalContent: string
  language: string
}

// ─── Terminal Tab ───────────────────────────────────────────────────────────

interface TerminalTab {
  id: string
  label: string
}

// ─── Right Panel ────────────────────────────────────────────────────────────

type RightPanelKind = 'monitor' | 'upload' | 'download' | null

interface RightPanelDef {
  kind: Exclude<RightPanelKind, null>
  icon: React.ReactNode
  label: string
}

const RIGHT_PANELS: RightPanelDef[] = [
  { kind: 'monitor', icon: <Monitor size={18} />, label: '服务器监控' },
  { kind: 'upload', icon: <Upload size={18} />, label: '上传队列' },
  { kind: 'download', icon: <Download size={18} />, label: '下载队列' }
]

// ─── Style classNames ───────────────────────────────────────────────────────

const S = {
  root: 'flex w-full h-full bg-[#1a1a1a] text-[#ccc] font-inherit overflow-hidden text-[13px]',
  leftPanel: 'shrink-0 flex flex-col border-r border-r-[#2a2a2a] bg-[#181818] overflow-hidden',
  leftHeader:
    'h-[34px] flex items-center gap-1.5 px-2.5 border-b border-b-[#2a2a2a] text-[11px] font-semibold text-[#999] uppercase tracking-[0.04em] shrink-0',
  treeWrap: 'flex-1 overflow-y-auto py-1',
  treeRow:
    'flex items-center h-6 gap-1 pr-2 cursor-pointer select-none whitespace-nowrap overflow-hidden text-ellipsis',
  treeLabel: 'text-xs overflow-hidden text-ellipsis whitespace-nowrap',
  resizeH: 'w-1 cursor-col-resize shrink-0 bg-transparent z-2',
  resizeV: 'h-1 cursor-row-resize shrink-0 bg-transparent z-2',
  center: 'flex-1 flex flex-col min-w-0 overflow-hidden',
  editorArea: 'flex flex-col overflow-hidden min-h-[80px]',
  tabBar: 'flex items-center h-8 bg-[#1e1e1e] border-b border-b-[#2a2a2a] shrink-0 overflow-hidden',
  tab: 'flex items-center gap-[5px] h-full pl-2.5 pr-1.5 cursor-pointer text-xs shrink-0 border-r border-r-[#2a2a2a] select-none max-w-[160px]',
  tabClose: 'flex items-center justify-center w-[18px] h-[18px] rounded shrink-0 opacity-50 cursor-pointer',
  toolbar: 'flex items-center gap-0.5 h-7 px-2 bg-[#1e1e1e] border-b border-b-[#2a2a2a] shrink-0',
  toolBtn:
    'flex items-center justify-center w-[26px] h-[22px] rounded border-none bg-transparent text-[#aaa] cursor-pointer',
  editorEmpty: 'flex-1 flex flex-col items-center justify-center gap-2.5 text-[#555] text-[13px]',
  termArea: 'flex-1 flex flex-col overflow-hidden min-h-[80px]',
  termTabBar:
    'flex items-center h-[30px] bg-[#181818] border-t border-t-[#2a2a2a] border-b border-b-[#2a2a2a] shrink-0',
  termTab:
    'flex items-center gap-1 h-full pl-2.5 pr-1.5 cursor-pointer text-xs border-r border-r-[#2a2a2a] shrink-0 select-none',
  termAdd: 'flex items-center justify-center w-7 h-full cursor-pointer text-[#777]',
  termBody: 'flex-1 relative overflow-hidden',
  termShell: 'absolute inset-0',
  rightBar: 'w-12 shrink-0 flex flex-col items-center gap-1 py-2 border-l border-l-[#2a2a2a] bg-[#181818]',
  rightBtn:
    'flex flex-col items-center justify-center gap-0.5 w-10 h-11 rounded-[6px] cursor-pointer border-none text-[9px]',
  rightSlide: 'overflow-hidden shrink-0 bg-[#1c1c1c] transition-[width] duration-200 ease flex flex-col',
  rightHeader:
    'flex items-center justify-between h-[34px] px-3 border-b border-b-[#2a2a2a] text-xs font-semibold text-[#bbb] shrink-0',
  rightContent: 'flex-1 p-3 overflow-auto text-[#888] text-xs',
  placeholder: 'flex flex-col items-center justify-center gap-2 h-full text-[#555] text-xs text-center',
  metricRow: 'flex justify-between py-1.5 border-b border-b-[#2a2a2a]',
  contextMenu:
    'fixed z-[9999] bg-[#252526] border border-[#3a3a3a] rounded-[6px] py-1 min-w-[160px] shadow-[0_8px_24px_rgba(0,0,0,.4)]',
  ctxItem: 'flex items-center gap-2 py-[5px] px-[14px] cursor-pointer text-xs text-[#ccc]'
} as const

// ─── Context Menu ───────────────────────────────────────────────────────────

interface CtxMenu {
  x: number
  y: number
  node: TreeNode
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SshSession({ serverId, serverName }: { serverId: string; serverName: string }) {
  // ── Layout state ──
  const [leftWidth, setLeftWidth] = useState(200)
  const [editorHeight, setEditorHeight] = useState(0) // 0 means auto 55%
  const centerRef = useRef<HTMLDivElement>(null)

  // ── File tree ──
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<CtxMenu | null>(null)

  // ── Editor tabs ──
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  // ── Terminal tabs ──
  const [termTabs, setTermTabs] = useState<TerminalTab[]>([{ id: 't-1', label: '终端 1' }])
  const [activeTermId, setActiveTermId] = useState('t-1')
  const termCounter = useRef(1)

  // ── Right panel ──
  const [rightPanel, setRightPanel] = useState<RightPanelKind>(null)
  const [serverMetrics, setServerMetrics] = useState<Record<string, unknown> | null>(null)

  // ── Metrics polling ──
  useEffect(() => {
    if (rightPanel !== 'monitor') return
    const fetchMetrics = () => {
      superTerminalApi
        .getServerMetrics(serverId)
        .then(res => {
          if (res.success && res.data) setServerMetrics(res.data as Record<string, unknown>)
        })
        .catch(() => {})
    }
    fetchMetrics()
    const timer = setInterval(fetchMetrics, 5000)
    return () => clearInterval(timer)
  }, [serverId, rightPanel])

  // ── Resize dragging refs ──
  const dragging = useRef<'left' | 'vertical' | null>(null)
  const dragStart = useRef({ x: 0, y: 0, value: 0 })

  // ── Computed editor height ──
  const resolvedEditorHeight = useMemo(() => {
    if (editorHeight > 0) return editorHeight
    return undefined // will use flex
  }, [editorHeight])

  // ── Close context menu on outside click ──
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  // ── Global mouse move/up for resizing ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      if (dragging.current === 'left') {
        const delta = e.clientX - dragStart.current.x
        setLeftWidth(Math.max(120, Math.min(500, dragStart.current.value + delta)))
      } else if (dragging.current === 'vertical') {
        const delta = e.clientY - dragStart.current.y
        const cH = centerRef.current?.clientHeight || 600
        const next = Math.max(80, Math.min(cH - 80, dragStart.current.value + delta))
        setEditorHeight(next)
      }
    }
    const onUp = () => {
      dragging.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Tree helpers ──
  const toggleExpand = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const handleFileOpen = useCallback(
    (node: TreeNode) => {
      if (node.isDir) return
      setSelectedPath(node.path)
      // Already open?
      if (openFiles.some(f => f.path === node.path)) {
        setActiveFilePath(node.path)
        return
      }
      const placeholder = `# ${node.name}\n# 文件内容将在 SFTP 连接后加载...\n`
      const file: OpenFile = {
        path: node.path,
        name: node.name,
        content: placeholder,
        originalContent: placeholder,
        language: getLanguage(node.name)
      }
      setOpenFiles(prev => [...prev, file])
      setActiveFilePath(node.path)
    },
    [openFiles]
  )

  const closeFile = useCallback(
    (path: string, e?: React.MouseEvent) => {
      e?.stopPropagation()
      setOpenFiles(prev => {
        const next = prev.filter(f => f.path !== path)
        if (activeFilePath === path) {
          setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null)
        }
        return next
      })
    },
    [activeFilePath]
  )

  const activeFile = useMemo(() => openFiles.find(f => f.path === activeFilePath) ?? null, [openFiles, activeFilePath])

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeFilePath || value === undefined) return
      setOpenFiles(prev => prev.map(f => (f.path === activeFilePath ? { ...f, content: value } : f)))
    },
    [activeFilePath]
  )

  // ── Terminal helpers ──
  const addTerminal = useCallback(() => {
    termCounter.current += 1
    const id = `t-${termCounter.current}`
    setTermTabs(prev => [...prev, { id, label: `终端 ${termCounter.current}` }])
    setActiveTermId(id)
  }, [])

  const closeTerminal = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation()
      setTermTabs(prev => {
        const next = prev.filter(t => t.id !== id)
        if (activeTermId === id) {
          setActiveTermId(next.length > 0 ? next[next.length - 1].id : '')
        }
        return next
      })
    },
    [activeTermId]
  )

  // ── Render tree node ──
  const renderTreeNode = useCallback(
    (node: TreeNode, depth: number): React.ReactNode => {
      const isExpanded = expanded.has(node.path)
      const isActive = selectedPath === node.path

      return (
        <React.Fragment key={node.path}>
          <div
            className={S.treeRow}
            style={{
              paddingLeft: 8 + depth * 14,
              background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent'
            }}
            onClick={() => {
              node.isDir ? toggleExpand(node.path) : setSelectedPath(node.path)
            }}
            onDoubleClick={() => handleFileOpen(node)}
            onContextMenu={e => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({ x: e.clientX, y: e.clientY, node })
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLDivElement).style.background = isActive
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(255,255,255,0.03)'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLDivElement).style.background = isActive
                ? 'rgba(255,255,255,0.06)'
                : 'transparent'
            }}
          >
            {node.isDir && (
              <ChevronRight
                size={12}
                color="#888"
                className="shrink-0 transition-transform duration-150"
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : 'none'
                }}
              />
            )}
            {node.isDir ? (
              isExpanded ? (
                <FolderOpen size={14} color="#e8a838" />
              ) : (
                <Folder size={14} color="#e8a838" />
              )
            ) : (
              getFileIcon(node.name)
            )}
            <span className={S.treeLabel}>{node.name}</span>
          </div>
          {node.isDir && isExpanded && node.children?.map(c => renderTreeNode(c, depth + 1))}
        </React.Fragment>
      )
    },
    [expanded, selectedPath, toggleExpand, handleFileOpen]
  )

  // ── Right panel content ──
  const renderRightContent = useCallback(() => {
    if (rightPanel === 'monitor') {
      const metrics = [
        { label: 'CPU', value: serverMetrics?.cpu ? String(serverMetrics.cpu) : '—', color: '#0A84FF' },
        { label: '内存', value: serverMetrics?.memory ? String(serverMetrics.memory) : '—', color: '#30D158' },
        { label: '磁盘', value: serverMetrics?.disk ? String(serverMetrics.disk) : '—', color: '#FF9F0A' },
        { label: '网络 ↑', value: serverMetrics?.net_up ? String(serverMetrics.net_up) : '—', color: '#64D2FF' },
        { label: '网络 ↓', value: serverMetrics?.net_down ? String(serverMetrics.net_down) : '—', color: '#BF5AF2' }
      ]
      return (
        <div>
          <div className="text-[#555] text-[11px] mb-3 leading-[1.5]">
            SSH 远程指标采集开发中{'\n'}
            <span className="text-[#444]">将通过 SSH 执行系统命令采集</span>
          </div>
          {metrics.map(m => (
            <div key={m.label} className={S.metricRow}>
              <span className="text-[#aaa]">{m.label}</span>
              <span
                className={m.value === '—' ? 'text-[#555]' : undefined}
                style={m.value !== '—' ? { color: m.color } : undefined}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>
      )
    }
    if (rightPanel === 'upload') {
      return (
        <div className={S.placeholder}>
          <Upload size={28} color="#555" />
          <span>暂无上传任务</span>
          <span className="text-[11px] text-[#444]">拖拽文件到文件树即可上传</span>
        </div>
      )
    }
    if (rightPanel === 'download') {
      return (
        <div className={S.placeholder}>
          <Download size={28} color="#555" />
          <span>暂无下载任务</span>
          <span className="text-[11px] text-[#444]">右键文件选择“下载”</span>
        </div>
      )
    }
    return null
  }, [rightPanel, serverMetrics])

  const rightPanelTitle = useMemo(() => {
    return RIGHT_PANELS.find(p => p.kind === rightPanel)?.label ?? ''
  }, [rightPanel])

  // ── Start resize ──
  const startLeftResize = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = 'left'
      dragStart.current = { x: e.clientX, y: 0, value: leftWidth }
    },
    [leftWidth]
  )

  const startVerticalResize = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = 'vertical'
      const cH = centerRef.current?.clientHeight || 600
      const current = resolvedEditorHeight ?? Math.round(cH * 0.55)
      dragStart.current = { x: 0, y: e.clientY, value: current }
      if (!resolvedEditorHeight) setEditorHeight(current)
    },
    [resolvedEditorHeight]
  )

  // ── Editor toolbar actions ──
  const handleEditorSave = useCallback(() => {
    const file = openFiles.find(f => f.path === activeFilePath)
    if (!file) return
    // Download file as a workaround until SFTP write is implemented
    const blob = new Blob([file.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
    // Mark as saved
    setOpenFiles(prev => prev.map(f => (f.path === activeFilePath ? { ...f, originalContent: f.content } : f)))
  }, [openFiles, activeFilePath])

  const handleEditorUndo = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'undo', null)
  }, [])

  const handleEditorRedo = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'redo', null)
  }, [])

  const handleEditorDownload = useCallback(() => {
    const file = openFiles.find(f => f.path === activeFilePath)
    if (!file) return
    const blob = new Blob([file.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }, [openFiles, activeFilePath])

  const handleEditorSearch = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'actions.find', null)
  }, [])

  // ── Key bindings ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleEditorSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleEditorSave])

  const isModified = useCallback((f: OpenFile) => f.content !== f.originalContent, [])

  return (
    <div className={S.root}>
      {/* ════ Left File Tree Panel ════ */}
      <div className={S.leftPanel} style={{ width: leftWidth, minWidth: 120 }}>
        <div className={`${S.leftHeader} justify-between`}>
          <div className="flex items-center gap-1 overflow-hidden">
            <HardDrive size={12} />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{serverName}</span>
          </div>
          <button
            type="button"
            title="刷新文件树"
            className="bg-transparent border-none cursor-pointer text-[#666] py-[2px] px-1 shrink-0 flex items-center"
            onClick={() => {
              // File tree refresh — SFTP support coming soon
              setExpanded(new Set())
              setSelectedPath(null)
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>

        <div className={S.treeWrap}>
          {openFiles.length === 0 && (
            <div className="py-4 px-2.5 text-center">
              <div className="text-[11px] text-[#555] leading-[1.6]">
                文件树暂不支持
                <br />
                <span className="text-[#444]">SFTP 功能开发中</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════ Left Resize Handle ════ */}
      <div
        className={S.resizeH}
        onMouseDown={startLeftResize}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLDivElement).style.background = '#444'
        }}
        onMouseLeave={e => {
          if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }}
      />

      {/* ════ Center Column ════ */}
      <div className={S.center} ref={centerRef}>
        {/* ── Editor Area ── */}
        <div
          className={S.editorArea}
          style={resolvedEditorHeight ? { height: resolvedEditorHeight } : { flex: '0 0 55%' }}
        >
          {/* Tab bar */}
          <div className={S.tabBar}>
            {openFiles.map(f => (
              <div
                key={f.path}
                className={S.tab}
                style={{
                  background: f.path === activeFilePath ? '#252526' : '#1e1e1e',
                  color: f.path === activeFilePath ? '#ddd' : '#888'
                }}
                onClick={() => setActiveFilePath(f.path)}
                title={f.path}
              >
                {getFileIcon(f.name)}
                <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[100px]">{f.name}</span>
                {isModified(f) && <span className="w-1.5 h-1.5 rounded-full bg-[#e8a838] shrink-0" />}
                <div
                  className={S.tabClose}
                  onClick={e => closeFile(f.path, e)}
                  onMouseEnter={e => {
                    ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.1)'
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  <X size={12} />
                </div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          {activeFile && (
            <div className={S.toolbar}>
              <button className={S.toolBtn} title="保存 (Ctrl+S)" onClick={handleEditorSave}>
                <Save size={14} />
              </button>
              <button className={S.toolBtn} title="撤销" onClick={handleEditorUndo}>
                <Undo2 size={14} />
              </button>
              <button className={S.toolBtn} title="重做" onClick={handleEditorRedo}>
                <Redo2 size={14} />
              </button>
              <div className="w-px h-3.5 bg-[#333] mx-1" />
              <button className={S.toolBtn} title="下载" onClick={handleEditorDownload}>
                <Download size={14} />
              </button>
              <button className={S.toolBtn} title="查找/替换" onClick={handleEditorSearch}>
                <Search size={14} />
              </button>
              <div className="flex-1" />
              <span className="text-[11px] text-[#555] mr-1">{activeFile.language}</span>
            </div>
          )}

          {/* Editor / Empty state */}
          {activeFile ? (
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                language={activeFile.language}
                value={activeFile.content}
                theme="vs-dark"
                onChange={handleEditorChange}
                onMount={editor => {
                  editorRef.current = editor
                }}
                options={{
                  fontSize: 13,
                  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderWhitespace: 'selection',
                  tabSize: 2,
                  wordWrap: 'off',
                  automaticLayout: true,
                  padding: { top: 8 },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  scrollbar: { verticalSliderSize: 6, horizontalSliderSize: 6 }
                }}
              />
            </div>
          ) : (
            <div className={S.editorEmpty}>
              <FileCode size={36} color="#444" />
              <span>双击左侧文件树中的文件以打开编辑</span>
            </div>
          )}
        </div>

        {/* ── Vertical Resize Handle ── */}
        <div
          className={S.resizeV}
          onMouseDown={startVerticalResize}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLDivElement).style.background = '#444'
          }}
          onMouseLeave={e => {
            if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
          }}
        />

        {/* ── Terminal Area ── */}
        <div className={S.termArea}>
          {/* Terminal tab bar */}
          <div className={S.termTabBar}>
            {termTabs.map(t => (
              <div
                key={t.id}
                className={S.termTab}
                style={{
                  background: t.id === activeTermId ? '#1a1a1a' : '#181818',
                  color: t.id === activeTermId ? '#ddd' : '#777'
                }}
                onClick={() => setActiveTermId(t.id)}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLDivElement).style.background = t.id === activeTermId ? '#1a1a1a' : '#1f1f1f'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLDivElement).style.background = t.id === activeTermId ? '#1a1a1a' : '#181818'
                }}
              >
                <span>{t.label}</span>
                <div
                  className={S.tabClose}
                  onClick={e => closeTerminal(t.id, e)}
                  onMouseEnter={e => {
                    ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.1)'
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  <X size={10} />
                </div>
              </div>
            ))}
            <div
              className={S.termAdd}
              onClick={addTerminal}
              title="新建终端"
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLDivElement).style.color = '#bbb'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLDivElement).style.color = '#777'
              }}
            >
              <Plus size={14} />
            </div>
          </div>

          {/* Terminal bodies */}
          <div className={S.termBody}>
            {termTabs.map(t => (
              <div key={t.id} className={`${S.termShell} ${t.id === activeTermId ? 'block' : 'hidden'}`}>
                <Suspense fallback={<div className={`${S.placeholder} bg-[#0d0d0d]`}>终端加载中…</div>}>
                  <WebShell target={serverId} />
                </Suspense>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════ Right Sliding Panel ════ */}
      <div
        className={`${S.rightSlide} ${rightPanel !== null ? 'border-l border-l-solid border-l-[#2a2a2a]' : 'border-l-0'}`}
        style={{ width: rightPanel !== null ? 280 : 0 }}
      >
        {rightPanel && (
          <>
            <div className={S.rightHeader}>
              <span>{rightPanelTitle}</span>
              <div className="cursor-pointer flex items-center" onClick={() => setRightPanel(null)}>
                <X size={14} color="#888" />
              </div>
            </div>
            <div className={S.rightContent}>{renderRightContent()}</div>
          </>
        )}
      </div>

      {/* ════ Right Icon Bar ════ */}
      <div className={S.rightBar}>
        {RIGHT_PANELS.map(p => (
          <button
            key={p.kind}
            className={S.rightBtn}
            style={{
              background: rightPanel === p.kind ? 'rgba(10,132,255,0.15)' : 'transparent',
              color: rightPanel === p.kind ? '#0A84FF' : '#888'
            }}
            onClick={() => setRightPanel(rightPanel === p.kind ? null : p.kind)}
            title={p.label}
            onMouseEnter={e => {
              if (rightPanel !== p.kind)
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
            }}
            onMouseLeave={e => {
              if (rightPanel !== p.kind) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            {p.icon}
            <span>{p.label.slice(0, 2)}</span>
          </button>
        ))}

        <div className="w-7 h-px bg-[#2a2a2a] my-1" />

        <button
          className={`${S.rightBtn} text-[#888]`}
          title="打开终端"
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          <Monitor size={18} />
          <span>终端</span>
        </button>

        <button
          className={`${S.rightBtn} text-[#888]`}
          title="终端设置"
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          <Settings size={18} />
          <span>设置</span>
        </button>
      </div>

      {/* ════ Context Menu ════ */}
      {contextMenu && (
        <div
          className={S.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.node.isDir && (
            <>
              <CtxMenuItem label="新建文件" onClick={() => setContextMenu(null)} />
              <CtxMenuItem label="新建文件夹" onClick={() => setContextMenu(null)} />
              <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
            </>
          )}
          <CtxMenuItem label="重命名" onClick={() => setContextMenu(null)} />
          <CtxMenuItem label="删除" onClick={() => setContextMenu(null)} danger />
          <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
          <CtxMenuItem label="下载" onClick={() => setContextMenu(null)} />
          <CtxMenuItem label="刷新" onClick={() => setContextMenu(null)} />
        </div>
      )}
    </div>
  )
}

// ─── Small sub-components ───────────────────────────────────────────────────

function CtxMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      className={`${S.ctxItem} ${danger ? 'text-[#FF453A]' : ''}`}
      onClick={onClick}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      {label}
    </div>
  )
}
