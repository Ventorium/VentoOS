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
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { ChevronRight, File, Folder, FolderOpen, Globe, HardDrive, Home, Loader2, X } from 'lucide-react'
import { createPortal } from "react-dom"
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
    <div className="vos-modal-overlay z-[9000]" onClick={onClose}>
      <motion.div
        className="vos-modal w-[540px] max-h-[70vh] flex flex-col p-0"
        initial={{ scale: 0.94, opacity: 0, y: -8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: -8 }}
        transition={{ duration: 0.16 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] shrink-0">
          <span className="text-[13px] font-semibold text-[var(--vos-text-primary)]">
            {mode === 'directory' ? '选择目录' : '选择文件'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto bg-transparent border-none cursor-pointer text-[var(--vos-text-secondary)] flex p-[2px]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-[2px] px-3.5 py-1.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] shrink-0 overflow-x-auto [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => loadDir('~')}
            className="bg-transparent border-none cursor-pointer text-[var(--vos-text-secondary)] px-1 py-[2px] flex items-center"
          >
            <Home size={12} />
          </button>
          {segs.map((seg, i) => (
            <span key={seg.path} className="flex items-center gap-[2px]">
              {i > 0 && <ChevronRight size={10} className="text-[var(--vos-text-tertiary)] shrink-0" />}
              <button
                type="button"
                onClick={() => i < segs.length - 1 && loadDir(seg.path)}
                className="bg-transparent border-none text-[11px] px-1 py-[2px] rounded whitespace-nowrap"
                style={{
                  cursor: i < segs.length - 1 ? 'pointer' : 'default',
                  color: i < segs.length - 1 ? 'var(--vos-accent-primary)' : 'var(--vos-text-primary)',
                  fontWeight: i === segs.length - 1 ? 500 : 400
                }}
              >
                {seg.label}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 py-1 px-0">
          {loading && (
            <div className="flex justify-center p-6">
              <Loader2
                size={18}
                className="text-[var(--vos-text-secondary)] animate-[vos-spin_0.7s_linear_infinite]"
              />
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-[var(--vos-accent-danger)] text-xs">{error}</div>
          )}
          {!loading && !error && nodes.length === 0 && (
            <div className="px-4 py-3 text-[var(--vos-text-tertiary)] text-xs">目录为空</div>
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
                  className="flex items-center gap-2 px-3.5 py-[5px] cursor-pointer rounded-none text-xs select-none transition-[background] duration-100"
                  style={{
                    background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                    color: isSelected ? '#fff' : node.is_dir ? 'var(--vos-text-primary)' : 'var(--vos-text-secondary)'
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
                      className={isSelected ? 'shrink-0 opacity-90 text-white' : 'shrink-0 opacity-90 text-[var(--vos-accent-primary)]'}
                    />
                  ) : (
                    (() => {
                      const iconInfo = getFileIconByName(node.name)
                      const IconComp = iconInfo.icon
                      return (
                        <IconComp
                          size={14}
                          className={isSelected ? 'shrink-0 text-white' : 'shrink-0'}
                          style={isSelected ? undefined : { color: iconInfo.color }}
                        />
                      )
                    })()
                  )}
                  <span className="flex-1 truncate">
                    {node.name}
                  </span>
                  {node.is_dir && <ChevronRight size={10} className="shrink-0 opacity-40" />}
                </div>
              )
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-t-[0.5px] border-t-solid border-t-[var(--vos-border-subtle)] shrink-0">
          {/* Selected path display */}
          <div className="flex-1 text-[11px] text-[var(--vos-text-secondary)] truncate bg-[var(--vos-bg-input)] border-[0.5px] border-solid border-[var(--vos-border-subtle)] rounded-[5px] px-2 py-[3px] font-mono">
            {selected || (mode === 'directory' ? currentPath : '未选择')}
          </div>
          <button type="button" className="vos-btn shrink-0" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary shrink-0"
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
      <div className="flex gap-[6px] items-center">
        <input
          className={className ?? 'vos-input'}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, ...(style ?? {}) }}
          placeholder={placeholder ?? (mode === 'directory' ? '目录路径' : '文件路径')}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          readOnly={false}
        />
        <button
          type="button"
          className="vos-btn shrink-0 text-xs"
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
  const dragControls = useDragControls()

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
      // Local mount: use vfs:// URI so backend can resolve via VfsManager
      onConfirm({
        path: `vfs://${selectedMount.id}${finalPath}`,
        mountId: selectedMount.id,
        mountKind: selectedMount.kind,
        isRemote: false
      })
    }
  }

  // doConfirm: used by double-click to confirm with an explicit node without waiting for state update
  const doConfirm = useCallback(async (targetNode: VfsNode) => {
    if (!selectedMount) return
    const finalPath = targetNode.path
    if (!finalPath) return

    const isRemote = selectedMount.kind !== 'local'
    if (isRemote && !targetNode.is_dir) {
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
      onConfirm({
        path: `vfs://${selectedMount.id}${finalPath}`,
        mountId: selectedMount.id,
        mountKind: selectedMount.kind,
        isRemote: false
      })
    }
  }, [selectedMount, onConfirm])

  // Breadcrumb
  const segments: Array<{ label: string; path: string }> = [{ label: '/', path: '/' }]
  if (currentPath !== '/') {
    const parts = currentPath.split('/').filter(Boolean)
    parts.forEach((p, i) => {
      segments.push({ label: p, path: '/' + parts.slice(0, i + 1).join('/') })
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[20000] vos-flex-center bg-black/55 pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.14 }}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        className="flex flex-col overflow-hidden rounded-xl w-[680px] h-[480px] bg-[var(--vos-bg-overlay)] backdrop-blur-xl border-[0.5px] border-solid border-[var(--vos-border-subtle)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      >
        {/* Header */}
        <div
          className="flex items-center px-4 py-2.5 gap-3 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] cursor-move select-none"
          onPointerDown={e => dragControls.start(e)}
        >
          <span className="text-xs font-semibold flex-1">{mode === 'directory' ? '选择目录' : '选择文件'}</span>
          <button type="button" className="vos-btn px-1.5 py-[2px]" onClick={onClose}>
            <X size={12} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar: VFS mounts */}
          <div
            className="w-40 flex-shrink-0 flex flex-col py-2 overflow-y-auto border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)] bg-[var(--vos-bg-base)]"
          >
            <div
              className="px-3 pb-1 text-[10px] font-semibold uppercase text-[var(--vos-text-tertiary)]"
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
                  className="flex items-center gap-2 px-3 py-1.5 w-full text-left border-none bg-transparent cursor-pointer text-xs rounded mx-1 my-[1px] w-[calc(100%-8px)]"
                  style={{
                    background: active ? 'var(--vos-accent-primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--vos-text-primary)'
                  }}
                  onClick={() => selectMount(m)}
                >
                  <Icon size={12} className="shrink-0" />
                  <span className="truncate">{m.name}</span>
                </button>
              )
            })}
            {mounts.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-[var(--vos-text-tertiary)]">
                暂无存储源
              </div>
            )}
          </div>

          {/* Main browser area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Breadcrumb */}
            <div
              className="flex items-center gap-1 px-3 h-8 flex-shrink-0 overflow-x-auto border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]"
            >
              {segments.map((seg, i) => (
                <span key={seg.path} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} className="text-[var(--vos-text-tertiary)] shrink-0" />}
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
                  <Loader2 size={16} className="animate-spin text-[var(--vos-text-tertiary)]" />
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
                    className="flex items-center gap-2 px-2 py-1 w-full text-left border-none cursor-pointer text-xs rounded"
                    style={{
                      background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--vos-text-primary)'
                      }}
                      onClick={() => {
                        if (node.is_dir) {
                          navigate(node)
                        } else if (mode === 'file') {
                          setSelectedNode(node)
                        }
                      }}
                      onDoubleClick={() => {
                        if (node.is_dir) {
                          navigate(node)
                        } else if (mode === 'file') {
                          doConfirm(node)
                        }
                      }}
                    >
                      {node.is_dir ? (
                        <FolderOpen
                          size={13}
                          className={isSelected ? 'shrink-0 text-white' : 'shrink-0 text-[var(--vos-accent-warning,_#f59e0b)]'}
                        />
                      ) : (
                        <File
                          size={13}
                          className={isSelected ? 'shrink-0 text-white' : 'shrink-0 text-[var(--vos-text-tertiary)]'}
                        />
                      )}
                      <span className="truncate">{node.name}</span>
                    </button>
                  )
                })}
              {!loading && nodes.length === 0 && (
                <div className="py-8 text-center text-[11px] text-[var(--vos-text-tertiary)]">
                  空目录
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0 border-t-[0.5px] border-t-solid border-t-[var(--vos-border-subtle)]"
        >
          <div
            className="flex-1 text-xs font-mono truncate px-2 py-1 rounded bg-[var(--vos-bg-input)] text-[var(--vos-text-secondary)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]"
          >
            {selectedNode?.path ?? (mode === 'directory' ? currentPath : '未选择文件')}
          </div>
          <button type="button" className="vos-btn text-xs shrink-0" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary text-xs shrink-0"
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
    </div>,
    document.body
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
      <div className="flex gap-1.5 items-center">
        <input
          className={`${className ?? 'vos-input'} flex-1 font-mono text-xs`}
          style={style}
          placeholder={
            placeholder ?? (mode === 'directory' ? '目录路径 (支持 VFS 存储源)' : '文件路径 (支持 VFS 存储源)')
          }
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="vos-btn shrink-0 text-xs"
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
