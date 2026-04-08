/**
 * File Viewer App
 *
 * Renders file content from any VFS mount in the appropriate viewer:
 *   - Images: zoomable/pannable viewer
 *   - PDF: embedded viewer
 *   - Markdown: rendered via XMarkdown
 *   - Video / Audio: HTML5 media player
 *   - Text / Code: syntax-aware pre-viewer with inline editing
 *   - Binary: hex dump (first 4 KB) + metadata
 *
 * The app receives `appState` from the window that opened it:
 *   { mountId: string, node: VfsNode }
 */

import { XMarkdown } from '@ant-design/x-markdown'
import { AnimatePresence } from 'framer-motion'
import { FileText, Loader2, Pause, Pencil, Play, Save, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { VfsFileContent, VfsNode } from '@/apps/explorer/api'
import { vfsApi } from '@/apps/explorer/api'
import type { AppComponentProps } from '@/kernel'
import { useWindow, useWindowActions } from '@/kernel'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import { VfsFilePickerModal } from '@/shell/FilePicker'

// ─── Utilities ────────────────────────────────────────────────────────────

function getExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function toHex(bytes: Uint8Array, lineLen = 16): string {
  const lines: string[] = []
  for (let i = 0; i < bytes.length; i += lineLen) {
    const chunk = bytes.slice(i, i + lineLen)
    const hex = Array.from(chunk)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(lineLen * 3 - 1, ' ')
    const ascii = Array.from(chunk)
      .map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('')
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`)
  }
  return lines.join('\n')
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const PDF_EXTS = new Set(['pdf'])
const MD_EXTS = new Set(['md', 'markdown'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'flv'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'opus', 'wma', 'weba'])
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
  'sql',
  'env'
])
const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'log',
  'csv',
  'tsv',
  'ini',
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
  const ext = getExt(name)
  if (TEXT_EXTS.has(ext)) return true
  if (!ext || ext === name.toLowerCase()) return true
  return false
}

// ─── Zoomable image viewer ─────────────────────────────────────────────────

function ImageViewer({ src }: { src: string }) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const start = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(s => Math.max(0.1, Math.min(10, s - e.deltaY * 0.001)))
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true
      start.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    },
    [pos]
  )

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPos({
      x: start.current.px + (e.clientX - start.current.mx),
      y: start.current.py + (e.clientY - start.current.my)
    })
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div
      className="w-full h-full overflow-hidden flex items-center justify-center"
      style={{ cursor: scale > 1 ? 'grab' : 'default', background: 'var(--vos-bg-base)' }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transformOrigin: 'center',
          maxWidth: scale === 1 ? '100%' : 'none',
          maxHeight: scale === 1 ? '100%' : 'none',
          objectFit: 'contain',
          transition: dragging.current ? 'none' : 'transform 0.05s ease',
          userSelect: 'none'
        }}
        onDoubleClick={() => {
          setScale(1)
          setPos({ x: 0, y: 0 })
        }}
      />
      {/* scale badge */}
      <div
        className="absolute bottom-2 right-3 text-[11px] px-2 py-0.5 rounded"
        style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', pointerEvents: 'none' }}
      >
        {Math.round(scale * 100)}%
      </div>
    </div>
  )
}

// ─── Media Player ────────────────────────────────────────────────────────────

function MediaPlayer({ src, type }: { src: string; type: 'video' | 'audio' }) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)

  function fmt(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function togglePlay() {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) {
      el.play().catch(() => {})
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  function toggleMute() {
    const el = mediaRef.current
    if (!el) return
    el.muted = !el.muted
    setMuted(el.muted)
  }

  const handleTimeUpdate = () => {
    const el = mediaRef.current
    if (!el) return
    setCurrentTime(el.currentTime)
  }

  const handleLoadedMetadata = () => {
    const el = mediaRef.current
    if (!el) return
    setDuration(el.duration || 0)
  }

  const handleEnded = () => setPlaying(false)

  const playerStyle: React.CSSProperties = {
    background: 'var(--vos-bg-surface)',
    border: '0.5px solid var(--vos-border-subtle)',
    borderRadius: 12,
    padding: 16,
    maxWidth: type === 'audio' ? 480 : '100%',
    width: type === 'audio' ? 480 : '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: type === 'video' ? '#000' : 'var(--vos-bg-base)',
        flexDirection: 'column',
        gap: 0
      }}
    >
      {type === 'video' && (
        // biome-ignore lint/a11y/useMediaCaption: file viewer
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          style={{ maxWidth: '100%', maxHeight: 'calc(100% - 80px)', outline: 'none', display: 'block' }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onClick={togglePlay}
        />
      )}
      {type === 'audio' && (
        // biome-ignore lint/a11y/useMediaCaption: file viewer
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}
      {/* Controls bar */}
      <div style={playerStyle}>
        {/* Progress */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          style={{ width: '100%', accentColor: 'var(--vos-accent-primary)', cursor: 'pointer' }}
          onChange={e => {
            const t = Number(e.target.value)
            setCurrentTime(t)
            if (mediaRef.current) mediaRef.current.currentTime = t
          }}
        />
        {/* Buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="vos-btn"
            style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            onClick={togglePlay}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span style={{ fontSize: 11, color: 'var(--vos-text-secondary)', minWidth: 80 }}>
            {fmt(currentTime)} / {duration ? fmt(duration) : '--:--'}
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="vos-btn"
            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}
            onClick={toggleMute}
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            style={{ width: 72, accentColor: 'var(--vos-accent-primary)', cursor: 'pointer' }}
            onChange={e => {
              const v = Number(e.target.value)
              setVolume(v)
              if (mediaRef.current) {
                mediaRef.current.volume = v
                mediaRef.current.muted = v === 0
              }
              setMuted(v === 0)
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Hex viewer ───────────────────────────────────────────────────────────

function HexViewer({ data }: { data: ArrayBuffer }) {
  const bytes = new Uint8Array(data.slice(0, 4096))
  const hex = toHex(bytes)
  return (
    <div className="w-full h-full overflow-auto p-3">
      <div className="text-xs mb-2" style={{ color: 'var(--vos-text-tertiary)' }}>
        Hex dump (first {Math.min(bytes.length, 4096)} bytes)
      </div>
      <pre
        className="text-[11px] m-0"
        style={{
          fontFamily: 'var(--vos-font-mono, monospace)',
          color: 'var(--vos-text-secondary)',
          lineHeight: 1.6,
          whiteSpace: 'pre'
        }}
      >
        {hex}
      </pre>
    </div>
  )
}

// ─── Main file viewer component ────────────────────────────────────────────

export default function FileViewerApp({ windowId }: AppComponentProps) {
  const win = useWindow(windowId)
  const { setTitle } = useWindowActions(windowId)

  const { showFilePicker, closeFilePicker, handleFilePickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'file-viewer'
  })

  const mountId = win?.appState?.mountId as string | undefined
  const node = win?.appState?.node as VfsNode | undefined

  const [textContent, setTextContent] = useState<VfsFileContent | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [hexData, setHexData] = useState<ArrayBuffer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const ext = node ? getExt(node.name) : ''
  const isImage = IMAGE_EXTS.has(ext)
  const isPdf = PDF_EXTS.has(ext)
  const isMd = MD_EXTS.has(ext)
  const isVideo = VIDEO_EXTS.has(ext)
  const isAudio = AUDIO_EXTS.has(ext)
  const isText = node ? isTextFile(node.name) : false
  const isCode = CODE_EXTS.has(ext)

  // Set window title when node changes
  useEffect(() => {
    if (node?.name) setTitle(node.name)
  }, [node?.name, setTitle])

  // Fetch file content
  // biome-ignore lint/correctness/useExhaustiveDependencies: mountId+node.path are real deps
  useEffect(() => {
    if (!mountId || !node) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setTextContent(null)
    setBlobUrl(null)
    setHexData(null)
    setEditing(false)
    let cleanup: (() => void) | null = null

    if (isImage || isPdf || isVideo || isAudio) {
      vfsApi
        .readVfsFileRaw(mountId, node.path)
        .then(blob => {
          const url = URL.createObjectURL(blob)
          setBlobUrl(url)
          cleanup = () => URL.revokeObjectURL(url)
        })
        .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
        .finally(() => setLoading(false))
    } else if (isText) {
      vfsApi
        .readVfsFile(mountId, node.path, 4 * 1024 * 1024)
        .then(r => {
          if (r.data.is_binary) {
            // Reload as raw for hex viewer
            vfsApi
              .readVfsFileRaw(mountId, node.path)
              .then(async blob => {
                const buf = await blob.arrayBuffer()
                setHexData(buf)
              })
              .catch(() => setHexData(null))
              .finally(() => setLoading(false))
          } else {
            setTextContent(r.data)
            setEditContent(r.data.content)
            setLoading(false)
          }
        })
        .catch(e => {
          setError(e instanceof Error ? e.message : '加载失败')
          setLoading(false)
        })
    } else {
      // Unknown / binary
      vfsApi
        .readVfsFileRaw(mountId, node.path)
        .then(async blob => {
          const buf = await blob.arrayBuffer()
          setHexData(buf)
        })
        .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
        .finally(() => setLoading(false))
    }

    return () => {
      cleanup?.()
    }
  }, [mountId, node?.path])

  const handleSave = useCallback(async () => {
    if (!mountId || !node) return
    setSaving(true)
    try {
      await vfsApi.writeVfsFile(mountId, node.path, editContent)
      setEditing(false)
      setTextContent(prev => (prev ? { ...prev, content: editContent } : prev))
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }, [mountId, node, editContent])

  // Ctrl/Cmd+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && editing) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing, handleSave])

  if (!mountId || !node) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
        <FileText size={32} className="opacity-30 mb-2" />
        <span className="ml-2">未指定文件</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar ── */}
      <div
        className="flex items-center px-3 py-2 gap-2 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
      >
        <FileText size={13} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />
        <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--vos-text-primary)' }}>
          {node.name}
        </span>

        {/* Edit / Save buttons for text files */}
        {isText &&
          textContent &&
          !textContent.is_binary &&
          (editing ? (
            <>
              <button
                type="button"
                className="vos-btn vos-btn-primary"
                style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                disabled={saving}
                onClick={handleSave}
              >
                <Save size={11} />
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                className="vos-btn"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  setEditing(false)
                  setEditContent(textContent.content)
                }}
              >
                <X size={11} />
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
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
          </div>
        )}

        {!loading && error && (
          <div className="p-6 text-xs" style={{ color: 'var(--vos-accent-danger)' }}>
            加载失败：{error}
          </div>
        )}

        {/* Image */}
        {!loading && !error && isImage && blobUrl && <ImageViewer src={blobUrl} />}

        {/* PDF */}
        {!loading && !error && isPdf && blobUrl && (
          <embed
            src={`${blobUrl}#toolbar=1&navpanes=0`}
            type="application/pdf"
            style={{ width: '100%', height: '100%' }}
          />
        )}

        {/* Video */}
        {!loading && !error && isVideo && blobUrl && <MediaPlayer src={blobUrl} type="video" />}

        {/* Audio */}
        {!loading && !error && isAudio && blobUrl && <MediaPlayer src={blobUrl} type="audio" />}

        {/* Markdown */}
        {!loading && !error && isMd && textContent && !textContent.is_binary && !editing && (
          <div className="w-full h-full overflow-auto p-6" style={{ color: 'var(--vos-text-primary)' }}>
            <XMarkdown>{textContent.content}</XMarkdown>
          </div>
        )}

        {/* Text / Code — read view */}
        {!loading && !error && isText && !isMd && textContent && !textContent.is_binary && !editing && (
          <div className="w-full h-full overflow-auto">
            {textContent.truncated && (
              <div
                className="px-3 py-1 text-[11px]"
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
              {textContent.content}
            </pre>
          </div>
        )}

        {/* Edit mode (shared for all text including markdown) */}
        {!loading && !error && editing && textContent && !textContent.is_binary && (
          <textarea
            autoFocus
            className="w-full h-full p-3 text-xs resize-none border-none outline-none"
            style={{
              background: 'var(--vos-bg-editor, var(--vos-bg-base))',
              color: 'var(--vos-text-primary)',
              fontFamily: isCode || isMd ? 'var(--vos-font-mono, monospace)' : 'inherit',
              lineHeight: 1.7,
              tabSize: 2
            }}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            spellCheck={false}
          />
        )}

        {/* Hex / Binary */}
        {!loading && !error && hexData && <HexViewer data={hexData} />}
      </div>

      {/* ── Footer ── */}
      {(textContent || node.size !== undefined) && (
        <div
          className="flex items-center gap-4 px-3 py-1.5 text-[11px] flex-shrink-0"
          style={{ borderTop: '0.5px solid var(--vos-border-subtle)', color: 'var(--vos-text-tertiary)' }}
        >
          {textContent && <span>{fmtSize(textContent.size)}</span>}
          {!textContent && node.size !== undefined && node.size !== null && <span>{fmtSize(node.size)}</span>}
          {node.modified && <span>{new Date(node.modified).toLocaleString()}</span>}
        </div>
      )}
      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
        )}
      </AnimatePresence>
    </div>
  )
}
