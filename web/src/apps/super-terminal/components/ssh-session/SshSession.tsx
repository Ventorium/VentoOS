import Editor from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
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

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    width: '100%',
    height: '100%',
    background: '#1a1a1a',
    color: '#ccc',
    fontFamily: 'inherit',
    overflow: 'hidden',
    fontSize: 13
  } as React.CSSProperties,

  // Left file tree panel
  leftPanel: (w: number) => ({
    width: w,
    minWidth: 120,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid #2a2a2a',
    background: '#181818',
    overflow: 'hidden'
  }),
  leftHeader: {
    height: 34,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 10px',
    borderBottom: '1px solid #2a2a2a',
    fontSize: 11,
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    flexShrink: 0
  } as React.CSSProperties,
  treeWrap: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0'
  } as React.CSSProperties,
  treeRow: (depth: number, active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    height: 24,
    gap: 4,
    paddingLeft: 8 + depth * 14,
    paddingRight: 8,
    cursor: 'pointer',
    userSelect: 'none' as const,
    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  }),
  treeLabel: {
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  } as React.CSSProperties,
  treePlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#666',
    fontSize: 12,
    textAlign: 'center' as const,
    padding: 16
  } as React.CSSProperties,

  // Resize handles
  resizeH: {
    width: 4,
    cursor: 'col-resize',
    flexShrink: 0,
    background: 'transparent',
    zIndex: 2
  } as React.CSSProperties,
  resizeV: {
    height: 4,
    cursor: 'row-resize',
    flexShrink: 0,
    background: 'transparent',
    zIndex: 2
  } as React.CSSProperties,

  // Center column
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    overflow: 'hidden'
  } as React.CSSProperties,

  // Editor area
  editorArea: (h: number) => ({
    height: h,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minHeight: 80
  }),
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    height: 32,
    background: '#1e1e1e',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
    overflow: 'hidden'
  } as React.CSSProperties,
  tab: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: '100%',
    padding: '0 6px 0 10px',
    cursor: 'pointer',
    fontSize: 12,
    flexShrink: 0,
    borderRight: '1px solid #2a2a2a',
    userSelect: 'none' as const,
    maxWidth: 160,
    background: active ? '#252526' : '#1e1e1e',
    color: active ? '#ddd' : '#888'
  }),
  tabClose: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: 4,
    flexShrink: 0,
    opacity: 0.5,
    cursor: 'pointer'
  } as React.CSSProperties,
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    height: 28,
    padding: '0 8px',
    background: '#1e1e1e',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0
  } as React.CSSProperties,
  toolBtn: (disabled: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 22,
    borderRadius: 4,
    cursor: disabled ? 'default' : 'pointer',
    border: 'none',
    background: 'transparent',
    color: disabled ? '#555' : '#aaa',
    opacity: disabled ? 0.4 : 1
  }),
  editorEmpty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    color: '#555',
    fontSize: 13
  } as React.CSSProperties,

  // Terminal area
  termArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minHeight: 80
  } as React.CSSProperties,
  termTabBar: {
    display: 'flex',
    alignItems: 'center',
    height: 30,
    background: '#181818',
    borderTop: '1px solid #2a2a2a',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
    gap: 0
  } as React.CSSProperties,
  termTab: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: '100%',
    padding: '0 6px 0 10px',
    cursor: 'pointer',
    fontSize: 12,
    borderRight: '1px solid #2a2a2a',
    flexShrink: 0,
    userSelect: 'none' as const,
    background: active ? '#1a1a1a' : '#181818',
    color: active ? '#ddd' : '#777'
  }),
  termAdd: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: '100%',
    cursor: 'pointer',
    color: '#777'
  } as React.CSSProperties,
  termBody: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden'
  } as React.CSSProperties,
  termShell: (visible: boolean) => ({
    position: 'absolute' as const,
    inset: 0,
    display: visible ? 'block' : 'none'
  }),

  // Right panel
  rightBar: {
    width: 48,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    padding: '8px 0',
    borderLeft: '1px solid #2a2a2a',
    background: '#181818'
  } as React.CSSProperties,
  rightBtn: (active: boolean) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 40,
    height: 44,
    borderRadius: 6,
    cursor: 'pointer',
    border: 'none',
    fontSize: 9,
    background: active ? 'rgba(10,132,255,0.15)' : 'transparent',
    color: active ? '#0A84FF' : '#888'
  }),
  rightSlide: (open: boolean) => ({
    width: open ? 280 : 0,
    overflow: 'hidden',
    flexShrink: 0,
    borderLeft: open ? '1px solid #2a2a2a' : 'none',
    background: '#1c1c1c',
    transition: 'width .2s ease',
    display: 'flex',
    flexDirection: 'column' as const
  }),
  rightHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34,
    padding: '0 12px',
    borderBottom: '1px solid #2a2a2a',
    fontSize: 12,
    fontWeight: 600,
    color: '#bbb',
    flexShrink: 0
  } as React.CSSProperties,
  rightContent: {
    flex: 1,
    padding: 12,
    overflow: 'auto',
    color: '#888',
    fontSize: 12
  } as React.CSSProperties,
  placeholder: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: '100%',
    color: '#555',
    fontSize: 12,
    textAlign: 'center' as const
  } as React.CSSProperties,
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #2a2a2a'
  } as React.CSSProperties,
  metricBar: (pct: number, color: string) => ({
    width: '100%',
    height: 4,
    borderRadius: 2,
    background: '#333',
    marginTop: 4,
    position: 'relative' as const,
    overflow: 'hidden',
    '::after': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: 0,
      height: '100%',
      width: `${pct}%`,
      background: color,
      borderRadius: 2
    }
  }),
  contextMenu: (x: number, y: number) => ({
    position: 'fixed' as const,
    left: x,
    top: y,
    zIndex: 9999,
    background: '#252526',
    border: '1px solid #3a3a3a',
    borderRadius: 6,
    padding: '4px 0',
    minWidth: 160,
    boxShadow: '0 8px 24px rgba(0,0,0,.4)'
  }),
  ctxItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 14px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#ccc'
  } as React.CSSProperties
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
      superTerminalApi.getServerMetrics(serverId).then(res => {
        if (res.success && res.data) setServerMetrics(res.data as Record<string, unknown>)
      }).catch(() => {})
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
            style={S.treeRow(depth, isActive)}
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
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                  transition: 'transform .15s',
                  flexShrink: 0
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
            <span style={S.treeLabel}>{node.name}</span>
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
          <div style={{ color: '#555', fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>
            SSH 远程指标采集开发中{'\n'}
            <span style={{ color: '#444' }}>将通过 SSH 执行系统命令采集</span>
          </div>
          {metrics.map(m => (
            <div key={m.label} style={S.metricRow}>
              <span style={{ color: '#aaa' }}>{m.label}</span>
              <span style={{ color: m.value !== '—' ? m.color : '#555' }}>{m.value}</span>
            </div>
          ))}
        </div>
      )
    }
    if (rightPanel === 'upload') {
      return (
        <div style={S.placeholder}>
          <Upload size={28} color="#555" />
          <span>暂无上传任务</span>
          <span style={{ fontSize: 11, color: '#444' }}>拖拽文件到文件树即可上传</span>
        </div>
      )
    }
    if (rightPanel === 'download') {
      return (
        <div style={S.placeholder}>
          <Download size={28} color="#555" />
          <span>暂无下载任务</span>
          <span style={{ fontSize: 11, color: '#444' }}>右键文件选择"下载"</span>
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
    setOpenFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, originalContent: f.content } : f))
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
    <div style={S.root}>
      {/* ════ Left File Tree Panel ════ */}
      <div style={S.leftPanel(leftWidth)}>
        <div style={{ ...S.leftHeader, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            <HardDrive size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{serverName}</span>
          </div>
          <button
            type="button"
            title="刷新文件树"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#666',
              padding: '2px 4px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center'
            }}
            onClick={() => {
              // File tree refresh — SFTP support coming soon
              setExpanded(new Set())
              setSelectedPath(null)
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>

        <div style={S.treeWrap}>
          {openFiles.length === 0 && (
            <div style={{ padding: '16px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>
                文件树暂不支持<br />
                <span style={{ color: '#444' }}>SFTP 功能开发中</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════ Left Resize Handle ════ */}
      <div
        style={S.resizeH}
        onMouseDown={startLeftResize}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLDivElement).style.background = '#444'
        }}
        onMouseLeave={e => {
          if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }}
      />

      {/* ════ Center Column ════ */}
      <div style={S.center} ref={centerRef}>
        {/* ── Editor Area ── */}
        <div
          style={
            resolvedEditorHeight
              ? S.editorArea(resolvedEditorHeight)
              : { flex: '0 0 55%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 80 }
          }
        >
          {/* Tab bar */}
          <div style={S.tabBar}>
            {openFiles.map(f => (
              <div
                key={f.path}
                style={S.tab(f.path === activeFilePath)}
                onClick={() => setActiveFilePath(f.path)}
                title={f.path}
              >
                {getFileIcon(f.name)}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                  {f.name}
                </span>
                {isModified(f) && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e8a838', flexShrink: 0 }} />
                )}
                <div
                  style={S.tabClose}
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
            <div style={S.toolbar}>
              <button style={S.toolBtn(false)} title="保存 (Ctrl+S)" onClick={handleEditorSave}>
                <Save size={14} />
              </button>
              <button style={S.toolBtn(false)} title="撤销" onClick={handleEditorUndo}>
                <Undo2 size={14} />
              </button>
              <button style={S.toolBtn(false)} title="重做" onClick={handleEditorRedo}>
                <Redo2 size={14} />
              </button>
              <div style={{ width: 1, height: 14, background: '#333', margin: '0 4px' }} />
              <button style={S.toolBtn(false)} title="下载" onClick={handleEditorDownload}>
                <Download size={14} />
              </button>
              <button style={S.toolBtn(false)} title="查找/替换" onClick={handleEditorSearch}>
                <Search size={14} />
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: '#555', marginRight: 4 }}>{activeFile.language}</span>
            </div>
          )}

          {/* Editor / Empty state */}
          {activeFile ? (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Editor
                height="100%"
                language={activeFile.language}
                value={activeFile.content}
                theme="vs-dark"
                onChange={handleEditorChange}
                onMount={editor => { editorRef.current = editor }}
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
            <div style={S.editorEmpty}>
              <FileCode size={36} color="#444" />
              <span>双击左侧文件树中的文件以打开编辑</span>
            </div>
          )}
        </div>

        {/* ── Vertical Resize Handle ── */}
        <div
          style={S.resizeV}
          onMouseDown={startVerticalResize}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLDivElement).style.background = '#444'
          }}
          onMouseLeave={e => {
            if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
          }}
        />

        {/* ── Terminal Area ── */}
        <div style={S.termArea}>
          {/* Terminal tab bar */}
          <div style={S.termTabBar}>
            {termTabs.map(t => (
              <div
                key={t.id}
                style={S.termTab(t.id === activeTermId)}
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
                  style={S.tabClose}
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
              style={S.termAdd}
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
          <div style={S.termBody}>
            {termTabs.map(t => (
              <div key={t.id} style={S.termShell(t.id === activeTermId)}>
                <Suspense fallback={<div style={{ ...S.placeholder, background: '#0d0d0d' }}>终端加载中…</div>}>
                  <WebShell target={serverId} />
                </Suspense>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════ Right Sliding Panel ════ */}
      <div style={S.rightSlide(rightPanel !== null)}>
        {rightPanel && (
          <>
            <div style={S.rightHeader}>
              <span>{rightPanelTitle}</span>
              <div
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => setRightPanel(null)}
              >
                <X size={14} color="#888" />
              </div>
            </div>
            <div style={S.rightContent}>{renderRightContent()}</div>
          </>
        )}
      </div>

      {/* ════ Right Icon Bar ════ */}
      <div style={S.rightBar}>
        {RIGHT_PANELS.map(p => (
          <button
            key={p.kind}
            style={S.rightBtn(rightPanel === p.kind)}
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

        <div style={{ width: 28, height: 1, background: '#2a2a2a', margin: '4px 0' }} />

        <button
          style={S.rightBtn(false)}
          onClick={addTerminal}
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
          style={S.rightBtn(false)}
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
        <div style={S.contextMenu(contextMenu.x, contextMenu.y)} onClick={e => e.stopPropagation()}>
          {contextMenu.node.isDir && (
            <>
              <CtxMenuItem label="新建文件" onClick={() => setContextMenu(null)} />
              <CtxMenuItem label="新建文件夹" onClick={() => setContextMenu(null)} />
              <div style={{ height: 1, background: '#3a3a3a', margin: '4px 8px' }} />
            </>
          )}
          <CtxMenuItem label="重命名" onClick={() => setContextMenu(null)} />
          <CtxMenuItem label="删除" onClick={() => setContextMenu(null)} danger />
          <div style={{ height: 1, background: '#3a3a3a', margin: '4px 8px' }} />
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
      style={{ ...S.ctxItem, color: danger ? '#FF453A' : '#ccc' }}
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
