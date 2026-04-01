import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  File,
  FilePlus,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Settings,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CreateVfsMountReq, VfsFileContent, VfsMount, VfsNode, VfsSourceKind } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { openWindow } from '@/kernel'
import { taskService } from '@/services/task'
import { useVfsClipboardStore } from '@/services/vfs'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { PathPickerInput } from '@/shell/FilePicker'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

// ─── Mount form ────────────────────────────────────────────────────────────

function parseMountFields(mount: { kind: VfsSourceKind; root: string }) {
  const result = {
    localPath: '',
    host: '',
    port: '',
    username: '',
    password: '',
    basePath: '/',
    share: '',
    bucket: '',
    region: '',
    accessKey: '',
    secretKey: '',
    endpoint: ''
  }
  try {
    if (mount.kind === 'local') {
      result.localPath = mount.root
    } else if (mount.kind === 'sftp' || mount.kind === 'ftp') {
      const url = new URL(mount.root)
      result.host = url.hostname
      result.port = url.port
      result.username = decodeURIComponent(url.username)
      result.password = decodeURIComponent(url.password)
      result.basePath = url.pathname || '/'
    } else if (mount.kind === 'smb') {
      const url = new URL(mount.root)
      result.host = url.hostname
      result.username = decodeURIComponent(url.username)
      result.password = decodeURIComponent(url.password)
      // pathname is /shareName or /
      result.share = url.pathname.replace(/^\//, '')
    } else if (mount.kind === 's3') {
      const url = new URL(mount.root)
      result.bucket = url.hostname
      result.accessKey = decodeURIComponent(url.username)
      result.secretKey = decodeURIComponent(url.password)
      result.region = url.searchParams.get('region') ?? ''
      result.endpoint = url.searchParams.get('endpoint') ?? ''
    }
  } catch { /* ignore parse errors */ }
  return result
}

function MountForm({
  onClose,
  onCreated,
  onUpdated,
  mountToEdit
}: {
  onClose: () => void
  onCreated?: (m: VfsMount) => void
  onUpdated?: (m: VfsMount) => void
  mountToEdit?: VfsMount
}) {
  const isEditing = !!mountToEdit
  const initial = mountToEdit ? parseMountFields(mountToEdit) : null

  const [name, setName] = useState(mountToEdit?.name ?? '')
  const [kind, setKind] = useState<VfsSourceKind>(mountToEdit?.kind ?? 'local')
  // local
  const [localPath, setLocalPath] = useState(initial?.localPath ?? '')
  // sftp / ftp
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(initial?.port ?? '')
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState(initial?.password ?? '')
  const [basePath, setBasePath] = useState(initial?.basePath ?? '/')
  // smb
  const [share, setShare] = useState(initial?.share ?? '')
  // s3
  const [bucket, setBucket] = useState(initial?.bucket ?? '')
  const [region, setRegion] = useState(initial?.region ?? '')
  const [accessKey, setAccessKey] = useState(initial?.accessKey ?? '')
  const [secretKey, setSecretKey] = useState(initial?.secretKey ?? '')
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? '')

  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

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
        return `smb://${auth}${host}${share ? `/${share}` : ''}`
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
      case 'local':
        return !!localPath
      case 'sftp':
      case 'ftp':
        return !!host
      case 'smb':
        return !!host
      case 's3':
        return !!bucket
      default:
        return false
    }
  }

  const handleTest = async () => {
    if (!isValid()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiClient.testVfsMountConnection({ name: name || 'test', kind, root: buildRoot() })
      setTestResult(res.data)
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const submit = async () => {
    if (!isValid()) return
    setSaving(true)
    try {
      const body: CreateVfsMountReq = { name, kind, root: buildRoot() }
      if (isEditing && mountToEdit) {
        const res = await apiClient.updateVfsMount(mountToEdit.id, body)
        onUpdated?.(res.data)
      } else {
        const res = await apiClient.createVfsMount(body)
        onCreated?.(res.data)
      }
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
        <div className="text-sm font-medium">{isEditing ? '编辑数据源' : '添加数据源'}</div>
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
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                placeholder="主机地址"
                value={host}
                onChange={e => setHost(e.target.value)}
              />
              <input
                className={fc}
                style={{ ...fs, width: 72 }}
                placeholder={kind === 'sftp' ? '22' : '21'}
                value={port}
                onChange={e => setPort(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                placeholder="用户名（可选）"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                type="password"
                placeholder="密码（可选）"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <input
              className={fc}
              style={fs}
              placeholder="基础路径（如 /home/user）"
              value={basePath}
              onChange={e => setBasePath(e.target.value)}
            />
          </>
        )}

        {/* ── SMB ── */}
        {kind === 'smb' && (
          <>
            <input
              className={fc}
              style={fs}
              placeholder="主机地址"
              value={host}
              onChange={e => setHost(e.target.value)}
            />
            <input
              className={fc}
              style={fs}
              placeholder="共享名称（可选，留空则列出所有共享）"
              value={share}
              onChange={e => setShare(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                placeholder="用户名（可选）"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                type="password"
                placeholder="密码（可选）"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </>
        )}

        {/* ── S3 ── */}
        {kind === 's3' && (
          <>
            <input
              className={fc}
              style={fs}
              placeholder="Bucket 名称"
              value={bucket}
              onChange={e => setBucket(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                placeholder="Region（如 us-east-1）"
                value={region}
                onChange={e => setRegion(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                placeholder="Access Key"
                value={accessKey}
                onChange={e => setAccessKey(e.target.value)}
              />
              <input
                className={fc}
                style={{ ...fs, flex: 1 }}
                type="password"
                placeholder="Secret Key"
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
              />
            </div>
            <input
              className={fc}
              style={fs}
              placeholder="自定义 Endpoint（可选，兼容 MinIO 等）"
              value={endpoint}
              onChange={e => setEndpoint(e.target.value)}
            />
          </>
        )}

        <div className="flex justify-between items-center gap-2 mt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
              style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-text-primary)', opacity: isValid() ? 1 : 0.5 }}
              onClick={handleTest}
              disabled={testing || !isValid()}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult && (
              <span className="text-xs" style={{ color: testResult.success ? 'var(--vos-accent-success)' : 'var(--vos-accent-danger)' }}>
                {testResult.message}
              </span>
            )}
          </div>
          <div className="flex gap-2">
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
              {saving ? (isEditing ? '保存中…' : '添加中…') : (isEditing ? '保存' : '添加')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  confirmLabel = '删除',
  danger = true,
  onConfirm,
  onCancel
}: {
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-lg p-4 flex flex-col gap-4"
        style={{ width: 320, background: 'var(--vos-bg-surface)', boxShadow: '0 8px 32px rgba(0,0,0,.35)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-sm leading-relaxed" style={{ color: 'var(--vos-text-primary)' }}>
          {message}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-text-primary)' }}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{
              background: danger ? 'var(--vos-accent-danger)' : 'var(--vos-accent-primary)',
              color: '#fff'
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
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
  multiSelect,
  activeColumn,
  renamingPath,
  renameValue,
  onMoveFile,
  onExternalFileDrop,
  onItemClick,
  onItemDoubleClick,
  onItemContextMenu,
  onColumnContextMenu,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel
}: {
  mountId: string
  columns: ColumnData[]
  multiSelect: Map<number, Set<string>>
  activeColumn: number
  renamingPath: string | null
  renameValue: string
  onMoveFile: (srcPath: string, destDir: string, srcMountId?: string) => void
  onExternalFileDrop: (files: FileList, targetPath: string) => void
  onItemClick: (colIndex: number, entry: VfsNode, e: React.MouseEvent) => void
  onItemDoubleClick: (colIndex: number, entry: VfsNode) => void
  onItemContextMenu: (colIndex: number, entry: VfsNode, e: React.MouseEvent) => void
  onColumnContextMenu: (colIndex: number, path: string, e: React.MouseEvent) => void
  onRenameChange: (val: string) => void
  onRenameConfirm: () => void
  onRenameCancel: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Auto scroll to the right when new columns are added
  // biome-ignore lint/correctness/useExhaustiveDependencies: columns.length triggers scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [columns.length])

  const handleDragStart = (e: React.DragEvent, entry: VfsNode) => {
    e.dataTransfer.setData('application/x-vfs-path', entry.path)
    e.dataTransfer.setData('application/x-vfs-mount-id', mountId)
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
    // External files from OS
    if (e.dataTransfer.files.length > 0) {
      onExternalFileDrop(e.dataTransfer.files, targetDir.path)
      return
    }
    const srcPath = e.dataTransfer.getData('application/x-vfs-path')
    const srcMountId = e.dataTransfer.getData('application/x-vfs-mount-id') || undefined
    if (!srcPath || srcPath === targetDir.path) return
    if (targetDir.path.startsWith(`${srcPath}/`)) return
    onMoveFile(srcPath, targetDir.path, srcMountId)
  }

  const handleColumnDrop = (e: React.DragEvent, colPath: string) => {
    e.preventDefault()
    setDropTarget(null)
    // External files from OS
    if (e.dataTransfer.files.length > 0) {
      onExternalFileDrop(e.dataTransfer.files, colPath)
      return
    }
    const srcPath = e.dataTransfer.getData('application/x-vfs-path')
    const srcMountId = e.dataTransfer.getData('application/x-vfs-mount-id') || undefined
    if (!srcPath) return
    const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
    if (srcParent === colPath && srcMountId === mountId) return
    onMoveFile(srcPath, colPath, srcMountId)
  }

  return (
    <div ref={scrollRef} className="flex-1 flex overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: 'smooth' }}>
      {columns.map((col, colIdx) => {
        const colSelected = multiSelect.get(colIdx)
        return (
          <div
            key={col.path}
            role="listbox"
            className="flex flex-col flex-shrink-0 overflow-hidden"
            style={{
              width: 220,
              borderRight: '0.5px solid var(--vos-border-subtle)',
              outline: colIdx === activeColumn ? '1px solid var(--vos-accent-primary)' : 'none',
              outlineOffset: -1
            }}
            onDragOver={e => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={e => handleColumnDrop(e, col.path)}
            onContextMenu={e => {
              // Only fire for empty area (not when right-clicking on an item)
              if ((e.target as HTMLElement).closest('[data-vfs-entry]')) return
              onColumnContextMenu(colIdx, col.path, e)
            }}
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
                  const isPrimary = col.selected === entry.name
                  const isMulti = colSelected?.has(entry.name) ?? false
                  const isHighlighted = isPrimary || isMulti
                  const isDragTarget = entry.is_dir && dropTarget === entry.path
                  const isRenaming = renamingPath === entry.path
                  return (
                    <div
                      key={entry.name}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isHighlighted}
                      data-vfs-entry={entry.name}
                      draggable={!isRenaming}
                      onDragStart={e => handleDragStart(e, entry)}
                      onDragOver={e => handleDragOver(e, entry)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, entry)}
                      className="flex items-center gap-1.5 px-2 py-[3px] text-xs cursor-pointer"
                      style={{
                        background: isDragTarget
                          ? 'var(--vos-accent-primary-hover, rgba(59,130,246,0.2))'
                          : isHighlighted
                            ? 'var(--vos-accent-primary)'
                            : 'transparent',
                        color: isHighlighted ? '#fff' : 'var(--vos-text-primary)',
                        borderRadius: 3,
                        margin: '1px 4px',
                        outline: isDragTarget ? '1.5px dashed var(--vos-accent-primary)' : 'none'
                      }}
                      onClick={e => onItemClick(colIdx, entry, e)}
                      onDoubleClick={() => onItemDoubleClick(colIdx, entry)}
                      onContextMenu={e => onItemContextMenu(colIdx, entry, e)}
                    >
                      {entry.is_dir ? (
                        <Folder
                          size={13}
                          style={{ color: isHighlighted ? '#fff' : 'var(--vos-accent-warning)', flexShrink: 0 }}
                        />
                      ) : (
                        <File
                          size={13}
                          style={{ color: isHighlighted ? '#fff' : 'var(--vos-text-tertiary)', flexShrink: 0 }}
                        />
                      )}
                      {isRenaming ? (
                        <input
                          ref={el => {
                            if (el) {
                              const dot = renameValue.lastIndexOf('.')
                              if (dot > 0) {
                                el.setSelectionRange(0, dot)
                              } else {
                                el.select()
                              }
                            }
                          }}
                          autoFocus
                          className="flex-1 text-xs px-1 py-0 rounded border-none outline-none"
                          style={{
                            background: '#fff',
                            color: '#000',
                            minWidth: 0
                          }}
                          value={renameValue}
                          onChange={e => onRenameChange(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') onRenameConfirm()
                            if (e.key === 'Escape') onRenameCancel()
                            e.stopPropagation()
                          }}
                          onBlur={onRenameCancel}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate">{entry.name}</span>
                      )}
                      {entry.is_dir && !isRenaming && (
                        <ChevronRight size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── File Info Panel ───────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const CODE_EXTS = new Set([
  'js',
  'ts',
  'jsx',
  'tsx',
  'json',
  'yaml',
  'yml',
  'toml',
  'rs',
  'go',
  'py',
  'sh',
  'bash',
  'zsh',
  'css',
  'html',
  'xml',
  'md',
  'sql',
  'env'
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
    apiClient
      .readVfsFileRaw(mountId, node.path)
      .then(blob => {
        url = URL.createObjectURL(blob)
        setImgSrc(url)
      })
      .catch(() => setImgSrc(null))
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [mountId, node])

  if (!node) return null

  const ext = getFileExt(node.name)
  const isImage = IMAGE_EXTS.has(ext)
  const isCode = CODE_EXTS.has(ext) || ext === 'json'
  const displayContent =
    preview && !node.is_dir && !preview.is_binary
      ? ext === 'json'
        ? tryFormatJson(preview.content)
        : preview.content
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
          <span>{node.is_dir ? '目录' : ext ? ext.toUpperCase() : '文件'}</span>
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
          <div className="text-[10px]" style={{ color: 'var(--vos-accent-warning)' }}>
            仅预览前 1MB
          </div>
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

// ─── File viewer modal ────────────────────────────────────────────────────

const PDF_EXTS = new Set(['pdf'])
const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'log',
  'csv',
  'tsv',
  'ini',
  'env',
  'conf',
  'cfg',
  'toml',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'css',
  'less',
  'scss',
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'jsonc',
  'rs',
  'py',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'rb',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'sql',
  'graphql',
  'proto',
  'diff',
  'patch',
  'gitignore',
  'dockerfile',
  'makefile',
  'license',
  'readme'
])

function isTextFile(name: string): boolean {
  const ext = getFileExt(name)
  if (TEXT_EXTS.has(ext)) return true
  // No extension — treat as text (like Makefile, Dockerfile)
  if (!ext || ext === name.toLowerCase()) return true
  return false
}

function FileViewerModal({ mountId, node, onClose }: { mountId: string; node: VfsNode; onClose: () => void }) {
  const [content, setContent] = useState<VfsFileContent | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const ext = getFileExt(node.name)
  const isImage = IMAGE_EXTS.has(ext)
  const isPdf = PDF_EXTS.has(ext)
  const isText = isTextFile(node.name)
  const isCode = CODE_EXTS.has(ext) || ext === 'json' || ext === 'yaml' || ext === 'yml'

  // biome-ignore lint/correctness/useExhaustiveDependencies: node.path+mountId are the real deps
  useEffect(() => {
    setLoading(true)
    setError(null)
    setContent(null)
    setBlobUrl(null)
    setEditing(false)
    let revoke: string | null = null

    if (isImage || isPdf) {
      apiClient
        .readVfsFileRaw(mountId, node.path)
        .then(blob => {
          const url = URL.createObjectURL(blob)
          revoke = url
          setBlobUrl(url)
        })
        .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
        .finally(() => setLoading(false))
    } else {
      apiClient
        .readVfsFile(mountId, node.path, 4 * 1024 * 1024)
        .then(r => {
          setContent(r.data)
          setEditContent(r.data.content)
        })
        .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
        .finally(() => setLoading(false))
    }
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [mountId, node.path])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiClient.writeVfsFile(mountId, node.path, editContent)
      setEditing(false)
      setContent(prev => (prev ? { ...prev, content: editContent } : prev))
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  // Keyboard: Escape closes, Ctrl/Cmd+S saves
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSave is stable within the effect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && editing) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing, editContent, onClose])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click to close
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: modal panel */}
      <div
        className="flex flex-col overflow-hidden rounded-lg"
        style={{
          width: '82%',
          height: '82%',
          background: 'var(--vos-bg-surface)',
          boxShadow: '0 24px 80px rgba(0,0,0,.6)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div
          className="flex items-center px-3 py-2 gap-2 flex-shrink-0"
          style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
        >
          <File size={13} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />
          <span className="text-xs font-medium flex-1 truncate">{node.name}</span>
          {!node.is_dir &&
            isText &&
            content &&
            !content.is_binary &&
            (editing ? (
              <>
                <button
                  type="button"
                  className="vos-btn vos-btn-primary"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  type="button"
                  className="vos-btn"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => {
                    setEditing(false)
                    setEditContent(content.content)
                  }}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                className="vos-btn"
                style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setEditing(true)}
              >
                <Pencil size={11} />
                编辑
              </button>
            ))}
          <button type="button" className="vos-btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={onClose}>
            <X size={12} />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
            </div>
          )}

          {!loading && error && (
            <div className="p-6 text-xs" style={{ color: 'var(--vos-accent-danger)' }}>
              加载失败：{error}
            </div>
          )}

          {!loading && !error && isImage && blobUrl && (
            <div className="flex items-center justify-center w-full h-full p-4 overflow-auto">
              <img
                src={blobUrl}
                alt={node.name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
              />
            </div>
          )}

          {!loading && !error && isPdf && blobUrl && (
            <embed
              src={`${blobUrl}#toolbar=1&navpanes=0`}
              type="application/pdf"
              style={{ width: '100%', height: '100%' }}
            />
          )}

          {!loading && !error && content?.is_binary && (
            <div className="p-6 text-xs font-mono" style={{ color: 'var(--vos-text-tertiary)' }}>
              <div className="mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
                二进制文件
              </div>
              <div>大小：{fmtSize(content.size)}</div>
              <div>类型：{ext?.toUpperCase() ?? '未知'}</div>
            </div>
          )}

          {!loading &&
            !error &&
            content &&
            !content.is_binary &&
            (editing ? (
              <textarea
                autoFocus
                className="w-full h-full p-3 text-xs resize-none border-none outline-none"
                style={{
                  background: 'var(--vos-bg-editor, var(--vos-bg-base))',
                  color: 'var(--vos-text-primary)',
                  fontFamily: isCode ? 'var(--vos-font-mono, monospace)' : 'inherit',
                  lineHeight: 1.7,
                  tabSize: 2
                }}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <div className="w-full h-full overflow-auto">
                {content.truncated && (
                  <div
                    className="px-3 py-1 text-[11px] flex-shrink-0"
                    style={{
                      background: 'var(--vos-accent-warning-subtle, rgba(234,179,8,0.1))',
                      color: 'var(--vos-accent-warning, #ca8a04)',
                      borderBottom: '0.5px solid var(--vos-border-subtle)'
                    }}
                  >
                    文件过大，仅预览前 4MB
                  </div>
                )}
                <pre
                  className="p-3 text-xs m-0 whitespace-pre-wrap break-words"
                  style={{
                    color: 'var(--vos-text-primary)',
                    background: 'transparent',
                    fontFamily: isCode ? 'var(--vos-font-mono, monospace)' : 'inherit',
                    lineHeight: 1.7
                  }}
                >
                  {content.content}
                </pre>
              </div>
            ))}
        </div>

        {/* Footer: file info */}
        {content && (
          <div
            className="flex items-center gap-4 px-3 py-1.5 text-[11px] flex-shrink-0"
            style={{
              borderTop: '0.5px solid var(--vos-border-subtle)',
              color: 'var(--vos-text-tertiary)'
            }}
          >
            <span>{fmtSize(content.size)}</span>
            {node.modified && <span>{new Date(node.modified).toLocaleString()}</span>}
            {node.permissions && <span>{node.permissions}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function ExplorerApp(_props: AppComponentProps) {
  const [mounts, setMounts] = useState<VfsMount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingMount, setEditingMount] = useState<VfsMount | null>(null)
  const [selectedMount, setSelectedMount] = useState<string | null>(null)
  const [columns, setColumns] = useState<ColumnData[]>([])
  const [preview, setPreview] = useState<VfsFileContent | null>(null)
  const [selectedNode, setSelectedNode] = useState<VfsNode | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  // Multi-select: colIdx -> Set of item names
  const [multiSelect, setMultiSelect] = useState<Map<number, Set<string>>>(new Map())
  const [activeColumn, setActiveColumn] = useState(0)
  const [selectAnchor, setSelectAnchor] = useState<{ col: number; name: string } | null>(null)

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // New folder overlay
  const [newFolderState, setNewFolderState] = useState<{ visible: boolean; colPath: string; name: string }>({
    visible: false,
    colPath: '',
    name: ''
  })

  // New file overlay
  const [newFileState, setNewFileState] = useState<{ visible: boolean; dirPath: string; name: string }>({
    visible: false,
    dirPath: '',
    name: ''
  })

  // Confirm dialog
  const [confirmState, setConfirmState] = useState<{
    visible: boolean
    message: string
    onConfirm: () => void
  }>({ visible: false, message: '', onConfirm: () => {} })

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string>('/')

  // Container ref for keyboard events
  const containerRef = useRef<HTMLDivElement>(null)

  // Clipboard store
  const clipboard = useVfsClipboardStore(s => s.clipboard)
  const setClipboard = useVfsClipboardStore(s => s.setClipboard)
  const clearClipboard = useVfsClipboardStore(s => s.clearClipboard)

  // Context menu
  const showContextMenu = useContextMenuStore(s => s.show)

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-once
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadColumn is stable
  const refreshColumn = useCallback(
    async (colIdx: number) => {
      if (!selectedMount || colIdx < 0 || colIdx >= columns.length) return
      const col = columns[colIdx]
      const entries = await loadColumn(selectedMount, col.path)
      setColumns(prev => {
        const updated = [...prev]
        if (colIdx < updated.length) {
          updated[colIdx] = { ...prev[colIdx], entries, loading: false }
        }
        return updated
      })
    },
    [selectedMount, columns]
  )

  const selectMount = async (id: string) => {
    setSelectedMount(id)
    setPreview(null)
    setSelectedNode(null)
    setShowInfo(false)
    setMultiSelect(new Map())
    setActiveColumn(0)
    // Load root column
    setColumns([{ path: '/', entries: [], loading: true }])
    const entries = await loadColumn(id, '/')
    setColumns([{ path: '/', entries, loading: false }])
  }

  const handleMoveFile = async (srcPath: string, destDir: string, srcMountId?: string) => {
    if (!selectedMount) return
    const fileName = srcPath.split('/').pop() || ''
    const dest = destDir === '/' ? `/${fileName}` : `${destDir}/${fileName}`
    try {
      if (srcMountId && srcMountId !== selectedMount) {
        // Cross-mount: read from source, upload to destination
        const blob = await apiClient.readVfsFileRaw(srcMountId, srcPath)
        const file = new File([blob], fileName)
        await apiClient.uploadVfsFile(selectedMount, dest, file)
      } else {
        await apiClient.moveVfsFile(selectedMount, srcPath, dest)
      }
      // Refresh affected columns
      setColumns(prev =>
        prev.map(col => {
          const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
          if (col.path === srcParent || col.path === destDir) {
            return { ...col, loading: true }
          }
          return col
        })
      )
      const updated = await Promise.all(
        columns.map(async col => {
          const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
          if (col.path === srcParent || col.path === destDir) {
            const entries = await loadColumn(selectedMount, col.path)
            return { ...col, entries, loading: false }
          }
          return col
        })
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
      setActiveColumn(colIndex + 1)
    } else {
      setSelectedNode(entry)
      setShowInfo(true)
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

  // ── Multi-select helpers ───────────────────────────────────────────

  const clearMultiSelect = () => setMultiSelect(new Map())

  const getSelectedEntries = (colIdx: number): VfsNode[] => {
    const names = multiSelect.get(colIdx)
    if (!names || names.size === 0) {
      // Fall back to single selected
      const col = columns[colIdx]
      if (col?.selected) {
        const entry = col.entries.find(e => e.name === col.selected)
        return entry ? [entry] : []
      }
      return []
    }
    const col = columns[colIdx]
    return col ? col.entries.filter(e => names.has(e.name)) : []
  }

  const handleItemClick = (colIdx: number, entry: VfsNode, e: React.MouseEvent) => {
    const modKey = isMac ? e.metaKey : e.ctrlKey
    setActiveColumn(colIdx)

    if (modKey) {
      // Toggle multi-select
      setMultiSelect(prev => {
        const next = new Map(prev)
        const set = new Set(next.get(colIdx) ?? [])
        if (set.has(entry.name)) {
          set.delete(entry.name)
        } else {
          set.add(entry.name)
        }
        // Always include primary selection
        const col = columns[colIdx]
        if (col?.selected) set.add(col.selected)
        next.set(colIdx, set)
        return next
      })
      setSelectAnchor({ col: colIdx, name: entry.name })
    } else if (e.shiftKey && selectAnchor?.col === colIdx) {
      // Range select
      const col = columns[colIdx]
      if (col) {
        const names = col.entries.map(n => n.name)
        const anchorIdx = names.indexOf(selectAnchor.name)
        const currentIdx = names.indexOf(entry.name)
        if (anchorIdx >= 0 && currentIdx >= 0) {
          const start = Math.min(anchorIdx, currentIdx)
          const end = Math.max(anchorIdx, currentIdx)
          const selected = new Set(names.slice(start, end + 1))
          setMultiSelect(prev => {
            const next = new Map(prev)
            next.set(colIdx, selected)
            return next
          })
        }
      }
    } else {
      // Normal click — clear multi-select and navigate
      clearMultiSelect()
      setSelectAnchor({ col: colIdx, name: entry.name })
      if (entry.is_dir) {
        handleNavigate(colIdx, entry)
      } else {
        handleNavigate(colIdx, entry)
      }
    }
  }

  // ── File operations ────────────────────────────────────────────────

  const handleCopy = () => {
    if (!selectedMount) return
    const entries = getSelectedEntries(activeColumn)
    if (entries.length === 0) return
    setClipboard({
      items: entries.map(n => ({ mountId: selectedMount, node: n })),
      operation: 'copy'
    })
  }

  const handleCut = () => {
    if (!selectedMount) return
    const entries = getSelectedEntries(activeColumn)
    if (entries.length === 0) return
    setClipboard({
      items: entries.map(n => ({ mountId: selectedMount, node: n })),
      operation: 'cut'
    })
  }

  const handlePaste = async (targetPath: string) => {
    if (!selectedMount || !clipboard || clipboard.items.length === 0) return
    try {
      for (const item of clipboard.items) {
        const fileName = item.node.name
        const dest = targetPath === '/' ? `/${fileName}` : `${targetPath}/${fileName}`
        if (item.mountId !== selectedMount) {
          // Cross-mount: read from source, upload to destination
          const blob = await apiClient.readVfsFileRaw(item.mountId, item.node.path)
          const file = new File([blob], fileName)
          await apiClient.uploadVfsFile(selectedMount, dest, file)
          if (clipboard.operation === 'cut') {
            await apiClient.deleteVfs(item.mountId, item.node.path)
          }
        } else if (clipboard.operation === 'copy') {
          await apiClient.copyVfsFile(item.mountId, item.node.path, dest)
        } else {
          await apiClient.moveVfsFile(item.mountId, item.node.path, dest)
        }
      }
      if (clipboard.operation === 'cut') {
        clearClipboard()
      }
      // Refresh the target column
      const targetColIdx = columns.findIndex(c => c.path === targetPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      console.error('Paste failed:', e)
    }
  }

  const handleDelete = async () => {
    if (!selectedMount) return
    const entries = getSelectedEntries(activeColumn)
    if (entries.length === 0) return
    const names = entries.map(e => e.name).join(', ')
    setConfirmState({
      visible: true,
      message: `确认删除 ${entries.length} 项？\n${names}`,
      onConfirm: async () => {
        setConfirmState(s => ({ ...s, visible: false }))
        try {
          for (const entry of entries) {
            await apiClient.deleteVfs(selectedMount, entry.path)
          }
          clearMultiSelect()
          await refreshColumn(activeColumn)
        } catch (e) {
          console.error('Delete failed:', e)
        }
      }
    })
  }

  const handleRenameStart = () => {
    const entries = getSelectedEntries(activeColumn)
    if (entries.length !== 1) return
    setRenamingPath(entries[0].path)
    setRenameValue(entries[0].name)
  }

  const handleRenameConfirm = async () => {
    if (!selectedMount || !renamingPath || !renameValue.trim()) {
      setRenamingPath(null)
      return
    }
    const parentDir = renamingPath.substring(0, renamingPath.lastIndexOf('/')) || '/'
    const newPath = parentDir === '/' ? `/${renameValue}` : `${parentDir}/${renameValue}`
    if (newPath === renamingPath) {
      setRenamingPath(null)
      return
    }
    try {
      await apiClient.moveVfsFile(selectedMount, renamingPath, newPath)
      setRenamingPath(null)
      await refreshColumn(activeColumn)
    } catch (e) {
      console.error('Rename failed:', e)
      setRenamingPath(null)
    }
  }

  const handleNewFolder = async () => {
    if (!selectedMount || !newFolderState.name.trim()) return
    const dirPath =
      newFolderState.colPath === '/' ? `/${newFolderState.name}` : `${newFolderState.colPath}/${newFolderState.name}`
    try {
      await apiClient.mkdirVfs(selectedMount, dirPath)
      setNewFolderState({ visible: false, colPath: '', name: '' })
      const targetColIdx = columns.findIndex(c => c.path === newFolderState.colPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      console.error('New folder failed:', e)
    }
  }

  const handleNewFile = async () => {
    if (!selectedMount || !newFileState.name.trim()) return
    const filePath =
      newFileState.dirPath === '/' ? `/${newFileState.name}` : `${newFileState.dirPath}/${newFileState.name}`
    try {
      await apiClient.writeVfsFile(selectedMount, filePath, '')
      setNewFileState({ visible: false, dirPath: '', name: '' })
      const targetColIdx = columns.findIndex(c => c.path === newFileState.dirPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      console.error('New file failed:', e)
    }
  }

  const handleUpload = async (files: FileList, targetPath?: string) => {
    if (!selectedMount || files.length === 0) return
    const tPath = targetPath ?? uploadTargetRef.current
    const taskId = taskService.createTask(
      {
        name: files.length > 1 ? `上传 ${files.length} 个文件` : `上传 ${files[0].name}`,
        source: 'explorer'
      },
      { runImmediately: true }
    )
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const filePath = tPath === '/' ? `/${file.name}` : `${tPath}/${file.name}`
        taskService.updateTask(taskId, 'running', Math.round((i / files.length) * 100))
        await apiClient.uploadVfsFile(selectedMount, filePath, file)
      }
      taskService.updateTask(taskId, 'success', 100)
      const targetColIdx = columns.findIndex(c => c.path === tPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      taskService.updateTask(taskId, 'failed')
      console.error('Upload failed:', e)
    }
  }

  const handleOpenViewer = (mountId: string, node: VfsNode) => {
    openWindow('file-viewer', {
      title: node.name,
      appState: { mountId, node }
    })
  }

  const handleOpenInShell = (entry: VfsNode) => {
    if (!selectedMount) return
    const mount = mounts.find(m => m.id === selectedMount)
    if (!mount) return
    const dirPath = entry.is_dir ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/')) || '/'
    openWindow('ssh', {
      title: `Shell — ${entry.name}`,
      appState: { mountId: selectedMount, mountKind: mount.kind, mountRoot: mount.root, initialPath: dirPath }
    })
  }

  const handleShowProperties = (entry: VfsNode) => {
    setSelectedNode(entry)
    setShowInfo(true)
    if (!entry.is_dir && selectedMount) {
      apiClient
        .readVfsFile(selectedMount, entry.path)
        .then(r => setPreview(r.data))
        .catch(console.error)
    }
  }

  const handleItemDoubleClick = (colIdx: number, entry: VfsNode) => {
    void colIdx
    if (!selectedMount) return
    if (entry.is_dir) {
      // directories: navigate on single-click already, double-click is redundant
      return
    }
    handleOpenViewer(selectedMount, entry)
  }

  // ── Context menus ──────────────────────────────────────────────────

  const handleItemContextMenu = (colIdx: number, entry: VfsNode, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveColumn(colIdx)
    // If not in multi-select, select this item
    if (!multiSelect.get(colIdx)?.has(entry.name)) {
      clearMultiSelect()
      setColumns(prev => {
        const updated = [...prev]
        if (colIdx < updated.length) {
          updated[colIdx] = { ...updated[colIdx], selected: entry.name }
        }
        return updated
      })
    }
    const modSymbol = isMac ? '⌘' : 'Ctrl+'
    const currentColPath = columns[colIdx]?.path ?? '/'
    showContextMenu(e.clientX, e.clientY, [
      {
        id: 'open',
        label: entry.is_dir ? '打开' : '预览',
        icon: <FolderOpen size={14} />,
        action: () => handleNavigate(colIdx, entry)
      },
      ...(entry.is_dir
        ? [
            {
              id: 'open-shell',
              label: '在终端中打开',
              icon: <Terminal size={14} />,
              action: () => handleOpenInShell(entry)
            },
            { type: 'separator' as const },
            {
              id: 'new-folder',
              label: '新建文件夹',
              icon: <FolderPlus size={14} />,
              action: () => setNewFolderState({ visible: true, colPath: entry.path, name: '' })
            },
            {
              id: 'new-file',
              label: '新建文件',
              icon: <FilePlus size={14} />,
              action: () => setNewFileState({ visible: true, dirPath: entry.path, name: '' })
            }
          ]
        : [
            {
              id: 'open-viewer',
              label: '打开文件',
              icon: <File size={14} />,
              action: () => selectedMount && handleOpenViewer(selectedMount, entry)
            }
          ]),
      { type: 'separator' as const },
      {
        id: 'copy',
        label: '复制',
        icon: <Copy size={14} />,
        shortcut: `${modSymbol}C`,
        action: () => {
          if (!selectedMount) return
          const entries = getSelectedEntries(colIdx)
          if (entries.length === 0) {
            setClipboard({ items: [{ mountId: selectedMount, node: entry }], operation: 'copy' })
          } else {
            handleCopy()
          }
        }
      },
      {
        id: 'cut',
        label: '剪切',
        icon: <Scissors size={14} />,
        shortcut: `${modSymbol}X`,
        action: () => {
          if (!selectedMount) return
          const entries = getSelectedEntries(colIdx)
          if (entries.length === 0) {
            setClipboard({ items: [{ mountId: selectedMount, node: entry }], operation: 'cut' })
          } else {
            handleCut()
          }
        }
      },
      ...(clipboard && clipboard.items.length > 0
        ? [
            {
              id: 'paste',
              label: '粘贴',
              icon: <ClipboardPaste size={14} />,
              shortcut: `${modSymbol}V`,
              action: () => handlePaste(entry.is_dir ? entry.path : currentColPath)
            }
          ]
        : []),
      { type: 'separator' as const },
      {
        id: 'rename',
        label: '重命名',
        icon: <Pencil size={14} />,
        shortcut: 'F2',
        action: () => {
          setRenamingPath(entry.path)
          setRenameValue(entry.name)
        }
      },
      {
        id: 'delete',
        label: '删除',
        icon: <Trash2 size={14} />,
        danger: true,
        action: () => {
          if (!selectedMount) return
          setConfirmState({
            visible: true,
            message: `确认删除「${entry.name}」？`,
            onConfirm: async () => {
              setConfirmState(s => ({ ...s, visible: false }))
              try {
                await apiClient.deleteVfs(selectedMount, entry.path)
                clearMultiSelect()
                refreshColumn(colIdx)
              } catch (err) {
                console.error('Delete failed:', err)
              }
            }
          })
        }
      }
    ])
  }

  const handleColumnContextMenu = (colIdx: number, colPath: string, e: React.MouseEvent) => {
    e.preventDefault()
    setActiveColumn(colIdx)
    showContextMenu(e.clientX, e.clientY, [
      {
        id: 'new-folder',
        label: '新建文件夹',
        icon: <FolderPlus size={14} />,
        action: () => setNewFolderState({ visible: true, colPath, name: '' })
      },
      {
        id: 'new-file',
        label: '新建文件',
        icon: <FilePlus size={14} />,
        action: () => setNewFileState({ visible: true, dirPath: colPath, name: '' })
      },
      ...(clipboard && clipboard.items.length > 0
        ? [
            {
              id: 'paste',
              label: '粘贴',
              icon: <ClipboardPaste size={14} />,
              action: () => handlePaste(colPath)
            }
          ]
        : []),
      {
        id: 'upload',
        label: '上传文件',
        icon: <FileUp size={14} />,
        action: () => {
          uploadTargetRef.current = colPath
          fileInputRef.current?.click()
        }
      },
      { type: 'separator' as const },
      {
        id: 'refresh',
        label: '刷新',
        icon: <RefreshCw size={14} />,
        action: () => refreshColumn(colIdx)
      }
    ])
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────

  // Use ref to avoid stale closures in the keydown handler
  const kbStateRef = useRef({
    selectedMount,
    columns,
    activeColumn,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleRenameStart,
    handleNavigate,
    getSelectedEntries,
    clearMultiSelect
  })
  kbStateRef.current = {
    selectedMount,
    columns,
    activeColumn,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleRenameStart,
    handleNavigate,
    getSelectedEntries,
    clearMultiSelect
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: KeyboardEvent) => {
      // Don't intercept if inside an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      const s = kbStateRef.current
      if (!s.selectedMount) return

      const modKey = isMac ? e.metaKey : e.ctrlKey
      const col = s.columns[s.activeColumn]
      if (!col) return

      if (modKey && e.key === 'a') {
        e.preventDefault()
        const allNames = new Set(col.entries.map(n => n.name))
        setMultiSelect(prev => {
          const next = new Map(prev)
          next.set(s.activeColumn, allNames)
          return next
        })
        return
      }

      if (modKey && e.key === 'c') {
        e.preventDefault()
        s.handleCopy()
        return
      }

      if (modKey && e.key === 'x') {
        e.preventDefault()
        s.handleCut()
        return
      }

      if (modKey && e.key === 'v') {
        e.preventDefault()
        s.handlePaste(col.path)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        s.handleDelete()
        return
      }

      if (e.key === 'F2') {
        e.preventDefault()
        s.handleRenameStart()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const entries = s.getSelectedEntries(s.activeColumn)
        if (entries.length === 1) {
          s.handleNavigate(s.activeColumn, entries[0])
        }
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const entries = col.entries
        if (entries.length === 0) return
        const currentName = col.selected
        const currentIdx = currentName ? entries.findIndex(n => n.name === currentName) : -1
        let nextIdx: number
        if (e.key === 'ArrowUp') {
          nextIdx = currentIdx <= 0 ? entries.length - 1 : currentIdx - 1
        } else {
          nextIdx = currentIdx >= entries.length - 1 ? 0 : currentIdx + 1
        }
        const nextEntry = entries[nextIdx]
        s.clearMultiSelect()
        setSelectAnchor({ col: s.activeColumn, name: nextEntry.name })
        setColumns(prev => {
          const updated = prev.slice(0, s.activeColumn + 1)
          updated[s.activeColumn] = { ...updated[s.activeColumn], selected: nextEntry.name }
          return updated
        })
        setSelectedNode(nextEntry)
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (s.activeColumn > 0) {
          setActiveColumn(s.activeColumn - 1)
          s.clearMultiSelect()
        }
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const entries = s.getSelectedEntries(s.activeColumn)
        if (entries.length === 1 && entries[0].is_dir) {
          s.handleNavigate(s.activeColumn, entries[0])
        }
        return
      }
    }

    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [])

  // Build current path from columns
  const currentPath = columns.length > 0 ? columns[columns.length - 1].path : '/'

  return (
    <div ref={containerRef} className="flex h-full relative" tabIndex={-1} style={{ outline: 'none' }}>
      {showForm && (
        <MountForm
          onClose={() => setShowForm(false)}
          onCreated={m => {
            setMounts(p => [...p, m])
            setShowForm(false)
          }}
        />
      )}

      {editingMount && (
        <MountForm
          mountToEdit={editingMount}
          onClose={() => setEditingMount(null)}
          onUpdated={m => {
            setMounts(p => p.map(x => (x.id === m.id ? m : x)))
            setEditingMount(null)
          }}
        />
      )}

      {/* New folder overlay */}
      {newFolderState.visible && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-lg p-4 flex flex-col gap-3"
            style={{ width: 320, background: 'var(--vos-bg-surface)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
          >
            <div className="text-sm font-medium">新建文件夹</div>
            <input
              autoFocus
              className="w-full text-xs px-2 py-1.5 rounded border-none outline-none"
              style={{
                background: 'var(--vos-bg-input)',
                color: 'var(--vos-text-primary)',
                border: '0.5px solid var(--vos-border-subtle)'
              }}
              placeholder="文件夹名称"
              value={newFolderState.name}
              onChange={e => setNewFolderState(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNewFolder()
                if (e.key === 'Escape') setNewFolderState({ visible: false, colPath: '', name: '' })
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
                style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-text-primary)' }}
                onClick={() => setNewFolderState({ visible: false, colPath: '', name: '' })}
              >
                取消
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
                style={{
                  background: 'var(--vos-accent-primary)',
                  color: '#fff',
                  opacity: newFolderState.name.trim() ? 1 : 0.5
                }}
                disabled={!newFolderState.name.trim()}
                onClick={handleNewFolder}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New file overlay */}
      {newFileState.visible && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-lg p-4 flex flex-col gap-3"
            style={{ width: 320, background: 'var(--vos-bg-surface)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
          >
            <div className="text-sm font-medium">新建文件</div>
            <input
              autoFocus
              className="w-full text-xs px-2 py-1.5 rounded border-none outline-none"
              style={{
                background: 'var(--vos-bg-input)',
                color: 'var(--vos-text-primary)',
                border: '0.5px solid var(--vos-border-subtle)'
              }}
              placeholder="文件名称（如 notes.txt）"
              value={newFileState.name}
              onChange={e => setNewFileState(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNewFile()
                if (e.key === 'Escape') setNewFileState({ visible: false, dirPath: '', name: '' })
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
                style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-text-primary)' }}
                onClick={() => setNewFileState({ visible: false, dirPath: '', name: '' })}
              >
                取消
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
                style={{
                  background: 'var(--vos-accent-primary)',
                  color: '#fff',
                  opacity: newFileState.name.trim() ? 1 : 0.5
                }}
                disabled={!newFileState.name.trim()}
                onClick={handleNewFile}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmState.visible && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(s => ({ ...s, visible: false }))}
        />
      )}

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files) handleUpload(e.target.files)
          e.target.value = ''
        }}
      />

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
            // Use div+role="button" instead of <button> to avoid nesting
            // a <button> (delete) inside another <button> (select)
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group"
              style={{
                background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--vos-text-primary)',
                borderRadius: 4,
                margin: '1px 4px'
              }}
              onClick={() => selectMount(m.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') selectMount(m.id)
              }}
            >
              <KindIcon size={13} style={{ color: isActive ? '#fff' : 'var(--vos-text-tertiary)', flexShrink: 0 }} />
              <span className="flex-1 truncate">{m.name}</span>
              <button
                type="button"
                className="hidden group-hover:block bg-transparent border-none p-0 cursor-pointer text-inherit"
                onClick={e => {
                  e.stopPropagation()
                  setEditingMount(m)
                }}
              >
                <Settings size={10} />
              </button>
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
                    setActiveColumn(Math.max(0, activeColumn - 1))
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
                {(() => {
                  const segments = currentPath.split('/').filter(Boolean)
                  return (
                    <>
                      <button
                        type="button"
                        className="border-none bg-transparent cursor-pointer p-0 text-xs hover:underline"
                        style={{ color: 'var(--vos-text-secondary)' }}
                        onClick={() => {
                          const colIdx = 0
                          if (columns.length > 1) {
                            setColumns(prev => prev.slice(0, 1))
                            setActiveColumn(0)
                            setPreview(null)
                            setSelectedNode(null)
                            setShowInfo(false)
                          }
                        }}
                      >
                        /
                      </button>
                      {segments.map((seg, i) => {
                        const segPath = `/${segments.slice(0, i + 1).join('/')}`
                        const isLast = i === segments.length - 1
                        const targetColIdx = i + 1
                        return (
                          <span key={segPath} className="flex items-center gap-0.5">
                            <ChevronRight size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
                            <button
                              type="button"
                              className="border-none bg-transparent cursor-pointer p-0 text-xs truncate"
                              style={{
                                color: isLast ? 'var(--vos-text-primary)' : 'var(--vos-text-secondary)',
                                fontWeight: isLast ? 500 : 400,
                                maxWidth: 120
                              }}
                              onClick={() => {
                                if (isLast) return
                                if (targetColIdx < columns.length) {
                                  setColumns(prev => prev.slice(0, targetColIdx + 1))
                                  setActiveColumn(targetColIdx)
                                  setPreview(null)
                                  setSelectedNode(null)
                                  setShowInfo(false)
                                }
                              }}
                            >
                              {seg}
                            </button>
                          </span>
                        )
                      })}
                    </>
                  )
                })()}
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
                multiSelect={multiSelect}
                activeColumn={activeColumn}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onMoveFile={handleMoveFile}
                onExternalFileDrop={(files, targetPath) => handleUpload(files, targetPath)}
                onItemClick={handleItemClick}
                onItemDoubleClick={handleItemDoubleClick}
                onItemContextMenu={handleItemContextMenu}
                onColumnContextMenu={handleColumnContextMenu}
                onRenameChange={setRenameValue}
                onRenameConfirm={handleRenameConfirm}
                onRenameCancel={() => setRenamingPath(null)}
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
