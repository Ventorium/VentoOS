/**
 * Dock — Application Launcher Bar
 *
 * Centered at bottom. Features:
 * - Spring hover magnification
 * - Running indicator dot
 * - Bounce animation on launch
 * - Launchpad launcher button
 * - Tooltip on hover
 * - Icon badges (active window/connection count)
 * - Minimized window thumbnails section
 * - AI status animated icon
 */
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Grid3X3, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AppManifest, closeWindow, focusWindow, openWindow, restoreWindow, useAppStore, useWindowStore } from '@/kernel'
import { useSettingsStore } from '@/services/settings'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { useAISidePanelStore } from '@/shell/AISidePanel/store'
import { useDockPositionStore } from './dockPositionStore'
import { type AIStatus, useAIStatusStore } from './aiStatusStore'
import { tokens } from '@/theme'

const { gap } = tokens.dock
const HOVER_SCALE = 1.45
const NEIGHBOR_SCALE = 1.0

/* ---- Dock Icon ---- */
function DockIcon({
  label,
  icon,
  isRunning,
  appId,
  onClick,
  onContextMenu,
  mouseX,
  iconSize,
  magnification,
  isHorizontal
}: {
  label: string
  icon: React.ReactNode
  isRunning?: boolean
  appId?: string
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  mouseX: ReturnType<typeof useMotionValue<number>>
  iconSize: number
  magnification: boolean
  isHorizontal: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [bouncing, setBouncing] = useState(false)
  const registerIconRect = useDockPositionStore(s => s.registerIconRect)

  // Register position for minimize animation target
  useEffect(() => {
    if (!appId || !ref.current) return
    const updateRect = () => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      registerIconRect(appId, { x: r.x, y: r.y, width: r.width, height: r.height })
    }
    updateRect()
    // Re-register on resize
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [appId, registerIconRect])

  const distance = useTransform(mouseX, val => {
    if (!ref.current) return 999
    const rect = ref.current.getBoundingClientRect()
    const center = isHorizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2
    return Math.abs(val - center)
  })

  const scale = useSpring(
    useTransform(distance, [0, 40, 80], magnification ? [HOVER_SCALE, NEIGHBOR_SCALE, 1] : [1, 1, 1]),
    { stiffness: 350, damping: 30, mass: 0.5 }
  )

  // Vertical spring: moves up for bottom dock, moves right for left dock
  const y = useSpring(
    useTransform(distance, [0, 40, 80], isHorizontal && magnification ? [-14, -4, 0] : [0, 0, 0]),
    { stiffness: 350, damping: 30 }
  )
  const x = useSpring(
    useTransform(distance, [0, 40, 80], !isHorizontal && magnification ? [14, 4, 0] : [0, 0, 0]),
    { stiffness: 350, damping: 30 }
  )

  function handleClick() {
    if (!isRunning) {
      setBouncing(true)
      setTimeout(() => setBouncing(false), 600)
    }
    onClick()
  }

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: isHorizontal ? 'column' : 'row', alignItems: 'center' }}>
      {/* Tooltip */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: isHorizontal ? 4 : 0, x: isHorizontal ? 0 : -4 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          className={`vos-dock-tooltip ${!isHorizontal ? 'vos-dock-tooltip-left' : ''}`}
          style={isHorizontal ? { bottom: iconSize + 14 } : { left: iconSize + 12, top: '50%' }}
        >
          {label}
        </motion.div>
      )}

      <motion.button
        ref={ref}
        type="button"
        className="vos-dock-icon"
        style={{ scale, y, x, width: iconSize, height: iconSize }}
        onClick={handleClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        animate={bouncing ? { y: [0, -16, 0, -8, 0] } : {}}
        transition={bouncing ? { duration: 0.5, ease: 'easeInOut' } : {}}
      >
        <div
          className="vos-dock-icon-inner"
          style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.22, overflow: 'hidden' }}
        >
          {icon}
        </div>
      </motion.button>

      {/* Running indicator */}
      {isRunning && <div className={`vos-dock-dot ${!isHorizontal ? 'vos-dock-dot-left' : ''}`} />}
    </div>
  )
}

/* ---- Dock Separator ---- */
function DockSeparator({ iconSize, isHorizontal }: { iconSize: number, isHorizontal: boolean }) {
  return (
    <div
      style={{
        width: isHorizontal ? 1 : iconSize * 0.6,
        height: isHorizontal ? iconSize * 0.6 : 1,
        background: 'var(--vos-border-default)',
        margin: `0 ${gap}px`,
        alignSelf: 'center'
      }}
    />
  )
}

