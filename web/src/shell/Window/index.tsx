import { motion, useAnimationControls } from 'framer-motion'
import { type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import { closeWindow, focusWindow, minimizeWindow, toggleMaximize, useWindowStore, useMenuStore, type WindowInstance } from '@/kernel'
import type { AppMenuEntry, AppMenuGroup, AppMenuItem } from '@/kernel'
import { useDockPositionStore } from '@/shell/Dock/dockPositionStore'
import { useSettingsStore } from '@/services/settings'
import { tokens } from '@/theme'

const TOPBAR_H = tokens.topBar.height
const TITLE_H = tokens.window.titleBarHeight
const MIN_W = tokens.window.minWidth
const MIN_H = tokens.window.minHeight

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null

/* -------- Traffic Lights -------- */
// Inline SVG icons for pixel-perfect centering (6×6 canvas, stroke-width 1.5)
const TlClose = () => (
  <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
    <line x1="1" y1="1" x2="5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="5" y1="1" x2="1" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
const TlMinimize = () => (
  <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
    <line x1="1" y1="3" x2="5" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
const TlMaximize = () => (
  <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
    <polyline points="1,3.5 1,5 2.5,5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="4.5,1 5,1 5,2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="1" y1="5" x2="5" y2="1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

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

  const dot = (color: string, label: string, Icon: () => React.ReactElement, handler: () => void) => (
    <button
      type="button"
      aria-label={label}
      onClick={e => {
        e.stopPropagation()
        handler()
      }}
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: focused ? color : 'var(--vos-tl-inactive)',
        border: focused ? 'none' : '0.5px solid rgba(128,128,128,0.3)',
        cursor: 'pointer',
        padding: 0,
        color: 'rgba(0,0,0,0.55)',
        flexShrink: 0,
        transition: 'background 0.1s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
      }}
    >
      {hovered ? <Icon /> : null}
    </button>
  )

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: window control hover detection
    <div
      role="presentation"
      className="vos-flex-row"
      style={{ gap: 6 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {dot('var(--vos-tl-close)', '关闭', TlClose, onClose)}
      {dot('var(--vos-tl-minimize)', '最小化', TlMinimize, onMinimize)}
      {dot('var(--vos-tl-maximize)', '最大化', TlMaximize, onMaximize)}
    </div>
  )
}

/* -------- Resize Handles -------- */
function ResizeHandles({ onResizeStart }: { onResizeStart: (dir: ResizeDir, e: React.MouseEvent) => void }) {
  const edge = (dir: ResizeDir, style: React.CSSProperties, cursor: string) => (
    // biome-ignore lint/a11y/useSemanticElements: resize handle needs exact CSS positioning
    <div
      role="separator"
      aria-valuenow={50}
      aria-label={`resize-${dir}`}
      tabIndex={-1}
      style={{ position: 'absolute', ...style, cursor, zIndex: 10 }}
      onMouseDown={e => {
        e.stopPropagation()
        onResizeStart(dir, e)
      }}
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

/* -------- Menu Dropdown -------- */

function MenuDropdown({
  group,
  anchorEl,
  onClose,
  onHoverGroup,
}: {
  group: AppMenuGroup
  anchorEl: HTMLElement
  onClose: () => void
  onHoverGroup?: (groupId: string) => void
}) {
  const rect = anchorEl.getBoundingClientRect()
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && e.target !== anchorEl) {
        onClose()
      }
    }
    // Slight delay so the opener click doesn't immediately close
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [anchorEl, onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const visible = group.items.filter(item => !('type' in item) || item.type !== 'separator')
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, visible.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const idx = group.items.findIndex((item, i) => {
          if ('type' in item) return false
          const visIdx = group.items.slice(0, i + 1).filter(x => !('type' in x)).length - 1
          return visIdx === focusedIdx
        })
        if (idx >= 0) {
          const item = group.items[idx] as AppMenuItem
          if (!item.disabled) { item.action?.(); onClose() }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [group.items, focusedIdx, onClose])

  let visibleItemIdx = -1

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.bottom + 1,
        minWidth: Math.max(180, rect.width),
        maxWidth: 320,
        background: 'var(--vos-bg-context-menu)',
        border: '1px solid var(--vos-border-subtle)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 99999,
        padding: '4px 0',
        overflow: 'hidden',
      }}
    >
      {group.items.map((entry, i) => {
        if ('type' in entry && entry.type === 'separator') {
          return <div key={i} style={{ height: 1, margin: '3px 0', background: 'var(--vos-border-subtle)' }} />
        }
        const item = entry as AppMenuItem
        if (item.hidden) return null
        visibleItemIdx++
        const vIdx = visibleItemIdx
        const isActive = focusedIdx === vIdx
        return (
          <button
            key={item.id}
            type="button"
            className="w-full flex items-center justify-between gap-4 text-sm text-left"
            style={{
              padding: '5px 12px',
              background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
              color: item.disabled
                ? 'var(--vos-text-tertiary)'
                : isActive ? '#fff' : item.danger ? '#ff4d4f' : 'var(--vos-text-primary)',
              border: 'none',
              cursor: item.disabled ? 'default' : 'pointer',
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={() => setFocusedIdx(vIdx)}
            onMouseLeave={() => setFocusedIdx(-1)}
            onMouseDown={e => e.stopPropagation()}
            onClick={() => {
              if (!item.disabled) { item.action?.(); onClose() }
            }}
          >
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.checked && (
              <span style={{ opacity: 0.8, fontSize: 12 }}>✓</span>
            )}
            {item.shortcut && (
              <kbd style={{
                fontFamily: 'monospace', fontSize: 11,
                color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--vos-text-tertiary)',
                background: 'transparent', border: 'none', padding: 0, flexShrink: 0
              }}>
                {item.shortcut}
              </kbd>
            )}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

/* -------- Window Menu Bar -------- */

function WindowMenuBar({
  groups,
  isFocused,
}: {
  groups: AppMenuGroup[]
  isFocused: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Close on window blur
  useEffect(() => {
    if (!openId) return
    const handler = () => setOpenId(null)
    window.addEventListener('blur', handler)
    return () => window.removeEventListener('blur', handler)
  }, [openId])

  if (groups.length === 0) return null

  return (
    <div
      className="flex items-center"
      style={{ marginLeft: 4, gap: 0, flexShrink: 0 }}
      onMouseDown={e => e.stopPropagation()}
    >
      {groups.map(group => {
        const isOpen = openId === group.id
        return (
          <button
            key={group.id}
            ref={el => {
              if (el) buttonRefs.current.set(group.id, el)
              else buttonRefs.current.delete(group.id)
            }}
            type="button"
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 13,
              background: isOpen ? 'var(--vos-accent-primary)' : 'transparent',
              color: isOpen
                ? '#fff'
                : isFocused ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
              border: 'none',
              cursor: 'pointer',
              userSelect: 'none',
              height: 24,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseDown={e => {
              e.stopPropagation()
              e.preventDefault()
              setOpenId(isOpen ? null : group.id)
            }}
            onMouseEnter={() => {
              if (openId !== null && openId !== group.id) setOpenId(group.id)
            }}
          >
            {group.label}
          </button>
        )
      })}

      {openId && (() => {
        const group = groups.find(g => g.id === openId)
        const btn = buttonRefs.current.get(openId)
        if (!group || !btn) return null
        return (
          <MenuDropdown
            group={group}
            anchorEl={btn}
            onClose={() => setOpenId(null)}
            onHoverGroup={id => setOpenId(id)}
          />
        )
      })()}
    </div>
  )
}

/* ——— Window Component ——— */
export default function Window({ win, children }: { win: WindowInstance; children: ReactNode }) {
  const moveWindow = useWindowStore(s => s.moveWindow)
  const resizeWindow = useWindowStore(s => s.resizeWindow)
  const shouldRender = !win.isMinimized

  // Menus registered by windowId first, fall back to appId
  const menus = useMenuStore(s =>
    (s.menus.get(win.id)?.length ? s.menus.get(win.id) : s.menus.get(win.appId)) ?? []
  )

  // Wallpaper for per-window glass morphism
  const wallpaper = useSettingsStore(s => s.wallpaper)
  const isImageWallpaper = !wallpaper.startsWith('linear-') && !wallpaper.startsWith('radial-')

  // ---- Auto-reset position when title bar is off-screen ----
  // Triggered on browser resize; if the window title bar is not visible, reposition to center.
  useEffect(() => {
    if (win.isMaximized || win.isMinimized) return
    const checkBounds = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const titleBarVisible =
        win.x < vw - 60 && // enough of left edge visible
        win.x + win.width > 60 && // enough of right edge visible
        win.y >= TOPBAR_H && // title bar not above topbar
        win.y < vh - 20 // title bar not below bottom
      if (!titleBarVisible) {
        const centeredX = Math.max(0, (vw - win.width) / 2)
        const centeredY = Math.max(TOPBAR_H, (vh - win.height) / 2)
        moveWindow(win.id, centeredX, centeredY)
      }
    }
    window.addEventListener('resize', checkBounds)
    return () => window.removeEventListener('resize', checkBounds)
  }, [win.id, win.x, win.y, win.width, win.height, win.isMaximized, win.isMinimized, moveWindow])

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
    [win.id, win.x, win.y, win.isMaximized]
  )

  useEffect(() => {
    if (!isDragging && !isResizing) return

    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const d = dragRef.current
        const rawX = e.clientX - d.startX
        const rawY = e.clientY - d.startY
        // Clamp: title bar can't go above topbar; at least TITLE_H must remain visible at bottom
        const minDY = TOPBAR_H - d.winY
        const maxDY = window.innerHeight - TITLE_H - d.winY
        setDragDelta({
          x: rawX,
          y: Math.max(minDY, Math.min(rawY, maxDY))
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
    [win.id, win.x, win.y, win.width, win.height, win.isMaximized]
  )

  const isMax = win.isMaximized
  const left = isMax ? 0 : win.x + dragDelta.x + resizeDelta.dx
  const top = isMax ? TOPBAR_H : win.y + dragDelta.y + resizeDelta.dy
  const width = isMax ? '100%' : win.width + resizeDelta.dw
  const height = isMax ? `calc(100dvh - ${TOPBAR_H}px)` : win.height + resizeDelta.dh

  // ---- Minimize-to-Dock animation ----
  const controls = useAnimationControls()
  const windowRef = useRef<HTMLDivElement>(null)
  const prevMinimized = useRef(win.isMinimized)

  const dockTarget = useDockPositionStore(s => s.getTargetRect(win.appId))

  useEffect(() => {
    const wasMinimized = prevMinimized.current
    prevMinimized.current = win.isMinimized

    if (win.isMinimized && !wasMinimized) {
      // Minimizing: animate to Dock icon position
      const el = windowRef.current
      if (el && dockTarget) {
        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const targetCenterX = dockTarget.x + dockTarget.width / 2
        const targetCenterY = dockTarget.y + dockTarget.height / 2
        controls.start({
          opacity: 0,
          scale: 0.1,
          x: targetCenterX - centerX,
          y: targetCenterY - centerY,
          transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] }
        })
      } else {
        controls.start({
          opacity: 0,
          scale: 0.88,
          y: 40,
          transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] }
        })
      }
    } else if (!win.isMinimized && wasMinimized) {
      // Restoring: animate from Dock back to position
      controls.start({
        opacity: 1,
        scale: 1,
        x: 0,
        y: 0,
        transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] }
      })
    } else if (!win.isMinimized) {
      controls.start({
        opacity: 1,
        scale: 1,
        x: 0,
        y: 0,
        transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] }
      })
    }
  }, [win.isMinimized, controls, dockTarget])

  return (
    <motion.div
      ref={windowRef}
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={controls}
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
        background: isImageWallpaper ? 'transparent' : (win.isFocused ? 'var(--vos-bg-window-active)' : 'var(--vos-bg-window)'),
        backdropFilter: isImageWallpaper ? 'none' : 'blur(48px) saturate(200%)',
        WebkitBackdropFilter: isImageWallpaper ? 'none' : 'blur(48px) saturate(200%)',
        pointerEvents: win.isMinimized ? 'none' : 'auto'
      }}
      onMouseDown={() => {
        if (!win.isFocused) focusWindow(win.id)
      }}
    >
      {/* Per-window glass morphism: blurred wallpaper slice + tint */}
      {isImageWallpaper && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: -24,
              backgroundImage: `url(${wallpaper})`,
              backgroundSize: '100vw 100vh',
              backgroundPosition: `${24 - left}px ${24 - top}px`,
              filter: 'blur(24px) saturate(180%)',
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: win.isFocused ? 'rgba(28, 28, 30, 0.70)' : 'rgba(20, 20, 22, 0.8)',
              zIndex: 1,
            }}
          />
        </>
      )}

      {/* Window body (title bar + content) — above glass layers */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* ---- Title bar ---- */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: title bar is a drag handle for window movement */}
        <div
          role="presentation"
          className="vos-flex-row"
          style={{
            height: TITLE_H,
            paddingLeft: 12,
            paddingRight: 12,
            flexShrink: 0,
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
          <WindowMenuBar groups={menus} isFocused={win.isFocused} />
          <div
            className="vos-flex-1"
            style={{
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 500,
              color: win.isFocused ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingLeft: 8,
              paddingRight: 8
            }}
          >
            {win.title}
          </div>
          <div style={{ width: 52, flexShrink: 0 }} />
        </div>

        {/* ---- Content with virtual rendering ---- */}
        <div className="vos-flex-col vos-flex-1" style={{ overflow: 'hidden', minHeight: 0 }}>
          {shouldRender ? (
            <Suspense
              fallback={
                <div className="vos-flex-center" style={{ flex: 1 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      border: '2px solid var(--vos-border-default)',
                      borderTopColor: 'var(--vos-accent-primary)',
                      borderRadius: '50%',
                      animation: 'vos-spin 0.7s linear infinite'
                    }}
                  />
                </div>
              }
            >
              <ErrorBoundary appId={win.appId}>
                {children}
              </ErrorBoundary>
            </Suspense>
          ) : (
            <div className="vos-flex-center" style={{ flex: 1, color: 'var(--vos-text-tertiary)', fontSize: 13 }}>
              进程已暂停
            </div>
          )}
        </div>
      </div>

      {/* ---- Resize handles ---- */}
      {!isMax && <ResizeHandles onResizeStart={onResizeStart} />}
    </motion.div>
  )
}
