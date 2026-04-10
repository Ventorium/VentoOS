/**
 * FilePicker — System-level File / Directory Picker
 *
 * Architecture position: Shell Layer
 * Used by any app that needs to pick a local path (Explorer mounts, K8s kubeconfig, etc.)
 *
 * Usage:
 *   <PathPickerInput
 *     value={path}
 *     onChange={setPath}
 *     mode="directory"   // 'file' | 'directory'
 *     placeholder="选择目录..."
 *   />
 */
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Folder, FolderOpen, Globe, HardDrive, Home, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VfsMount, VfsNode } from '@/apps/explorer/api'
import { vfsApi } from '@/apps/explorer/api'
import type { LocalFsNode } from '@/infra/api'
import { apiClient } from '@/infra/api'
import { getFileIconByName } from '@/kernel'

// ─── Types ─────────────────────────────────────────────────────────────────

export type FilePickerMode = 'file' | 'directory'

export interface PathPickerInputProps {
  value: string
  onChange: (path: string) => void
  mode?: FilePickerMode
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

// ─── Breadcrumb helper ─────────────────────────────────────────────────────

function pathSegments(path: string): Array<{ label: string; path: string }> {
  if (!path || path === '/') return [{ label: '/', path: '/' }]
  const normalized = path.startsWith('/') ? path : `/${path}`
  const parts = normalized.split('/').filter(Boolean)
  const segs: Array<{ label: string; path: string }> = [{ label: '/', path: '/' }]
  parts.forEach((p, i) => {
    segs.push({ label: p, path: '/' + parts.slice(0, i + 1).join('/') })
  })
  return segs
}

// ─── Browser Modal ─────────────────────────────────────────────────────────

function FilePickerModal({
  initial,
  mode,
  onConfirm,
  onClose
}: {
  initial: string
  mode: FilePickerMode
  onConfirm: (path: string) => void
  onClose: () => void
}) {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (!initial) return '~'
    // If initial is a file path, start at its parent directory
    if (mode === 'file' && !initial.endsWith('/')) {
      const parts = initial.split('/')
      parts.pop()
      return parts.join('/') || '/'
    }
    return initial
  })
  const [nodes, setNodes] = useState<LocalFsNode[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string>(initial)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiClient.browseLocalFs(path, mode === 'directory')
        setNodes(res.data)
        setCurrentPath(path)
        if (listRef.current) listRef.current.scrollTop = 0
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    },
    [mode]
  )

  useEffect(() => {
    loadDir(currentPath)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleNodeClick(node: LocalFsNode) {
    if (node.is_dir) {
      loadDir(node.path)
      if (mode === 'directory') setSelected(node.path)
    } else if (mode === 'file') {
      setSelected(node.path)
    }
  }

  function handleNodeDblClick(node: LocalFsNode) {
    if (node.is_dir) {
      loadDir(node.path)
      if (mode === 'directory') setSelected(node.path)
    } else if (mode === 'file') {
      onConfirm(node.path)
    }
  }

  const segs = pathSegments(currentPath)

  return (
    <div className="vos-modal-overlay" onClick={onClose} style={{ zIndex: 9000 }}>
      <motion.div
        className="vos-modal"
        style={{ width: 540, maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: 0 }}
        initial={{ scale: 0.94, opacity: 0, y: -8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: -8 }}
        transition={{ duration: 0.16 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px 10px',
            borderBottom: '0.5px solid var(--vos-border-subtle)',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vos-text-primary)' }}>
            {mode === 'directory' ? '选择目录' : '选择文件'}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vos-text-secondary)',
              display: 'flex',
              padding: 2
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Breadcrumbs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '6px 14px',
            borderBottom: '0.5px solid var(--vos-border-subtle)',
            flexShrink: 0,
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}
        >
          <button
            type="button"
            onClick={() => loadDir('~')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vos-text-secondary)',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Home size={12} />
          </button>
          {segs.map((seg, i) => (
            <span key={seg.path} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <ChevronRight size={10} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />}
              <button
                type="button"
                onClick={() => i < segs.length - 1 && loadDir(seg.path)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: i < segs.length - 1 ? 'pointer' : 'default',
                  color: i < segs.length - 1 ? 'var(--vos-accent-primary)' : 'var(--vos-text-primary)',
                  fontSize: 11,
                  padding: '2px 4px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  fontWeight: i === segs.length - 1 ? 500 : 400
                }}
              >
                {seg.label}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 0' }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2
                size={18}
                style={{ color: 'var(--vos-text-secondary)', animation: 'vos-spin 0.7s linear infinite' }}
              />
            </div>
          )}
          {error && (
            <div style={{ padding: '12px 16px', color: 'var(--vos-accent-danger)', fontSize: 12 }}>{error}</div>
          )}
          {!loading && !error && nodes.length === 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--vos-text-tertiary)', fontSize: 12 }}>目录为空</div>
          )}
          {!loading &&
            nodes.map(node => {
              const isSelected = selected === node.path
              return (
                <div
                  key={node.path}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => handleNodeClick(node)}
                  onDoubleClick={() => handleNodeDblClick(node)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleNodeDblClick(node)
                    else if (e.key === ' ') handleNodeClick(node)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 14px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                    color: isSelected ? '#fff' : node.is_dir ? 'var(--vos-text-primary)' : 'var(--vos-text-secondary)',
                    borderRadius: 0,
                    fontSize: 12,
                    userSelect: 'none',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--vos-bg-item-hover)'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  {node.is_dir ? (
                    <FolderOpen
                      size={14}
                      style={{ flexShrink: 0, color: isSelected ? '#fff' : 'var(--vos-accent-primary)', opacity: 0.9 }}
                    />
                  ) : (
                    (() => {
                      const iconInfo = getFileIconByName(node.name)
                      const IconComp = iconInfo.icon
                      return (
                        <IconComp
                          size={14}
                          style={{ flexShrink: 0, color: isSelected ? '#fff' : iconInfo.color }}
                        />
                      )
                    })()
                  )}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.name}
                  </span>
                  {node.is_dir && <ChevronRight size={10} style={{ flexShrink: 0, opacity: 0.4 }} />}
                </div>
              )
            })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderTop: '0.5px solid var(--vos-border-subtle)',
            flexShrink: 0
          }}
        >
          {/* Selected path display */}
          <div
            style={{
              flex: 1,
              fontSize: 11,
              color: 'var(--vos-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'var(--vos-bg-input)',
              border: '0.5px solid var(--vos-border-subtle)',
              borderRadius: 5,
              padding: '3px 8px',
              fontFamily: 'monospace'
            }}
          >
            {selected || (mode === 'directory' ? currentPath : '未选择')}
          </div>
          <button type="button" className="vos-btn" onClick={onClose} style={{ flexShrink: 0 }}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary"
            style={{ flexShrink: 0 }}
            disabled={!selected && mode === 'file'}
            onClick={() => {
              const finalPath = selected || (mode === 'directory' ? currentPath : '')
              if (finalPath) onConfirm(finalPath)
            }}
          >
            {mode === 'directory' ? '选择此目录' : '打开'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── PathPickerInput — the public component ────────────────────────────────

/**
 * A text input with a "Browse" button that opens the file picker modal.
 * Renders the picker modal inline (via AnimatePresence at document root level
 * is handled by the caller mounting it; here it's portal-less for simplicity
 * since the shell's root has no backdrop-filter containment).
 */
export function PathPickerInput({
  value,
  onChange,
  mode = 'file',
  placeholder,
  className,
  style,
  disabled
}: PathPickerInputProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className={className ?? 'vos-input'}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, ...style }}
          placeholder={placeholder ?? (mode === 'directory' ? '目录路径' : '文件路径')}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          readOnly={false}
        />
        <button
          type="button"
          className="vos-btn"
          style={{ flexShrink: 0, fontSize: 12 }}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <Folder size={12} />
          浏览
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <FilePickerModal
            key="file-picker"
            initial={value}
            mode={mode}
            onConfirm={path => {
              onChange(path)
              setOpen(false)
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

export default PathPickerInput

// ─── VFS File Picker ────────────────────────────────────────────────────────

/**
 * Result from VfsPathPickerInput.
 * For local mounts: path is the actual OS path.
 * For remote mounts: path is "vfs://mountId/...path", content is the file bytes (for inline use).
 */
export interface VfsPickerResult {
  path: string
  mountId: string
  mountKind: string
  isRemote: boolean
  /** For remote files, the binary content fetched at selection time */
  content?: Blob
}

export interface VfsPathPickerInputProps {
  value: string
  onChange: (path: string, result?: VfsPickerResult) => void
  mode?: FilePickerMode
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

// ── Kind icons ───────────────────────────────────────────────────────────────

const KIND_ICON: Record<string, React.ElementType> = {
  local: HardDrive,
  sftp: Globe,
  ftp: Globe,
  s3: Globe,
  smb: Globe
}

// ── VFS Browser Modal ────────────────────────────────────────────────────────

export function VfsFilePickerModal({
  mode,
  onConfirm,
  onClose
}: {
  mode: FilePickerMode
  onConfirm: (result: VfsPickerResult) => void
  onClose: () => void
}) {
  const [mounts, setMounts] = useState<VfsMount[]>([])
  const [selectedMount, setSelectedMount] = useState<VfsMount | null>(null)
  const [currentPath, setCurrentPath] = useState('/')
  const [nodes, setNodes] = useState<VfsNode[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<VfsNode | null>(null)
  const [fetchingContent, setFetchingContent] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Load mounts on open
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectMount intentionally omitted; should run once
  useEffect(() => {
    vfsApi
      .getVfsMounts()
      .then(r => {
        setMounts(r.data)
        if (r.data.length > 0) selectMount(r.data[0])
      })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectMount = (mount: VfsMount) => {
    setSelectedMount(mount)
    setCurrentPath('/')
    setSelectedNode(null)
    loadDir(mount.id, '/')
  }

  const loadDir = useCallback(async (mountId: string, path: string) => {
    setLoading(true)
    setNodes([])
    try {
      const r = await vfsApi.listVfsDir(mountId, path)
      const sorted = [...r.data].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setNodes(sorted)
    } catch (e) {
      console.error('VFS list error:', e)
      setNodes([])
    } finally {
      setLoading(false)
    }
  }, [])

  const navigate = (node: VfsNode) => {
    if (!selectedMount) return
    if (node.is_dir) {
      setCurrentPath(node.path)
      setSelectedNode(null)
      loadDir(selectedMount.id, node.path)
    } else {
      setSelectedNode(node)
    }
  }

  const handleConfirm = async () => {
    if (!selectedMount) return
    const targetNode = selectedNode
    const finalPath = mode === 'directory' ? currentPath : (targetNode?.path ?? currentPath)
    if (!finalPath) return

    const isRemote = selectedMount.kind !== 'local'
    if (isRemote && targetNode && !targetNode.is_dir) {
      // For remote files, fetch content for inline use
      setFetchingContent(true)
      try {
        const blob = await vfsApi.readVfsFileRaw(selectedMount.id, finalPath)
        onConfirm({
          path: `vfs://${selectedMount.id}${finalPath}`,
          mountId: selectedMount.id,
          mountKind: selectedMount.kind,
          isRemote: true,
          content: blob
        })
      } catch (e) {
        console.error('VFS fetch content error:', e)
      } finally {
        setFetchingContent(false)
      }
    } else {
      // Local mount: path is already mount-relative (e.g. /teleport-kubeconfig.yaml).
      // The backend joins mount.root + path, so we must NOT prepend the root here.
      onConfirm({
        path: finalPath,
        mountId: selectedMount.id,
        mountKind: selectedMount.kind,
        isRemote: false
      })
    }
  }

  // Breadcrumb
  const segments: Array<{ label: string; path: string }> = [{ label: '/', path: '/' }]
  if (currentPath !== '/') {
    const parts = currentPath.split('/').filter(Boolean)
    parts.forEach((p, i) => {
      segments.push({ label: p, path: '/' + parts.slice(0, i + 1).join('/') })
    })
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.14 }}
        className="flex flex-col overflow-hidden rounded-xl"
        style={{
          width: 680,
          height: 480,
          background: 'var(--vos-bg-surface)',
          boxShadow: '0 24px 80px rgba(0,0,0,.5)',
          border: '0.5px solid var(--vos-border-subtle)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center px-4 py-2.5 gap-3 flex-shrink-0"
          style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
        >
          <span className="text-xs font-semibold flex-1">{mode === 'directory' ? '选择目录' : '选择文件'}</span>
          <button type="button" className="vos-btn" style={{ padding: '2px 6px' }} onClick={onClose}>
            <X size={12} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar: VFS mounts */}
          <div
            className="w-40 flex-shrink-0 flex flex-col py-2 overflow-y-auto"
            style={{ borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-base)' }}
          >
            <div
              className="px-3 pb-1 text-[10px] font-semibold uppercase"
              style={{ color: 'var(--vos-text-tertiary)' }}
            >
              存储源
            </div>
            {mounts.map(m => {
              const Icon = KIND_ICON[m.kind] ?? HardDrive
              const active = selectedMount?.id === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  className="flex items-center gap-2 px-3 py-1.5 w-full text-left border-none bg-transparent cursor-pointer text-xs"
                  style={{
                    background: active ? 'var(--vos-accent-primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--vos-text-primary)',
                    borderRadius: 4,
                    margin: '1px 4px',
                    width: 'calc(100% - 8px)'
                  }}
                  onClick={() => selectMount(m)}
                >
                  <Icon size={12} style={{ flexShrink: 0 }} />
                  <span className="truncate">{m.name}</span>
                </button>
              )
            })}
            {mounts.length === 0 && (
              <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                暂无存储源
              </div>
            )}
          </div>

          {/* Main browser area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Breadcrumb */}
            <div
              className="flex items-center gap-1 px-3 h-8 flex-shrink-0 overflow-x-auto"
              style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
            >
              {segments.map((seg, i) => (
                <span key={seg.path} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />}
                  <button
                    type="button"
                    className="bg-transparent border-none cursor-pointer text-xs p-0"
                    style={{
                      color: i === segments.length - 1 ? 'var(--vos-text-primary)' : 'var(--vos-text-secondary)'
                    }}
                    onClick={() => {
                      if (!selectedMount) return
                      setCurrentPath(seg.path)
                      setSelectedNode(null)
                      loadDir(selectedMount.id, seg.path)
                    }}
                  >
                    {i === 0 ? <Home size={11} /> : seg.label}
                  </button>
                </span>
              ))}
            </div>

            {/* File list */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-1">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
                </div>
              )}
              {!loading &&
                nodes.map(node => {
                  const isSelected = selectedNode?.path === node.path
                  const hidden = node.name.startsWith('.')
                  if (hidden) return null
                  return (
                    <button
                      key={node.path}
                      type="button"
                      className="flex items-center gap-2 px-2 py-1 w-full text-left border-none cursor-pointer text-xs"
                      style={{
                        background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                        color: isSelected ? '#fff' : 'var(--vos-text-primary)',
                        borderRadius: 4,
                        opacity: mode === 'file' && node.is_dir ? 1 : 1
                      }}
                      onClick={() => {
                        if (node.is_dir) {
                          navigate(node)
                        } else if (mode === 'file') {
                          setSelectedNode(node)
                        }
                      }}
                      onDoubleClick={() => {
                        if (node.is_dir) navigate(node)
                      }}
                    >
                      {node.is_dir ? (
                        <FolderOpen
                          size={13}
                          style={{ color: isSelected ? '#fff' : 'var(--vos-accent-warning, #f59e0b)', flexShrink: 0 }}
                        />
                      ) : (
                        <File
                          size={13}
                          style={{ color: isSelected ? '#fff' : 'var(--vos-text-tertiary)', flexShrink: 0 }}
                        />
                      )}
                      <span className="truncate">{node.name}</span>
                    </button>
                  )
                })}
              {!loading && nodes.length === 0 && (
                <div className="py-8 text-center text-[11px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                  空目录
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
          style={{ borderTop: '0.5px solid var(--vos-border-subtle)' }}
        >
          <div
            className="flex-1 text-xs font-mono truncate px-2 py-1 rounded"
            style={{
              background: 'var(--vos-bg-input)',
              color: 'var(--vos-text-secondary)',
              border: '0.5px solid var(--vos-border-subtle)'
            }}
          >
            {selectedNode?.path ?? (mode === 'directory' ? currentPath : '未选择文件')}
          </div>
          <button type="button" className="vos-btn text-xs" onClick={onClose} style={{ flexShrink: 0 }}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary text-xs"
            style={{ flexShrink: 0 }}
            disabled={fetchingContent || (mode === 'file' && !selectedNode)}
            onClick={handleConfirm}
          >
            {fetchingContent ? (
              <Loader2 size={11} className="animate-spin" />
            ) : mode === 'directory' ? (
              '选择此目录'
            ) : (
              '打开'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── VfsPathPickerInput ─────────────────────────────────────────────────────

/**
 * A path input widget backed by the VFS mount browser.
 * For local mounts: returns the actual OS path.
 * For remote mounts: path = "vfs://mountId/path", and `result.content` contains
 * the raw file bytes for apps that need inline embedding (e.g. kubeconfig).
 */
export function VfsPathPickerInput({
  value,
  onChange,
  mode = 'file',
  placeholder,
  className,
  style,
  disabled
}: VfsPathPickerInputProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className={className ?? 'vos-input'}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, ...style }}
          placeholder={
            placeholder ?? (mode === 'directory' ? '目录路径 (支持 VFS 存储源)' : '文件路径 (支持 VFS 存储源)')
          }
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="vos-btn"
          style={{ flexShrink: 0, fontSize: 12 }}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <Folder size={12} />
          浏览
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <VfsFilePickerModal
            key="vfs-picker"
            mode={mode}
            onConfirm={result => {
              onChange(result.path, result)
              setOpen(false)
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
