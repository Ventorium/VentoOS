/**
 * Dock — Application Launcher Bar
 *
 * Centered at bottom. Features:
 * - Spring hover magnification
 * - Running indicator dot
 * - Bounce animation on launch
 * - Launchpad launcher button
 * - Tooltip on hover
 */
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Grid3X3 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AppManifest, focusWindow, openWindow, restoreWindow, useAppStore, useWindowStore } from '@/kernel'
import { useSettingsStore } from '@/services/settings'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { tokens } from '@/theme'

const { gap } = tokens.dock
const HOVER_SCALE = 1.45
const NEIGHBOR_SCALE = 1.0

/* ---- Dock Icon ---- */
function DockIcon({
  label,
  icon,
  isRunning,
  onClick,
  mouseX,
  iconSize,
  magnification
}: {
  label: string
  icon: React.ReactNode
  isRunning?: boolean
  onClick: () => void
  mouseX: ReturnType<typeof useMotionValue<number>>
  iconSize: number
  magnification: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [bouncing, setBouncing] = useState(false)

  const distance = useTransform(mouseX, val => {
    if (!ref.current) return 999
    const rect = ref.current.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    return Math.abs(val - center)
  })

  const scale = useSpring(
    useTransform(distance, [0, 40, 80], magnification ? [HOVER_SCALE, NEIGHBOR_SCALE, 1] : [1, 1, 1]),
    { stiffness: 350, damping: 30, mass: 0.5 }
  )

  const y = useSpring(useTransform(distance, [0, 40, 80], magnification ? [-14, -4, 0] : [0, 0, 0]), {
    stiffness: 350,
    damping: 30
  })

  function handleClick() {
    if (!isRunning) {
      setBouncing(true)
      setTimeout(() => setBouncing(false), 600)
    }
    onClick()
  }

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Tooltip */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="vos-dock-tooltip"
          style={{ bottom: iconSize + 14 }}
        >
          {label}
        </motion.div>
      )}

      <motion.button
        ref={ref}
        type="button"
        className="vos-dock-icon"
        style={{ scale, y, width: iconSize, height: iconSize }}
        onClick={handleClick}
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

      {isRunning && <div className="vos-dock-dot" />}
    </div>
  )
}

/* ---- Dock Separator ---- */
function DockSeparator({ iconSize }: { iconSize: number }) {
  return (
    <div
      style={{
        width: 1,
        height: iconSize * 0.6,
        background: 'var(--vos-border-default)',
        margin: `0 ${gap}px`,
        alignSelf: 'center'
      }}
    />
  )
}

/* ---- Dock Root ---- */
export default function Dock() {
  const appsMap = useAppStore(s => s.apps)
  const apps = useMemo(() => Array.from(appsMap.values()), [appsMap])
  const windows = useWindowStore(s => s.windows)
  const openWindowFn = openWindow
  const focusWindowFn = focusWindow
  const restoreWindowFn = restoreWindow
  const toggleLaunchpad = useLaunchpadStore(s => s.toggle)
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
    padding: '4px 8px',
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
              onClick={() => handleAppClick(app)}
              mouseX={mouseX}
              iconSize={iconSize}
              magnification={magnification}
            />
          ))}

          {apps.length > 0 && <DockSeparator iconSize={iconSize} />}

          {/* Launchpad */}
          <DockIcon
            label="启动台"
            icon={<Grid3X3 size={iconSize * 0.5} style={{ opacity: 0.85 }} />}
            onClick={toggleLaunchpad}
            mouseX={mouseX}
            iconSize={iconSize}
            magnification={magnification}
          />
        </div>
      </div>
    </>
  )
}
