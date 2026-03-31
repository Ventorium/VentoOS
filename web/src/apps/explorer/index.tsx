import {
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CreateVfsMountReq, VfsFileContent, VfsMount, VfsNode, VfsSourceKind } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { PathPickerInput } from '@/shell/FilePicker'

// ─── Mount form ────────────────────────────────────────────────────────────

function MountForm({ onClose, onCreated }: { onClose: () => void; onCreated: (m: VfsMount) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<VfsSourceKind>('local')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const fc = 'w-full text-xs px-2 py-1.5 rounded border-none outline-none'
  const fs = {
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '0.5px solid var(--vos-border-subtle)'
  }

  const submit = async () => {
    if (!name || !source) return
    setSaving(true)
    try {
      const body: CreateVfsMountReq = { name, kind, root: source }
      const res = await apiClient.createVfsMount(body)
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="rounded-lg p-4 flex flex-col gap-3"
        style={{ width: 380, background: 'var(--vos-bg-surface)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
      >
        <div className="text-sm font-medium">添加挂载源</div>
        <input className={fc} style={fs} placeholder="名称" value={name} onChange={e => setName(e.target.value)} />
        <select className={fc} style={fs} value={kind} onChange={e => setKind(e.target.value as VfsSourceKind)}>
          <option value="local">本地磁盘</option>
          <option value="sftp">SFTP</option>
          <option value="ftp">FTP</option>
          <option value="smb">SMB 共享</option>
          <option value="s3">S3 对象存储</option>
        </select>
        {kind === 'local' ? (
          <PathPickerInput
            mode="directory"
            value={source}
            onChange={setSource}
            placeholder="选择目录"
            className={fc}
            style={fs}
          />
        ) : (
          <input
            className={fc}
            style={fs}
            placeholder="连接地址"
            value={source}
            onChange={e => setSource(e.target.value)}
          />
        )}
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-text-primary)' }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
            onClick={submit}
            disabled={saving}
          >
            {saving ? '添加中…' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── File size formatter ───────────────────────────────────────────────────

function fmtSize(bytes?: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ─── Source kind icon/label mapping ────────────────────────────────────────

const kindMeta: Record<VfsSourceKind, { icon: typeof Monitor; label: string }> = {
  local: { icon: Monitor, label: '本机' },
  sftp: { icon: HardDrive, label: 'SFTP' },
  ftp: { icon: HardDrive, label: 'FTP' },
  smb: { icon: HardDrive, label: 'SMB' },
  s3: { icon: HardDrive, label: 'S3' }
}

// ─── Column item ───────────────────────────────────────────────────────────

interface ColumnData {
  path: string
  entries: VfsNode[]
  loading: boolean
  selected?: string // selected item name in this column
}

// ─── Column View Component ─────────────────────────────────────────────────

function ColumnView({
  mountId,
  columns,
  onNavigate,
  onSelectFile
}: {
  mountId: string
  columns: ColumnData[]
  onNavigate: (colIndex: number, entry: VfsNode) => void
  onSelectFile: (path: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto scroll to the right when new columns are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [columns.length])

  return (
    <div ref={scrollRef} className="flex-1 flex overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: 'smooth' }}>
      {columns.map((col, colIdx) => (
        <div
          key={col.path}
          className="flex flex-col flex-shrink-0 overflow-hidden"
          style={{ width: 220, borderRight: '0.5px solid var(--vos-border-subtle)' }}
        >
          {col.loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
            </div>
          ) : col.entries.length === 0 ? (
            <div
              className="flex-1 flex items-center justify-center text-xs"
              style={{ color: 'var(--vos-text-tertiary)' }}
            >
              空目录
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              {col.entries.map(entry => {
                const isSelected = col.selected === entry.name
                return (
                  <div
                    key={entry.name}
                    className="flex items-center gap-1.5 px-2 py-[3px] text-xs cursor-pointer"
                    style={{
                      background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--vos-text-primary)',
                      borderRadius: 3,
                      margin: '1px 4px'
                    }}
                    onClick={() => {
                      if (entry.is_dir) {
                        onNavigate(colIdx, entry)
                      } else {
                        onNavigate(colIdx, entry)
                        onSelectFile(entry.path)
                      }
                    }}
                  >
                    {entry.is_dir ? (
                      <Folder
                        size={13}
                        style={{ color: isSelected ? '#fff' : 'var(--vos-accent-warning)', flexShrink: 0 }}
                      />
                    ) : (
                      <File
                        size={13}
                        style={{ color: isSelected ? '#fff' : 'var(--vos-text-tertiary)', flexShrink: 0 }}
                      />
                    )}
                    <span className="flex-1 truncate">{entry.name}</span>
                    {entry.is_dir && <ChevronRight size={11} style={{ opacity: 0.5, flexShrink: 0 }} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── File Info Panel ───────────────────────────────────────────────────────

function FileInfoPanel({
  preview,
  node,
  onClose
}: {
  preview: VfsFileContent | null
  node: VfsNode | null
  onClose: () => void
}) {
  if (!node) return null

  return (
    <div
      className="flex flex-col overflow-hidden flex-shrink-0"
      style={{ width: 280, borderLeft: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
      >
        <span className="text-xs font-medium truncate">{node.name}</span>
        <button
          type="button"
          className="bg-transparent border-none cursor-pointer p-0"
          style={{ color: 'var(--vos-text-tertiary)' }}
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </div>

      {/* File metadata */}
      <div
        className="px-3 py-2 text-xs flex flex-col gap-1"
        style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
      >
        <div className="flex justify-between">
          <span style={{ color: 'var(--vos-text-tertiary)' }}>类型</span>
          <span>{node.is_dir ? '目录' : '文件'}</span>
        </div>
        {!node.is_dir && node.size != null && (
          <div className="flex justify-between">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>大小</span>
            <span>{fmtSize(node.size)}</span>
          </div>
        )}
        {node.modified && (
          <div className="flex justify-between">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>修改时间</span>
            <span>{new Date(node.modified).toLocaleString()}</span>
          </div>
        )}
        {node.path && (
          <div className="flex justify-between">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>路径</span>
            <span className="truncate ml-2 text-right" style={{ maxWidth: 160 }}>
              {node.path}
            </span>
          </div>
        )}
      </div>

      {/* File preview content */}
      {preview && !node.is_dir && (
        <div
          className="flex-1 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap"
          style={{ color: 'var(--vos-text-primary)' }}
        >
          {preview.is_binary ? (
            <span style={{ color: 'var(--vos-text-tertiary)', fontStyle: 'italic' }}>二进制文件，无法预览</span>
          ) : (
            preview.content
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function ExplorerApp(_props: AppComponentProps) {
  const [mounts, setMounts] = useState<VfsMount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selectedMount, setSelectedMount] = useState<string | null>(null)
  const [columns, setColumns] = useState<ColumnData[]>([])
  const [preview, setPreview] = useState<VfsFileContent | null>(null)
  const [selectedNode, setSelectedNode] = useState<VfsNode | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  const reload = useCallback(async () => {
    try {
      const r = await apiClient.getVfsMounts()
      let mountList = r.data
      // Auto-create "本机" mount at / if no local mounts exist
      if (!mountList.some(m => m.kind === 'local' && m.root === '/')) {
        try {
          const res = await apiClient.createVfsMount({ name: '本机', kind: 'local', root: '/' })
          mountList = [...mountList, res.data]
        } catch (_e) {
          /* ignore if creation fails */
        }
      }
      setMounts(mountList)
      // Auto-select first mount if nothing selected
      if (!selectedMount && mountList.length > 0) {
        selectMount(mountList[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const loadColumn = async (mountId: string, path: string): Promise<VfsNode[]> => {
    try {
      const r = await apiClient.listVfsDir(mountId, path)
      return r.data
    } catch (e) {
      console.error(e)
      return []
    }
  }

  const selectMount = async (id: string) => {
    setSelectedMount(id)
    setPreview(null)
    setSelectedNode(null)
    setShowInfo(false)
    // Load root column
    setColumns([{ path: '/', entries: [], loading: true }])
    const entries = await loadColumn(id, '/')
    setColumns([{ path: '/', entries, loading: false }])
  }

  const handleNavigate = async (colIndex: number, entry: VfsNode) => {
    if (!selectedMount) return

    // Update selected item in this column
    setColumns(prev => {
      const updated = prev.slice(0, colIndex + 1)
      updated[colIndex] = { ...updated[colIndex], selected: entry.name }
      return updated
    })

    if (entry.is_dir) {
      // Load new column for subdirectory
      const newPath = entry.path
      setColumns(prev => {
        const updated = prev.slice(0, colIndex + 1)
        updated[colIndex] = { ...updated[colIndex], selected: entry.name }
        return [...updated, { path: newPath, entries: [], loading: true }]
      })
      const entries = await loadColumn(selectedMount, newPath)
      setColumns(prev => {
        const updated = [...prev]
        const targetIdx = colIndex + 1
        if (targetIdx < updated.length) {
          updated[targetIdx] = { path: newPath, entries, loading: false }
        }
        return updated
      })
      setSelectedNode(entry)
      setPreview(null)
    } else {
      // File selected — show info panel
      setSelectedNode(entry)
      setShowInfo(true)
      // Load file preview
      try {
        const r = await apiClient.readVfsFile(selectedMount, entry.path)
        setPreview(r.data)
      } catch (e) {
        console.error(e)
      }
    }
  }

  const deleteMount = async (id: string) => {
    await apiClient.deleteVfsMount(id)
    if (selectedMount === id) {
      setSelectedMount(null)
      setColumns([])
      setPreview(null)
      setSelectedNode(null)
    }
    reload()
  }

  // Build current path from columns
  const currentPath = columns.length > 0 ? columns[columns.length - 1].path : '/'

  return (
    <div className="flex h-full relative">
      {showForm && (
        <MountForm
          onClose={() => setShowForm(false)}
          onCreated={m => {
            setMounts(p => [...p, m])
            setShowForm(false)
          }}
        />
      )}

      {/* Sidebar — mount sources */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{ width: 180, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--vos-text-tertiary)' }}>
            存储源
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={reload}
            >
              <RefreshCw size={11} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-accent-primary)' }}
              onClick={() => setShowForm(true)}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        {mounts.map(m => {
          const KindIcon = kindMeta[m.kind]?.icon ?? HardDrive
          const isActive = selectedMount === m.id
          return (
            <div
              key={m.id}
              className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group"
              style={{
                background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--vos-text-primary)',
                borderRadius: 4,
                margin: '1px 4px'
              }}
              onClick={() => selectMount(m.id)}
            >
              <KindIcon size={13} style={{ color: isActive ? '#fff' : 'var(--vos-text-tertiary)', flexShrink: 0 }} />
              <span className="flex-1 truncate">{m.name}</span>
              <button
                type="button"
                className="hidden group-hover:block bg-transparent border-none p-0 cursor-pointer text-inherit"
                onClick={e => {
                  e.stopPropagation()
                  deleteMount(m.id)
                }}
              >
                <Trash2 size={10} />
              </button>
            </div>
          )
        })}
        {mounts.length === 0 && (
          <div
            className="flex-1 flex items-center justify-center text-xs"
            style={{ color: 'var(--vos-text-tertiary)' }}
          >
            无存储源
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedMount ? (
          <>
            {/* Path bar */}
            <div
              className="flex items-center gap-2 h-8 px-3 flex-shrink-0"
              style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
            >
              <button
                type="button"
                className="bg-transparent border-none cursor-pointer p-0"
                style={{ color: columns.length > 1 ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)' }}
                disabled={columns.length <= 1}
                onClick={() => {
                  if (columns.length > 1) {
                    setColumns(prev => {
                      const updated = prev.slice(0, -1)
                      if (updated.length > 0) {
                        updated[updated.length - 1] = { ...updated[updated.length - 1], selected: undefined }
                      }
                      return updated
                    })
                    setPreview(null)
                    setSelectedNode(null)
                    setShowInfo(false)
                  }
                }}
              >
                <ChevronLeft size={14} />
              </button>
              {/* Breadcrumb path */}
              <div
                className="flex-1 flex items-center gap-0.5 overflow-hidden text-xs"
                style={{ color: 'var(--vos-text-secondary)' }}
              >
                {currentPath
                  .split('/')
                  .filter(Boolean)
                  .map((seg, i, arr) => (
                    <span key={i} className="flex items-center gap-0.5 truncate">
                      {i > 0 && <ChevronRight size={10} style={{ opacity: 0.4, flexShrink: 0 }} />}
                      <span className="truncate">{seg}</span>
                    </span>
                  ))}
                {currentPath === '/' && <span>/</span>}
              </div>
              <button
                type="button"
                className="bg-transparent border-none cursor-pointer p-0"
                style={{ color: 'var(--vos-accent-primary)' }}
                onClick={() => selectedMount && selectMount(selectedMount)}
              >
                <RefreshCw size={12} />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Column view */}
              <ColumnView
                mountId={selectedMount}
                columns={columns}
                onNavigate={handleNavigate}
                onSelectFile={() => setShowInfo(true)}
              />

              {/* Info / preview panel */}
              {showInfo && (
                <FileInfoPanel
                  preview={preview}
                  node={selectedNode}
                  onClose={() => {
                    setShowInfo(false)
                    setPreview(null)
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FolderOpen size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                资源管理器
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                选择左侧存储源浏览文件
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