/* ---- AI Status Icon ---- */
function AIStatusIcon({ size }: { size: number }) {
  const status = useAIStatusStore(s => s.status)

  const iconStyle: React.CSSProperties = {
    width: size * 0.5,
    height: size * 0.5,
  }

  const animationClass = {
    idle: '',
    thinking: 'vos-ai-pulse',
    executing: 'vos-ai-spin',
    error: 'vos-ai-error-blink',
  }[status]

  return (
    <div className={animationClass} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Sparkles
        style={{
          ...iconStyle,
          color: status === 'error' ? 'var(--vos-accent-danger, #ff3b30)' : undefined,
          opacity: 0.85,
        }}
      />
    </div>
  )
}

/* ---- Minimized Thumbnail ---- */
function MinimizedThumbnail({
  win,
  iconSize,
  isHorizontal,
}: {
  win: { id: string; title: string; appId: string }
  iconSize: number
  isHorizontal: boolean
}) {
  const appManifest = useAppStore(s => s.apps.get(win.appId))

  return (
    <motion.button
      type="button"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      whileHover={{ scale: 1.12 }}
      onClick={() => restoreWindow(win.id)}
      title={win.title}
      style={{
        width: iconSize * 0.7,
        height: iconSize * 0.7,
        borderRadius: iconSize * 0.15,
        background: 'var(--vos-bg-input)',
        border: '0.5px solid var(--vos-border-subtle)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <div style={{ width: iconSize * 0.35, height: iconSize * 0.35, opacity: 0.7 }}>
        {appManifest?.icon ?? null}
      </div>
    </motion.button>
  )
}

/* ---- Dock Root ---- */
export default function Dock() {
  const appsMap = useAppStore(s => s.apps)
  const apps = useMemo(() => Array.from(appsMap.values()).filter(a => !a.hidden), [appsMap])
  const windows = useWindowStore(s => s.windows)
  const minimizedWindows = useMemo(() => windows.filter(w => w.isMinimized), [windows])
  const openWindowFn = openWindow
  const focusWindowFn = focusWindow
  const restoreWindowFn = restoreWindow
  const toggleLaunchpad = useLaunchpadStore(s => s.toggle)
  const toggleAI = useAISidePanelStore(s => s.toggle)
  const showCtxMenu = useContextMenuStore(s => s.show)

  // Compute badges: active window count per app is removed (red dot removed per design)

  const handleAppContextMenu = useCallback((e: React.MouseEvent, app: AppManifest) => {
    e.preventDefault()
    e.stopPropagation()
    const getWindowsByApp = useWindowStore.getState().getWindowsByApp
    const appWindows = getWindowsByApp(app.id)
    const isRunning = appWindows.length > 0
    const items: import('@/shell/ContextMenu/store').ContextMenuItems = []

    if (!isRunning) {
      items.push({ id: 'open', label: `打开 ${app.name}`, action: () => openWindowFn(app.id) })
    } else {
      items.push({
        id: 'focus',
        label: `前置 ${app.name}`,
        action: () => {
          const top = appWindows.filter(w => !w.isMinimized)
          if (top.length > 0) {
            focusWindowFn(top.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).id)
          } else {
            restoreWindowFn(appWindows.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).id)
          }
        }
      })
      if (app.multiWindow) {
        items.push({ id: 'new-window', label: '新建窗口', action: () => openWindowFn(app.id) })
      }
      items.push({ type: 'separator' })
      items.push({
        id: 'quit',
        label: `退出 ${app.name}`,
        danger: true,
        action: () => {
          for (const w of appWindows) closeWindow(w.id)
        }
      })
    }
    showCtxMenu(e.clientX, e.clientY, items)
  }, [showCtxMenu, openWindowFn, focusWindowFn, restoreWindowFn])
  const mouseX = useMotionValue(999)

  // Settings
  const iconSize = useSettingsStore(s => s.dockIconSize)
  const dockPosition = useSettingsStore(s => s.dockPosition)
  const magnification = useSettingsStore(s => s.dockMagnification)
  const autoHide = useSettingsStore(s => s.dockAutoHide)
  const [visible, setVisible] = useState(!autoHide)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setVisible(!autoHide)
  }, [autoHide])

  const showDock = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(true)
  }, [])

  const schedulHide = useCallback(() => {
    if (!autoHide) return
    hideTimer.current = setTimeout(() => setVisible(false), 800)
  }, [autoHide])

  const handleAppClick = (app: AppManifest) => {
    const getWindowsByApp = useWindowStore.getState().getWindowsByApp
    const appWindows = getWindowsByApp(app.id).filter(w => !w.isMinimized)
    const allWins = getWindowsByApp(app.id)

    if (allWins.length === 0) {
      openWindowFn(app.id, { width: app.defaultSize?.width, height: app.defaultSize?.height })
    } else if (appWindows.length === 0) {
      const latest = allWins.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
      restoreWindowFn(latest.id)
    } else if (!app.multiWindow) {
      focusWindowFn(appWindows[0].id)
    } else {
      const top = appWindows.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
      focusWindowFn(top.id)
    }
  }

  // Position-dependent styles
  const isHorizontal = dockPosition === 'bottom'
  const wrapperStyle: React.CSSProperties =
    dockPosition === 'bottom'
      ? {
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: `translateX(-50%) translateY(${!visible && autoHide ? '100%' : '0'})`,
          transition: 'transform 0.3s ease',
          zIndex: 2001
        }
      : dockPosition === 'left'
        ? {
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: `translateY(-50%) translateX(${!visible && autoHide ? '-100%' : '0'})`,
            transition: 'transform 0.3s ease',
            zIndex: 2001
          }
        : {
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: `translateY(-50%) translateX(${!visible && autoHide ? '100%' : '0'})`,
            transition: 'transform 0.3s ease',
            zIndex: 2001
          }

  const dockStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: isHorizontal ? 'flex-end' : 'center',
    flexDirection: isHorizontal ? 'row' : 'column',
    gap: gap,
    padding: '8px',
    background: 'var(--vos-bg-dock)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '0.5px solid var(--vos-border-default)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset',
    pointerEvents: 'all'
  }

  // Auto-hide trigger zone
  const triggerStyle: React.CSSProperties =
    dockPosition === 'bottom'
      ? { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, zIndex: 2001 }
      : dockPosition === 'left'
        ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, zIndex: 2001 }
        : { position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, zIndex: 2001 }

  return (
    <>
      {autoHide && !visible && <div style={triggerStyle} onMouseEnter={showDock} />}
      <div
        style={{ ...wrapperStyle, pointerEvents: 'none' }}
        onMouseMove={e => mouseX.set(isHorizontal ? e.clientX : e.clientY)}
        onMouseLeave={() => {
          mouseX.set(999)
          schedulHide()
        }}
        onMouseEnter={showDock}
      >
        <div style={dockStyle}>
          {/* App icons */}
          {apps.map(app => (
            <DockIcon
              key={app.id}
              label={app.name}
              icon={app.icon}
              isRunning={windows.some(w => w.appId === app.id)}
              appId={app.id}
              onClick={() => handleAppClick(app)}
              onContextMenu={e => handleAppContextMenu(e, app)}
              mouseX={mouseX}
              iconSize={iconSize}
              magnification={magnification}
              isHorizontal={isHorizontal}
            />
          ))}

          {/* Minimized window thumbnails section */}
          {minimizedWindows.length > 0 && (
            <>
              <DockSeparator isHorizontal={isHorizontal} iconSize={iconSize} />
              <div
                style={{
                  display: 'flex',
                  flexDirection: isHorizontal ? 'row' : 'column',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <AnimatePresence>
                  {minimizedWindows.map(w => (
                    <MinimizedThumbnail
                      key={w.id}
                      win={w}
                      iconSize={iconSize}
                      isHorizontal={isHorizontal}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}

          {apps.length > 0 && <DockSeparator isHorizontal={isHorizontal} iconSize={iconSize} />}

          {/* Launchpad */}
          <DockIcon
            label="启动台"
            icon={<Grid3X3 size={iconSize * 0.5} style={{ opacity: 0.85 }} />}
            onClick={toggleLaunchpad}
            mouseX={mouseX}
            iconSize={iconSize}
            magnification={magnification}
            isHorizontal={isHorizontal}
          />

          {/* AI Assistant */}
          <DockIcon
            label="AI 助手"
            icon={<AIStatusIcon size={iconSize} />}
            appId="ai-assistant"
            onClick={toggleAI}
            mouseX={mouseX}
            iconSize={iconSize}
            magnification={magnification}
            isHorizontal={isHorizontal}
          />
        </div>
      </div>
    </>
  )
}
