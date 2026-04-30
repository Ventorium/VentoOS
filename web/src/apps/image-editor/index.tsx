/**
 * Image Editor App
 *
 * Canvas-based image editor with:
 * - Rotate (90°CW / 90°CCW / 180°)
 * - Scale / Zoom (fit, 1:1, zoom in/out)
 * - Crop (drag-select region)
 * - Brush tool (freehand drawing with color/size)
 * - Eraser tool
 * - Flip (H/V)
 * - Export to PNG / JPG / WEBP with quality control
 */

import { AnimatePresence } from 'framer-motion'
import {
  Crop,
  Download,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Minus,
  Move,
  Paintbrush,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Undo2,
  X,
  ZoomIn
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { vfsApi } from '@/apps/explorer/api'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/services/auth'
import { VfsFilePickerModal } from '@/shell/FilePicker'

type Tool = 'move' | 'brush' | 'eraser' | 'crop'

interface HistoryEntry {
  imageData: ImageData
}

export default function ImageEditor({ windowId, initialAppState }: AppComponentProps) {
  const [mountId, setMountId] = useState((initialAppState?.mountId as string) ?? '')
  const [node, setNode] = useState(initialAppState?.node as { name: string; path: string } | undefined)
  const sourceUrl = (initialAppState?.sourceUrl as string) ?? ''
  const readOnly = (initialAppState?.readOnly as boolean) ?? false

  const { setTitle } = useWindowActions(windowId)

  const handleOpenFile = useCallback(
    (result: VfsPickerResult) => {
      const name = result.path.split('/').filter(Boolean).pop() ?? result.path
      setMountId(result.mountId)
      setNode({ path: result.path, name })
      setTitle(name)
    },
    [setTitle]
  )

  const { showFilePicker, closeFilePicker, handleFilePickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'image-editor',
    onOpenFile: handleOpenFile
  })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingImgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [tool, setTool] = useState<Tool>('move')
  const [brushColor, setBrushColor] = useState('#ff0000')
  const [brushSize, setBrushSize] = useState(4)
  const [zoom, setZoom] = useState(1)

  // History for undo/redo
  const historyRef = useRef<HistoryEntry[]>([])
  const historyIdxRef = useRef(-1)
  const savedIdxRef = useRef(0)

  // Drawing state
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  // Crop state
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const cropStartRef = useRef<{ x: number; y: number } | null>(null)

  // Pan state
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // Brush cursor follower
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)

  // Export dialog
  const [showExport, setShowExport] = useState(false)
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png')
  const [exportQuality, setExportQuality] = useState(100)
  const [showExportPicker, setShowExportPicker] = useState(false)

  // Image dimensions
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [dirty, setDirty] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const idx = historyIdxRef.current + 1
    historyRef.current = historyRef.current.slice(0, idx)
    historyRef.current.push({ imageData: data })
    historyIdxRef.current = idx
    setDirty(idx !== savedIdxRef.current)
    setCanUndo(idx > 0)
    setCanRedo(false)
  }, [])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    const entry = historyRef.current[historyIdxRef.current]
    const canvas = canvasRef.current
    if (!canvas || !entry) return
    canvas.width = entry.imageData.width
    canvas.height = entry.imageData.height
    const ctx = canvas.getContext('2d')
    ctx?.putImageData(entry.imageData, 0, 0)
    setImgSize({ w: entry.imageData.width, h: entry.imageData.height })
    setDirty(historyIdxRef.current !== savedIdxRef.current)
    setCanUndo(historyIdxRef.current > 0)
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1)
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    const entry = historyRef.current[historyIdxRef.current]
    const canvas = canvasRef.current
    if (!canvas || !entry) return
    canvas.width = entry.imageData.width
    canvas.height = entry.imageData.height
    const ctx = canvas.getContext('2d')
    ctx?.putImageData(entry.imageData, 0, 0)
    setImgSize({ w: entry.imageData.width, h: entry.imageData.height })
    setDirty(historyIdxRef.current !== savedIdxRef.current)
    setCanUndo(historyIdxRef.current > 0)
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1)
  }, [])

  // Load image from VFS or sourceUrl
  useEffect(() => {
    if (!sourceUrl && (!mountId || !node)) {
      setError('No file specified')
      return
    }

    const token = useAuthStore.getState().token
    const url = sourceUrl || `/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node!.path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      pendingImgRef.current = img
      setLoaded(true)
    }
    img.onerror = () => setError('Failed to load image')
    img.src = url
  }, [mountId, node, sourceUrl])

  // Draw image to canvas once loaded and canvas is mounted
  useEffect(() => {
    if (!loaded) return
    const img = pendingImgRef.current
    if (!img) return
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0)
      pushHistory()
      savedIdxRef.current = 0
      setDirty(false)
    }
    // Fit to view
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth - 40
      const ch = containerRef.current.clientHeight - 40
      const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1)
      setZoom(scale)
    }
    pendingImgRef.current = null
    setOffset({ x: 0, y: 0 })
  }, [loaded, pushHistory])

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setZoom(z => Math.min(10, Math.max(0.1, z * factor)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Transform operations ──

  const rotate = useCallback(
    (deg: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = canvas.width
      tmpCanvas.height = canvas.height
      tmpCanvas.getContext('2d')?.putImageData(imgData, 0, 0)

      if (deg === 90 || deg === -90 || deg === 270) {
        canvas.width = imgData.height
        canvas.height = imgData.width
      }
      setImgSize({ w: canvas.width, h: canvas.height })

      ctx.save()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((deg * Math.PI) / 180)
      ctx.drawImage(tmpCanvas, -tmpCanvas.width / 2, -tmpCanvas.height / 2)
      ctx.restore()
      pushHistory()
    },
    [pushHistory]
  )

  const flip = useCallback(
    (dir: 'h' | 'v') => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = canvas.width
      tmpCanvas.height = canvas.height
      tmpCanvas.getContext('2d')?.putImageData(imgData, 0, 0)

      ctx.save()
      if (dir === 'h') {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      } else {
        ctx.translate(0, canvas.height)
        ctx.scale(1, -1)
      }
      ctx.drawImage(tmpCanvas, 0, 0)
      ctx.restore()
      pushHistory()
    },
    [pushHistory]
  )

  const applyCrop = useCallback(() => {
    if (!cropRect) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y, w, h } = cropRect
    if (w <= 0 || h <= 0) return
    const imgData = ctx.getImageData(x, y, w, h)
    canvas.width = w
    canvas.height = h
    ctx.putImageData(imgData, 0, 0)
    setImgSize({ w, h })
    setCropRect(null)
    pushHistory()
  }, [cropRect, pushHistory])

  // ── Canvas event handlers ──

  const getCanvasPos = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom
      }
    },
    [zoom]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pos = getCanvasPos(e)

      if (tool === 'move') {
        panStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
        return
      }

      if (tool === 'crop') {
        cropStartRef.current = pos
        setCropRect(null)
        return
      }

      if (tool === 'brush' || tool === 'eraser') {
        isDrawingRef.current = true
        lastPosRef.current = pos
        const ctx = canvasRef.current?.getContext('2d')
        if (!ctx) return
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        if (tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out'
        } else {
          ctx.globalCompositeOperation = 'source-over'
          ctx.strokeStyle = brushColor
        }
        ctx.lineWidth = brushSize / zoom
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }
    },
    [tool, getCanvasPos, brushColor, brushSize, zoom, offset]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (tool === 'move' && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x
        const dy = e.clientY - panStartRef.current.y
        setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy })
        return
      }

      if (tool === 'crop' && cropStartRef.current) {
        const pos = getCanvasPos(e)
        const sx = cropStartRef.current.x
        const sy = cropStartRef.current.y
        setCropRect({
          x: Math.min(sx, pos.x),
          y: Math.min(sy, pos.y),
          w: Math.abs(pos.x - sx),
          h: Math.abs(pos.y - sy)
        })
        return
      }

      if (isDrawingRef.current && (tool === 'brush' || tool === 'eraser')) {
        const pos = getCanvasPos(e)
        const ctx = canvasRef.current?.getContext('2d')
        if (!ctx) return
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
        lastPosRef.current = pos
      }
    },
    [tool, getCanvasPos]
  )

  const handleMouseUp = useCallback(() => {
    if (panStartRef.current) {
      panStartRef.current = null
    }
    if (cropStartRef.current) {
      cropStartRef.current = null
    }
    if (isDrawingRef.current) {
      isDrawingRef.current = false
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over'
      }
      pushHistory()
    }
  }, [pushHistory])

  const handleExport = useCallback(() => {
    setShowExport(false)
    setShowExportPicker(true)
  }, [])

  // Save to original VFS file (overwrite)
  const handleSave = useCallback(async () => {
    if (!mountId || !node || readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ext = node.name.split('.').pop()?.toLowerCase() ?? 'png'
    let mimeType = 'image/png'
    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
    else if (ext === 'webp') mimeType = 'image/webp'

    canvas.toBlob(async blob => {
      if (!blob) return
      const file = new File([blob], node.name, { type: mimeType })
      try {
        await vfsApi.uploadVfsFile(mountId, node.path, file)
        savedIdxRef.current = historyIdxRef.current
        setDirty(false)
      } catch (err) {
        console.error('Save failed:', err)
      }
    }, mimeType)
  }, [mountId, node, readOnly])

  // Export to VFS directory
  const handleExportConfirm = useCallback(
    async (result: VfsPickerResult) => {
      setShowExportPicker(false)
      const canvas = canvasRef.current
      if (!canvas) return

      const mimeType = `image/${exportFormat}`
      const quality = exportFormat === 'png' ? undefined : exportQuality / 100
      const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat
      const baseName = node?.name?.replace(/\.[^.]+$/, '') ?? 'image'
      const fileName = `${baseName}.${ext}`

      canvas.toBlob(async blob => {
        if (!blob) return
        const destDir = result.path.replace(/^vfs:\/\/[^/]+/, '') || '/'
        const destPath = destDir === '/' ? `/${fileName}` : `${destDir}/${fileName}`
        const file = new File([blob], fileName, { type: mimeType })
        try {
          await vfsApi.uploadVfsFile(result.mountId, destPath, file)
        } catch (err) {
          console.error('Export failed:', err)
        }
      }, mimeType, quality)
    },
    [exportFormat, exportQuality, node]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 's') {
        e.preventDefault()
        if (dirty) handleSave()
      } else if (mod && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        redo()
      } else if (mod && e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, undo, redo, dirty])

  // ── Tool button style ──
  const toolBtn = (active: boolean) =>
    cn(
      'vos-flex-center w-[32px] h-[32px] rounded-md border-none cursor-pointer',
      active ? 'bg-[var(--vos-accent-primary)] text-white' : 'bg-transparent text-[var(--vos-text-secondary)]'
    )

  if (error) {
    return <div className="w-full h-full vos-flex-center text-[var(--vos-text-tertiary)] text-[13px]">{error}</div>
  }

  if (!loaded) {
    return <div className="w-full h-full vos-flex-center text-[var(--vos-text-tertiary)] text-[13px]">加载中…</div>
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--vos-bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-[2px] px-2 py-1 border-b border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-secondary)] shrink-0 flex-wrap">
        {/* Save */}
        {!readOnly && mountId && node && (
          <button
            type="button"
            title="保存 (⌘S)"
            className={toolBtn(dirty)}
            disabled={!dirty}
            style={!dirty ? { opacity: 0.4, cursor: 'default' } : undefined}
            onClick={handleSave}
          >
            <Save size={16} />
          </button>
        )}

        {/* Tools group */}
        <button type="button" title="移动" className={toolBtn(tool === 'move')} onClick={() => setTool('move')}>
          <Move size={16} />
        </button>
        {!readOnly && (
          <>
            <button type="button" title="画笔" className={toolBtn(tool === 'brush')} onClick={() => setTool('brush')}>
              <Paintbrush size={16} />
            </button>
            <button type="button" title="橡皮擦" className={toolBtn(tool === 'eraser')} onClick={() => setTool('eraser')}>
              <Eraser size={16} />
            </button>
            <button type="button" title="裁剪" className={toolBtn(tool === 'crop')} onClick={() => setTool('crop')}>
              <Crop size={16} />
            </button>
          </>
        )}

        {!readOnly && (
          <>
            <div className="w-px h-[20px] bg-[var(--vos-border-subtle)] mx-1" />

            {/* Brush options */}
            {(tool === 'brush' || tool === 'eraser') && (
              <>
                {tool === 'brush' && (
                  <input
                    type="color"
                    value={brushColor}
                    onChange={e => setBrushColor(e.target.value)}
                    className="w-[28px] h-[28px] border-none rounded cursor-pointer p-0"
                    title="画笔颜色"
                  />
                )}
                <div className="flex items-center gap-1 text-[11px] text-[var(--vos-text-secondary)]">
                  <Minus size={12} />
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={brushSize}
                    onChange={e => setBrushSize(Number(e.target.value))}
                    className="w-[80px] accent-[var(--vos-accent-primary)]"
                  />
                  <Plus size={12} />
                  <span className="min-w-[20px]">{brushSize}</span>
                </div>
              </>
            )}

            {/* Transform group */}
            <div className="w-px h-[20px] bg-[var(--vos-border-subtle)] mx-1" />
            <button type="button" title="逆时针旋转" className={toolBtn(false)} onClick={() => rotate(-90)}>
              <RotateCcw size={16} />
            </button>
            <button type="button" title="顺时针旋转" className={toolBtn(false)} onClick={() => rotate(90)}>
              <RotateCw size={16} />
            </button>
            <button type="button" title="水平翻转" className={toolBtn(false)} onClick={() => flip('h')}>
              <FlipHorizontal2 size={16} />
            </button>
            <button type="button" title="垂直翻转" className={toolBtn(false)} onClick={() => flip('v')}>
              <FlipVertical2 size={16} />
            </button>

            {cropRect && (
              <button
                type="button"
                title="应用裁剪"
                className={cn(toolBtn(false), 'bg-[var(--vos-accent-success)] text-white text-[11px] w-auto px-2')}
                onClick={applyCrop}
              >
                应用裁剪
              </button>
            )}

            <div className="w-px h-[20px] bg-[var(--vos-border-subtle)] mx-1" />

            {/* Undo / Redo */}
            <button
              type="button"
              title="撤销"
              className={toolBtn(false)}
              disabled={!canUndo}
              style={!canUndo ? { opacity: 0.4, cursor: 'default' } : undefined}
              onClick={undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              title="重做"
              className={toolBtn(false)}
              disabled={!canRedo}
              style={!canRedo ? { opacity: 0.4, cursor: 'default' } : undefined}
              onClick={redo}
            >
              <Redo2 size={16} />
            </button>
          </>
        )}

        <div className="w-px h-[20px] bg-[var(--vos-border-subtle)] mx-1" />

        {/* Zoom */}
        <button
          type="button"
          title="缩小"
          className={toolBtn(false)}
          onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
        >
          <Minus size={14} />
        </button>
        <span className="text-[11px] text-[var(--vos-text-secondary)] min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          title="放大"
          className={toolBtn(false)}
          onClick={() => setZoom(z => Math.min(10, z + 0.1))}
        >
          <ZoomIn size={14} />
        </button>

        <div className="flex-1" />

        {/* Info */}
        <span className="text-[11px] text-[var(--vos-text-tertiary)]">
          {imgSize.w} × {imgSize.h}
        </span>

        {/* Export */}
        <button
          type="button"
          className={cn(toolBtn(false), 'w-auto px-[10px] gap-1 flex text-xs')}
          onClick={() => setShowExport(true)}
        >
          <Download size={14} />
          导出
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{
          background: 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 16px 16px',
          cursor:
            tool === 'brush' || tool === 'eraser'
              ? 'none'
              : tool === 'move'
                ? 'grab'
                : tool === 'crop'
                  ? 'crosshair'
                  : 'default'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={e => {
          handleMouseMove(e)
          if (tool === 'brush' || tool === 'eraser') {
            setCursorPos({ x: e.clientX, y: e.clientY })
          }
        }}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp()
          setCursorPos(null)
        }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)` }}
        >
          <canvas
            ref={canvasRef}
            className="block"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              imageRendering: zoom > 2 ? 'pixelated' : 'auto'
            }}
          />
          {/* Crop overlay */}
          {cropRect && (
            <div
              className="absolute border-2 border-dashed border-[var(--vos-accent-primary)] bg-[rgba(59,130,246,0.1)] pointer-events-none"
              style={{
                left: cropRect.x * zoom,
                top: cropRect.y * zoom,
                width: cropRect.w * zoom,
                height: cropRect.h * zoom
              }}
            />
          )}
        </div>
        {/* Brush cursor follower */}
        {(tool === 'brush' || tool === 'eraser') && cursorPos && (
          <div
            className="fixed pointer-events-none border border-[var(--vos-text-primary)] rounded-full"
            style={{
              width: brushSize,
              height: brushSize,
              left: cursorPos.x - brushSize / 2,
              top: cursorPos.y - brushSize / 2,
              opacity: 0.8,
              zIndex: 9999
            }}
          />
        )}
      </div>

      {/* Export dialog */}
      {showExport && (
        <div
          className="absolute inset-0 vos-flex-center z-[100]"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowExport(false)}
          onKeyDown={e => e.key === 'Escape' && setShowExport(false)}
        >
          <div
            className="rounded-xl p-5 w-[320px] flex flex-col gap-3"
            style={{ backgroundColor: 'var(--vos-bg-secondary)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold text-sm" style={{ color: 'var(--vos-text-primary)' }}>导出图片</span>
              <button
                type="button"
                onClick={() => setShowExport(false)}
                className="bg-transparent border-none cursor-pointer"
                style={{ color: 'var(--vos-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>格式</label>
              <div className="flex gap-[6px]">
                {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setExportFormat(fmt)}
                    className="flex-1 py-[6px] rounded-md cursor-pointer text-xs"
                    style={{
                      color: 'var(--vos-text-primary)',
                      border:
                        exportFormat === fmt
                          ? '2px solid var(--vos-accent-primary)'
                          : '1px solid var(--vos-border-subtle)',
                      background: exportFormat === fmt ? 'var(--vos-accent-primary-bg)' : 'transparent',
                      fontWeight: exportFormat === fmt ? 600 : 400
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>质量: {exportQuality}%</label>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={exportQuality}
                onChange={e => setExportQuality(Number(e.target.value))}
                className="accent-[var(--vos-accent-primary)]"
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
              className="py-2 rounded-lg border-none text-white cursor-pointer font-semibold text-[13px]"
              style={{ backgroundColor: 'var(--vos-accent-primary)' }}
            >
              导出
            </button>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
        )}
        {showExportPicker && (
          <VfsFilePickerModal mode="directory" onConfirm={handleExportConfirm} onClose={() => setShowExportPicker(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
