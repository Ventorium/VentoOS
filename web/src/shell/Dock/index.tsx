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
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Grid3X3 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { type AppManifest, useAppStore, openWindow, focusWindow, restoreWindow, useWindowStore } from '@/kernel'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { tokens } from '@/theme'

const { iconSize, height, gap } = tokens.dock
const HOVER_SCALE = 1.45
const NEIGHBOR_SCALE = 1.22

/* ---- Dock Icon ---- */
function DockIcon({
  label,
  icon,
  isRunning,
  onClick,
  mouseX,
  index,
  total
}: {
  label: string
  icon: React.ReactNode
  isRunning?: boolean
  onClick: () => void
  mouseX: ReturnType<typeof useMotionValue<number>>
  index: number
  total: number
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
    useTransform(distance, [0, 80, 160], [HOVER_SCALE, NEIGHBOR_SCALE, 1]),
    { stiffness: 350, damping: 30, mass: 0.5 }
  )

  const y = useSpring(
    useTransform(distance, [0, 80, 160], [-14, -6, 0]),
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
        <div className="vos-dock-icon-inner">
          {icon}
        </div>
      </motion.button>

      {/* Running indicator */}
      {isRunning && (
        <div className="vos-dock-dot" />
      )}
    </div>
  )
}

/* ---- Dock Separator ---- */
function DockSeparator() {
  return (
    <div style={{
      width: 1,
      height: iconSize * 0.6,
      background: 'var(--vos-border-default)',
      margin: `0 ${gap}px`,
      alignSelf: 'center'
    }} />
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

  const total = apps.length + 1 // +1 for launchpad

  return (
    <div
      className="vos-dock-wrapper"
      onMouseMove={e => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(999)}
    >
      <div className="vos-dock">
        {/* App icons */}
        {apps.map((app, i) => (
          <DockIcon
            key={app.id}
            label={app.name}
            icon={app.icon}
            isRunning={windows.some(w => w.appId === app.id)}
            onClick={() => handleAppClick(app)}
            mouseX={mouseX}
            index={i}
            total={total}
          />
        ))}

        {apps.length > 0 && <DockSeparator />}

        {/* Launchpad */}
        <DockIcon
          label="启动台"
          icon={<Grid3X3 size={26} style={{ opacity: 0.85 }} />}
          onClick={toggleLaunchpad}
          mouseX={mouseX}
          index={apps.length}
          total={total}
        />
      </div>
    </div>
  )
}
