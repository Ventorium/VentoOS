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
  Undo2,
  X,
  ZoomIn
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppComponentProps } from '@/kernel'
import { apiClient } from '@/infra/api'

type Tool = 'move' | 'brush' | 'eraser' | 'crop'

interface HistoryEntry {
  imageData: ImageData
}

export default function ImageEditor({ initialAppState }: AppComponentProps) {
  const mountId = (initialAppState?.mountId as string) ?? ''
  const node = initialAppState?.node as { name: string; path: string } | undefined

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [tool, setTool] = useState<Tool>('move')
  const [brushColor, setBrushColor] = useState('#ff0000')
  const [brushSize, setBrushSize] = useState(4)
  const [zoom, setZoom] = useState(1)

  // History for undo/redo
  const historyRef = useRef<HistoryEntry[]>([])
  const historyIdxRef = useRef(-1)

  // Drawing state
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  // Crop state
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const cropStartRef = useRef<{ x: number; y: number } | null>(null)

  // Pan state
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // Export dialog
  const [showExport, setShowExport] = useState(false)
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png')
  const [exportQuality, setExportQuality] = useState(90)

  // Image dimensions
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })

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
  }, [])

  // Load image from VFS
  useEffect(() => {
    if (!mountId || !node) {
      setError('No file specified')
      return
    }

    const url = `${apiClient.defaults.baseURL ?? ''}/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node.path)}`
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        pushHistory()
      }
      setLoaded(true)
      // Fit to view
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth - 40
        const ch = containerRef.current.clientHeight - 40
        const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1)
        setZoom(scale)
      }
    }
    img.onerror = () => setError('Failed to load image')
    img.src = url
  }, [mountId, node, pushHistory])

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
    const canvas = canvasRef.current
    if (!canvas) return
    const mimeType = `image/${exportFormat}`
    const quality = exportFormat === 'png' ? undefined : exportQuality / 100
    const dataUrl = canvas.toDataURL(mimeType, quality)

    const a = document.createElement('a')
    const baseName = node?.name?.replace(/\.[^.]+$/, '') ?? 'image'
    a.download = `${baseName}.${exportFormat === 'jpeg' ? 'jpg' : exportFormat}`
    a.href = dataUrl
    a.click()
    setShowExport(false)
  }, [exportFormat, exportQuality, node])

  // ── Tool button style ──
  const toolBtn = (active: boolean) =>
    ({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: 6,
      border: 'none',
      cursor: 'pointer',
      background: active ? 'var(--vos-accent-primary)' : 'transparent',
      color: active ? '#fff' : 'var(--vos-text-secondary)'
    }) as const

  if (error) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--vos-text-tertiary)',
          fontSize: 13
        }}
      >
        {error}
      </div>
    )
  }

  if (!loaded) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--vos-text-tertiary)',
          fontSize: 13
        }}
      >
        加载中…
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--vos-bg-primary)' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '4px 8px',
          borderBottom: '1px solid var(--vos-border-subtle)',
          background: 'var(--vos-bg-secondary)',
          flexShrink: 0,
          flexWrap: 'wrap'
        }}
      >
        {/* Tools group */}
        <button type="button" title="移动" style={toolBtn(tool === 'move')} onClick={() => setTool('move')}>
          <Move size={16} />
        </button>
        <button type="button" title="画笔" style={toolBtn(tool === 'brush')} onClick={() => setTool('brush')}>
          <Paintbrush size={16} />
        </button>
        <button type="button" title="橡皮擦" style={toolBtn(tool === 'eraser')} onClick={() => setTool('eraser')}>
          <Eraser size={16} />
        </button>
        <button type="button" title="裁剪" style={toolBtn(tool === 'crop')} onClick={() => setTool('crop')}>
          <Crop size={16} />
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--vos-border-subtle)', margin: '0 4px' }} />

        {/* Brush options */}
        {(tool === 'brush' || tool === 'eraser') && (
          <>
            {tool === 'brush' && (
              <input
                type="color"
                value={brushColor}
                onChange={e => setBrushColor(e.target.value)}
                style={{ width: 28, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }}
                title="画笔颜色"
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--vos-text-secondary)' }}>
              <Minus size={12} />
              <input
                type="range"
                min={1}
                max={50}
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                style={{ width: 80, accentColor: 'var(--vos-accent-primary)' }}
              />
              <Plus size={12} />
              <span style={{ minWidth: 20 }}>{brushSize}</span>
            </div>
          </>
        )}

        {/* Transform group */}
        <div style={{ width: 1, height: 20, background: 'var(--vos-border-subtle)', margin: '0 4px' }} />
        <button type="button" title="逆时针旋转" style={toolBtn(false)} onClick={() => rotate(-90)}>
          <RotateCcw size={16} />
        </button>
        <button type="button" title="顺时针旋转" style={toolBtn(false)} onClick={() => rotate(90)}>
          <RotateCw size={16} />
        </button>
        <button type="button" title="水平翻转" style={toolBtn(false)} onClick={() => flip('h')}>
          <FlipHorizontal2 size={16} />
        </button>
        <button type="button" title="垂直翻转" style={toolBtn(false)} onClick={() => flip('v')}>
          <FlipVertical2 size={16} />
        </button>

        {cropRect && (
          <button
            type="button"
            title="应用裁剪"
            style={{
              ...toolBtn(false),
              background: 'var(--vos-accent-success)',
              color: '#fff',
              fontSize: 11,
              width: 'auto',
              padding: '0 8px'
            }}
            onClick={applyCrop}
          >
            应用裁剪
          </button>
        )}

        <div style={{ width: 1, height: 20, background: 'var(--vos-border-subtle)', margin: '0 4px' }} />

        {/* Undo / Redo */}
        <button type="button" title="撤销" style={toolBtn(false)} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button type="button" title="重做" style={toolBtn(false)} onClick={redo}>
          <Redo2 size={16} />
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--vos-border-subtle)', margin: '0 4px' }} />

        {/* Zoom */}
        <button type="button" title="缩小" style={toolBtn(false)} onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>
          <Minus size={14} />
        </button>
        <span style={{ fontSize: 11, color: 'var(--vos-text-secondary)', minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" title="放大" style={toolBtn(false)} onClick={() => setZoom(z => Math.min(10, z + 0.1))}>
          <ZoomIn size={14} />
        </button>

        <div style={{ flex: 1 }} />

        {/* Info */}
        <span style={{ fontSize: 11, color: 'var(--vos-text-tertiary)' }}>
          {imgSize.w} × {imgSize.h}
        </span>

        {/* Export */}
        <button
          type="button"
          style={{
            ...toolBtn(false),
            width: 'auto',
            padding: '0 10px',
            gap: 4,
            display: 'flex',
            fontSize: 12
          }}
          onClick={() => setShowExport(true)}
        >
          <Download size={14} />
          导出
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 16px 16px',
          cursor:
            tool === 'move'
              ? 'grab'
              : tool === 'crop'
                ? 'crosshair'
                : tool === 'brush' || tool === 'eraser'
                  ? 'crosshair'
                  : 'default'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              imageRendering: zoom > 2 ? 'pixelated' : 'auto'
            }}
          />
          {/* Crop overlay */}
          {cropRect && (
            <div
              style={{
                position: 'absolute',
                left: cropRect.x * zoom,
                top: cropRect.y * zoom,
                width: cropRect.w * zoom,
                height: cropRect.h * zoom,
                border: '2px dashed var(--vos-accent-primary)',
                background: 'rgba(59,130,246,0.1)',
                pointerEvents: 'none'
              }}
            />
          )}
        </div>
      </div>

      {/* Export dialog */}
      {showExport && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            zIndex: 100
          }}
          onClick={() => setShowExport(false)}
        >
          <div
            style={{
              background: 'var(--vos-bg-secondary)',
              borderRadius: 12,
              padding: 20,
              width: 320,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--vos-text-primary)' }}>导出图片</span>
              <button
                type="button"
                onClick={() => setShowExport(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vos-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--vos-text-secondary)' }}>格式</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setExportFormat(fmt)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: 6,
                      border: exportFormat === fmt ? '2px solid var(--vos-accent-primary)' : '1px solid var(--vos-border-subtle)',
                      background: exportFormat === fmt ? 'var(--vos-accent-primary-bg)' : 'transparent',
                      color: 'var(--vos-text-primary)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: exportFormat === fmt ? 600 : 400
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {exportFormat !== 'png' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, color: 'var(--vos-text-secondary)' }}>质量: {exportQuality}%</label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={exportQuality}
                  onChange={e => setExportQuality(Number(e.target.value))}
                  style={{ accentColor: 'var(--vos-accent-primary)' }}
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleExport}
              style={{
                padding: '8px 0',
                borderRadius: 8,
                border: 'none',
                background: 'var(--vos-accent-primary)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13
              }}
            >
              导出
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
