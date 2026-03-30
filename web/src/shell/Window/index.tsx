import { motion } from 'framer-motion'
import { type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { closeWindow, focusWindow, minimizeWindow, toggleMaximize, useWindowStore, type WindowInstance } from '@/kernel'
import { tokens } from '@/theme'

const TOPBAR_H = tokens.topBar.height
const TITLE_H = tokens.window.titleBarHeight
const MIN_W = tokens.window.minWidth
const MIN_H = tokens.window.minHeight

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null

/* -------- Traffic Lights -------- */
function TrafficLights({
  focused,
  onClose,
  onMinimize,
  onMaximize
}: {
  focused: boolean
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const dot = (color: string, label: string, sym: string, handler: () => void) => (
    <button
      type="button"
      aria-label={label}
      onClick={e => { e.stopPropagation(); handler() }}
      style={{
        width: 12, height: 12, borderRadius: '50%',
        background: focused ? color : 'var(--vos-tl-inactive)',
        border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 7, fontWeight: 700, color: 'rgba(0,0,0,0.45)', lineHeight: 1,
        flexShrink: 0, transition: 'background 0.1s'
      }}
    >
      {hovered && focused ? sym : null}
    </button>
  )

  return (
    <div
      role="presentation"
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {dot('var(--vos-tl-close)', '关闭', '✕', onClose)}
      {dot('var(--vos-tl-minimize)', '最小化', '−', onMinimize)}
      {dot('var(--vos-tl-maximize)', '最大化', '⤢', onMaximize)}
    </div>
  )
}

/* -------- Resize Handles -------- */
function ResizeHandles({ onResizeStart }: { onResizeStart: (dir: ResizeDir, e: React.MouseEvent) => void }) {
  const edge = (dir: ResizeDir, style: React.CSSProperties, cursor: string) => (
    <div
      role="separator"
      aria-label={`resize-${dir}`}
      tabIndex={-1}
      style={{ position: 'absolute', ...style, cursor, zIndex: 10 }}
      onMouseDown={e => { e.stopPropagation(); onResizeStart(dir, e) }}
    />
  )

  return (
    <>
      {edge('n', { top: -3, left: 8, right: 8, height: 6 }, 'ns-resize')}
      {edge('s', { bottom: -3, left: 8, right: 8, height: 6 }, 'ns-resize')}
      {edge('e', { right: -3, top: 8, bottom: 8, width: 6 }, 'ew-resize')}
      {edge('w', { left: -3, top: 8, bottom: 8, width: 6 }, 'ew-resize')}
      {edge('ne', { top: -3, right: -3, width: 12, height: 12 }, 'nesw-resize')}
      {edge('nw', { top: -3, left: -3, width: 12, height: 12 }, 'nwse-resize')}
      {edge('se', { bottom: -3, right: -3, width: 12, height: 12 }, 'nwse-resize')}
      {edge('sw', { bottom: -3, left: -3, width: 12, height: 12 }, 'nesw-resize')}
    </>
  )
}

/* ——— Window Component ——— */
export default function Window({ win, children }: { win: WindowInstance; children: ReactNode }) {
  const moveWindow = useWindowStore(s => s.moveWindow)
  const resizeWindow = useWindowStore(s => s.resizeWindow)
  const shouldRender = !win.isMinimized

  // Drag state
  const dragRef = useRef<{
    startX: number
    startY: number
    winX: number
    winY: number
  } | null>(null)
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 })
  const isDragging = dragRef.current !== null

  // Resize state
  const resizeRef = useRef<{
    dir: ResizeDir
    startX: number
    startY: number
    winX: number
    winY: number
    winW: number
    winH: number
  } | null>(null)
  const [resizeDelta, setResizeDelta] = useState({ dx: 0, dy: 0, dw: 0, dh: 0 })
  const isResizing = resizeRef.current !== null

  /* ---- Drag handlers ---- */
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) return
      e.preventDefault()
      focusWindow(win.id)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        winX: win.x,
        winY: win.y
      }
      setDragDelta({ x: 0, y: 0 })
    },
    [win.id, win.x, win.y, win.isMaximized, focusWindow]
  )

  useEffect(() => {
    if (!isDragging && !isResizing) return

    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        setDragDelta({
          x: e.clientX - dragRef.current.startX,
          y: e.clientY - dragRef.current.startY
        })
      }
      if (resizeRef.current) {
        const r = resizeRef.current
        const dx = e.clientX - r.startX
        const dy = e.clientY - r.startY
        let dw = 0
        let dh = 0
        let mx = 0
        let my = 0

        if (r.dir?.includes('e')) dw = dx
        if (r.dir?.includes('w')) {
          dw = -dx
          mx = dx
        }
        if (r.dir?.includes('s')) dh = dy
        if (r.dir?.includes('n')) {
          dh = -dy
          my = dy
        }

        // Enforce minimums
        const newW = Math.max(MIN_W, r.winW + dw)
        const newH = Math.max(MIN_H, r.winH + dh)
        dw = newW - r.winW
        dh = newH - r.winH

        if (r.dir?.includes('w'))
          mx =
            -(dw - 0) +
            (r.winW + (e.clientX - r.startX) < MIN_W
              ? 0
              : e.clientX - r.startX + (r.winW - MIN_W) < 0
                ? r.winW - MIN_W
                : 0)
        // Simplify: recalculate mx based on actual dw
        mx = r.dir?.includes('w') ? r.winW - newW : 0
        my = r.dir?.includes('n') ? r.winH - newH : 0

        setResizeDelta({ dx: mx, dy: my, dw, dh })
      }
    }

    const onMouseUp = () => {
      if (dragRef.current) {
        const d = dragRef.current
        moveWindow(win.id, d.winX + (dragDelta.x || 0), d.winY + (dragDelta.y || 0))
        dragRef.current = null
        setDragDelta({ x: 0, y: 0 })
      }
      if (resizeRef.current) {
        const r = resizeRef.current
        const newW = Math.max(MIN_W, r.winW + resizeDelta.dw)
        const newH = Math.max(MIN_H, r.winH + resizeDelta.dh)
        moveWindow(win.id, r.winX + resizeDelta.dx, r.winY + resizeDelta.dy)
        resizeWindow(win.id, newW, newH)
        resizeRef.current = null
        setResizeDelta({ dx: 0, dy: 0, dw: 0, dh: 0 })
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, isResizing, dragDelta, resizeDelta, win.id, moveWindow, resizeWindow])

  const onResizeStart = useCallback(
    (dir: ResizeDir, e: React.MouseEvent) => {
      if (win.isMaximized) return
      e.preventDefault()
      e.stopPropagation()
      focusWindow(win.id)
      resizeRef.current = {
        dir,
        startX: e.clientX,
        startY: e.clientY,
        winX: win.x,
        winY: win.y,
        winW: win.width,
        winH: win.height
      }
      setResizeDelta({ dx: 0, dy: 0, dw: 0, dh: 0 })
    },
    [win.id, win.x, win.y, win.width, win.height, win.isMaximized, focusWindow]
  )

  const isMax = win.isMaximized
  const left = isMax ? 0 : win.x + dragDelta.x + resizeDelta.dx
  const top = isMax ? TOPBAR_H : win.y + dragDelta.y + resizeDelta.dy
  const width = isMax ? '100%' : win.width + resizeDelta.dw
  const height = isMax ? `calc(100dvh - ${TOPBAR_H}px)` : win.height + resizeDelta.dh

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={{
        opacity: win.isMinimized ? 0 : 1,
        scale: win.isMinimized ? 0.88 : 1,
        y: win.isMinimized ? 40 : 0,
        pointerEvents: win.isMinimized ? 'none' : 'auto'
      } as Parameters<typeof motion.div>[0]['animate']}
      exit={{ opacity: 0, scale: 0.92, y: 12 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        zIndex: win.zIndex,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: isMax ? 0 : tokens.radius.window,
        overflow: 'hidden',
        boxShadow: win.isFocused ? tokens.shadow.windowFocused : tokens.shadow.window,
        border: '0.5px solid var(--vos-border-subtle)',
        background: win.isFocused ? 'var(--vos-bg-window-active)' : 'var(--vos-bg-window)'
      }}
      onMouseDown={() => { if (!win.isFocused) focusWindow(win.id) }}
    >
      {/* ---- Title bar ---- */}
      <div
        role="presentation"
        style={{
          height: TITLE_H,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 12,
          flexShrink: 0,
          background: 'var(--vos-bg-window-title)',
          backdropFilter: `blur(${tokens.blur.surface}px)`,
          WebkitBackdropFilter: `blur(${tokens.blur.surface}px)`,
          borderBottom: '0.5px solid var(--vos-border-subtle)',
          cursor: isMax ? 'default' : 'grab',
          userSelect: 'none'
        }}
        onMouseDown={onDragStart}
        onDoubleClick={() => toggleMaximize(win.id)}
      >
        <TrafficLights
          focused={win.isFocused}
          onClose={() => closeWindow(win.id)}
          onMinimize={() => minimizeWindow(win.id)}
          onMaximize={() => toggleMaximize(win.id)}
        />
        <div style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 500,
          color: win.isFocused ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingLeft: 8,
          paddingRight: 8
        }}>
          {win.title}
        </div>
        <div style={{ width: 52, flexShrink: 0 }} />
      </div>

      {/* ---- Content with virtual rendering ---- */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {shouldRender ? (
          <Suspense fallback={
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: 20, height: 20,
                border: '2px solid var(--vos-border-default)',
                borderTopColor: 'var(--vos-accent-primary)',
                borderRadius: '50%',
                animation: 'vos-spin 0.7s linear infinite'
              }} />
            </div>
          }>
            {children}
          </Suspense>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vos-text-tertiary)', fontSize: 13 }}>
            进程已暂停
          </div>
        )}
      </div>

      {/* ---- Resize handles ---- */}
      {!isMax && <ResizeHandles onResizeStart={onResizeStart} />}
    </motion.div>
  )
}
