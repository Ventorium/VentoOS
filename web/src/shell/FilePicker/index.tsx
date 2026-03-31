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
import { ChevronRight, File, Folder, FolderOpen, Home, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/infra/api'
import type { LocalFsNode } from '@/infra/api'

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
  onClose,
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

  const loadDir = useCallback(async (path: string) => {
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
  }, [mode])

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
    <div
      className="vos-modal-overlay"
      onClick={onClose}
      style={{ zIndex: 9000 }}
    >
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px 10px',
          borderBottom: '0.5px solid var(--vos-border-subtle)',
          flexShrink: 0,
        }}>
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
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Breadcrumbs */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 14px',
          borderBottom: '0.5px solid var(--vos-border-subtle)',
          flexShrink: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          <button
            type="button"
            onClick={() => loadDir('~')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vos-text-secondary)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
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
                  fontWeight: i === segs.length - 1 ? 500 : 400,
                }}
              >
                {seg.label}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div
          ref={listRef}
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 0' }}
        >
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2 size={18} style={{ color: 'var(--vos-text-secondary)', animation: 'vos-spin 0.7s linear infinite' }} />
            </div>
          )}
          {error && (
            <div style={{ padding: '12px 16px', color: 'var(--vos-accent-danger)', fontSize: 12 }}>{error}</div>
          )}
          {!loading && !error && nodes.length === 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--vos-text-tertiary)', fontSize: 12 }}>目录为空</div>
          )}
          {!loading && nodes.map(node => {
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
                  color: isSelected ? '#fff' : (node.is_dir ? 'var(--vos-text-primary)' : 'var(--vos-text-secondary)'),
                  borderRadius: 0,
                  fontSize: 12,
                  userSelect: 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--vos-bg-item-hover)'
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                }}
              >
                {node.is_dir
                  ? <FolderOpen size={14} style={{ flexShrink: 0, color: isSelected ? '#fff' : 'var(--vos-accent-primary)', opacity: 0.9 }} />
                  : <File size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                }
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.name}
                </span>
                {node.is_dir && (
                  <ChevronRight size={10} style={{ flexShrink: 0, opacity: 0.4 }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderTop: '0.5px solid var(--vos-border-subtle)',
          flexShrink: 0,
        }}>
          {/* Selected path display */}
          <div style={{
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
            fontFamily: 'monospace',
          }}>
            {selected || (mode === 'directory' ? currentPath : '未选择')}
          </div>
          <button type="button" className="vos-btn" onClick={onClose} style={{ flexShrink: 0 }}>取消</button>
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
  disabled,
}: PathPickerInputProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', ...style }}>
        <input
          className={className ?? 'vos-input'}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
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
