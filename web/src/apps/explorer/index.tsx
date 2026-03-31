import {
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  HardDrive,
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
  // local
  const [localPath, setLocalPath] = useState('')
  // sftp / ftp
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [basePath, setBasePath] = useState('/')
  // smb
  const [share, setShare] = useState('')
  // s3
  const [bucket, setBucket] = useState('')
  const [region, setRegion] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [endpoint, setEndpoint] = useState('')

  const [saving, setSaving] = useState(false)
  const fc = 'w-full text-xs px-2 py-1.5 rounded border-none outline-none'
  const fs = {
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '0.5px solid var(--vos-border-subtle)'
  }

  const buildRoot = (): string => {
    switch (kind) {
      case 'local':
        return localPath
      case 'sftp': {
        const p = port || '22'
        const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
        return `sftp://${auth}${host}:${p}${basePath || '/'}`
      }
      case 'ftp': {
        const p = port || '21'
        const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
        return `ftp://${auth}${host}:${p}${basePath || '/'}`
      }
      case 'smb': {
        const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
        return `smb://${auth}${host}/${share}`
      }
      case 's3': {
        const params = new URLSearchParams()
        if (region) params.set('region', region)
        if (endpoint) params.set('endpoint', endpoint)
        const qs = params.toString() ? `?${params.toString()}` : ''
        const auth = accessKey ? `${encodeURIComponent(accessKey)}:${encodeURIComponent(secretKey)}@` : ''
        return `s3://${auth}${bucket}${qs}`
      }
      default:
        return ''
    }
  }

  const isValid = (): boolean => {
    if (!name) return false
    switch (kind) {
      case 'local': return !!localPath
      case 'sftp':
      case 'ftp': return !!host
      case 'smb': return !!host && !!share
      case 's3': return !!bucket
      default: return false
    }
  }

  const submit = async () => {
    if (!isValid()) return
    setSaving(true)
    try {
      const body: CreateVfsMountReq = { name, kind, root: buildRoot() }
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
        style={{ width: 400, background: 'var(--vos-bg-surface)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
      >
        <div className="text-sm font-medium">添加数据源</div>
        <input className={fc} style={fs} placeholder="名称" value={name} onChange={e => setName(e.target.value)} />
        <select className={fc} style={fs} value={kind} onChange={e => setKind(e.target.value as VfsSourceKind)}>
          <option value="local">本地磁盘</option>
          <option value="sftp">SFTP</option>
          <option value="ftp">FTP</option>
          <option value="smb">SMB 共享</option>
          <option value="s3">S3 对象存储</option>
        </select>

        {/* ── Local disk ── */}
        {kind === 'local' && (
          <PathPickerInput
            mode="directory"
            value={localPath}
            onChange={setLocalPath}
            placeholder="选择目录"
            className={fc}
            style={fs}
          />
        )}

        {/* ── SFTP / FTP ── */}
        {(kind === 'sftp' || kind === 'ftp') && (
          <>
            <div className="flex gap-2">
              <input className={fc} style={{ ...fs, flex: 1 }} placeholder="主机地址" value={host} onChange={e => setHost(e.target.value)} />
              <input className={fc} style={{ ...fs, width: 72 }} placeholder={kind === 'sftp' ? '22' : '21'} value={port} onChange={e => setPort(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <input className={fc} style={{ ...fs, flex: 1 }} placeholder="用户名（可选）" value={username} onChange={e => setUsername(e.target.value)} />
              <input className={fc} style={{ ...fs, flex: 1 }} type="password" placeholder="密码（可选）" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <input className={fc} style={fs} placeholder="基础路径（如 /home/user）" value={basePath} onChange={e => setBasePath(e.target.value)} />
          </>
        )}

        {/* ── SMB ── */}
        {kind === 'smb' && (
          <>
            <input className={fc} style={fs} placeholder="主机地址" value={host} onChange={e => setHost(e.target.value)} />
            <input className={fc} style={fs} placeholder="共享名称（share name）" value={share} onChange={e => setShare(e.target.value)} />
            <div className="flex gap-2">
              <input className={fc} style={{ ...fs, flex: 1 }} placeholder="用户名（可选）" value={username} onChange={e => setUsername(e.target.value)} />
              <input className={fc} style={{ ...fs, flex: 1 }} type="password" placeholder="密码（可选）" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </>
        )}

        {/* ── S3 ── */}
        {kind === 's3' && (
          <>
            <input className={fc} style={fs} placeholder="Bucket 名称" value={bucket} onChange={e => setBucket(e.target.value)} />
            <div className="flex gap-2">
              <input className={fc} style={{ ...fs, flex: 1 }} placeholder="Region（如 us-east-1）" value={region} onChange={e => setRegion(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <input className={fc} style={{ ...fs, flex: 1 }} placeholder="Access Key" value={accessKey} onChange={e => setAccessKey(e.target.value)} />
              <input className={fc} style={{ ...fs, flex: 1 }} type="password" placeholder="Secret Key" value={secretKey} onChange={e => setSecretKey(e.target.value)} />
            </div>
            <input className={fc} style={fs} placeholder="自定义 Endpoint（可选，兼容 MinIO 等）" value={endpoint} onChange={e => setEndpoint(e.target.value)} />
          </>
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
            style={{ background: 'var(--vos-accent-primary)', color: '#fff', opacity: isValid() ? 1 : 0.5 }}
            onClick={submit}
            disabled={saving || !isValid()}
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
  onSelectFile,
  onMoveFile
}: {
  mountId: string
  columns: ColumnData[]
  onNavigate: (colIndex: number, entry: VfsNode) => void
  onSelectFile: (path: string) => void
  onMoveFile: (srcPath: string, destDir: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Auto scroll to the right when new columns are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [columns.length])

  const handleDragStart = (e: React.DragEvent, entry: VfsNode) => {
    e.dataTransfer.setData('application/x-vfs-path', entry.path)
    e.dataTransfer.setData('text/plain', entry.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, entry: VfsNode) => {
    if (!entry.is_dir) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(entry.path)
  }

  const handleDragLeave = () => {
    setDropTarget(null)
  }

  const handleDrop = (e: React.DragEvent, targetDir: VfsNode) => {
    e.preventDefault()
    setDropTarget(null)
    if (!targetDir.is_dir) return
    const srcPath = e.dataTransfer.getData('application/x-vfs-path')
    if (!srcPath || srcPath === targetDir.path) return
    // Don't allow dropping into self or parent
    if (targetDir.path.startsWith(srcPath + '/')) return
    onMoveFile(srcPath, targetDir.path)
  }

  // Allow dropping on column background (= its directory path)
  const handleColumnDrop = (e: React.DragEvent, colPath: string) => {
    e.preventDefault()
    setDropTarget(null)
    const srcPath = e.dataTransfer.getData('application/x-vfs-path')
    if (!srcPath) return
    // Don't move to same parent
    const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
    if (srcParent === colPath) return
    onMoveFile(srcPath, colPath)
  }

  return (
    <div ref={scrollRef} className="flex-1 flex overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: 'smooth' }}>
      {columns.map((col, colIdx) => (
        <div
          key={col.path}
          className="flex flex-col flex-shrink-0 overflow-hidden"
          style={{ width: 220, borderRight: '0.5px solid var(--vos-border-subtle)' }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={e => handleColumnDrop(e, col.path)}
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
                const isDragTarget = entry.is_dir && dropTarget === entry.path
                return (
                  <div
                    key={entry.name}
                    draggable
                    onDragStart={e => handleDragStart(e, entry)}
                    onDragOver={e => handleDragOver(e, entry)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, entry)}
                    className="flex items-center gap-1.5 px-2 py-[3px] text-xs cursor-pointer"
                    style={{
                      background: isDragTarget
                        ? 'var(--vos-accent-primary-hover, rgba(59,130,246,0.2))'
                        : isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--vos-text-primary)',
                      borderRadius: 3,
                      margin: '1px 4px',
                      outline: isDragTarget ? '1.5px dashed var(--vos-accent-primary)' : 'none'
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

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const CODE_EXTS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'json', 'yaml', 'yml', 'toml', 'rs', 'go', 'py',
  'sh', 'bash', 'zsh', 'css', 'html', 'xml', 'md', 'sql', 'env',
])

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function tryFormatJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

function FileInfoPanel({
  mountId,
  preview,
  node,
  onClose
}: {
  mountId: string
  preview: VfsFileContent | null
  node: VfsNode | null
  onClose: () => void
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!node || node.is_dir) return
    const ext = getFileExt(node.name)
    if (!IMAGE_EXTS.has(ext)) {
      setImgSrc(null)
      return
    }
    let url: string | null = null
    apiClient.readVfsFileRaw(mountId, node.path).then(blob => {
      url = URL.createObjectURL(blob)
      setImgSrc(url)
    }).catch(() => setImgSrc(null))
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [mountId, node])

  if (!node) return null

  const ext = getFileExt(node.name)
  const isImage = IMAGE_EXTS.has(ext)
  const isCode = CODE_EXTS.has(ext) || ext === 'json'
  const displayContent = preview && !node.is_dir && !preview.is_binary
    ? (ext === 'json' ? tryFormatJson(preview.content) : preview.content)
    : null

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
        className="px-3 py-2 text-xs flex flex-col gap-1 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
      >
        <div className="flex justify-between">
          <span style={{ color: 'var(--vos-text-tertiary)' }}>类型</span>
          <span>{node.is_dir ? '目录' : (ext ? ext.toUpperCase() : '文件')}</span>
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
        {preview?.truncated && (
          <div className="text-[10px]" style={{ color: 'var(--vos-accent-warning)' }}>仅预览前 1MB</div>
        )}
      </div>

      {/* Image preview */}
      {isImage && (
        <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={node.name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
            />
          ) : (
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
          )}
        </div>
      )}

      {/* Text / code preview */}
      {!isImage && preview && !node.is_dir && (
        <div className="flex-1 overflow-auto">
          {preview.is_binary ? (
            <div
              className="flex-1 flex items-center justify-center p-4 text-xs"
              style={{ color: 'var(--vos-text-tertiary)', fontStyle: 'italic' }}
            >
              二进制文件，无法预览
            </div>
          ) : (
            <pre
              className={`p-3 text-xs m-0 ${isCode ? 'font-mono' : ''}`}
              style={{
                color: 'var(--vos-text-primary)',
                background: 'transparent',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6
              }}
            >
              {displayContent}
            </pre>
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

  const handleMoveFile = async (srcPath: string, destDir: string) => {
    if (!selectedMount) return
    const fileName = srcPath.split('/').pop() || ''
    const dest = destDir === '/' ? `/${fileName}` : `${destDir}/${fileName}`
    try {
      await apiClient.moveVfsFile(selectedMount, srcPath, dest)
      // Refresh affected columns
      setColumns(prev =>
        prev.map(col => {
          const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
          if (col.path === srcParent || col.path === destDir) {
            // Mark for reload
            return { ...col, loading: true }
          }
          return col
        }),
      )
      // Reload entries for affected columns
      const updated = await Promise.all(
        columns.map(async col => {
          const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
          if (col.path === srcParent || col.path === destDir) {
            const entries = await loadColumn(selectedMount, col.path)
            return { ...col, entries, loading: false }
          }
          return col
        }),
      )
      setColumns(updated)
    } catch (e) {
      console.error('Move failed:', e)
    }
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
                  .map((seg, i) => (
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
                onClick={async () => {
                  if (!selectedMount || columns.length === 0) return
                  const lastCol = columns[columns.length - 1]
                  const entries = await loadColumn(selectedMount, lastCol.path)
                  setColumns(prev => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { ...updated[updated.length - 1], entries }
                    return updated
                  })
                }}
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
                onMoveFile={handleMoveFile}
              />

              {/* Info / preview panel */}
              {showInfo && (
                <FileInfoPanel
                  mountId={selectedMount}
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
