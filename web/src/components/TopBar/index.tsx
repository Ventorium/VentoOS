/**
 * TopBar — System Menu Bar
 *
 * Left:  VentoOS logo (system menu) → Active app name
 * Center: Active window title
 * Right: Network, Battery, Tasks, Notifications, Theme, Clock
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Battery, BatteryCharging, BatteryLow, Bell, Loader2, Moon, Sun, Wifi, WifiOff } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { useContextMenuStore } from '@/store/contextMenu'
import { useDesktopStore } from '@/store/desktop'
import { useLaunchpadStore } from '@/store/launchpad'
import { useNotificationStore } from '@/store/notification'
import { useSystemStore } from '@/store/system'
import { useTaskStore } from '@/store/task'
import { useWindowStore } from '@/store/window'
import { tokens } from '@/theme'

const H = tokens.topBar.height

/* ---- Left: Logo + Active App ---- */
function MenuBarLeft() {
  const { toggle: toggleLaunchpad } = useLaunchpadStore()
  const { closeAllWindows } = useWindowStore()
  const focusedWindow = useWindowStore(s => s.getFocusedWindow())
  const getApp = useAppStore(s => s.getApp)
  const activeApp = focusedWindow ? getApp(focusedWindow.appId) : null
  const { show: showCtxMenu } = useContextMenuStore()

  function openLogoMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    showCtxMenu(rect.left, rect.bottom + 2, [
      { id: 'about', label: '关于 VentoOS', action: () => {} },
      { type: 'separator' },
      { id: 'launchpad', label: '启动台', shortcut: '⌘Space', action: toggleLaunchpad },
      { type: 'separator' },
      { id: 'close-all', label: '关闭所有窗口', action: closeAllWindows }
    ])
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
      <button type="button" className="vos-topbar-btn vos-topbar-logo" onClick={openLogoMenu} title="VentoOS">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="4.5" r="2.5" />
          <path d="M8 9c-3 0-5.5 1.3-5.5 3S5 15 8 15s5.5-1.3 5.5-3S11 9 8 9z" />
        </svg>
      </button>
      {activeApp && (
        <span className="vos-topbar-appname">{activeApp.name}</span>
      )}
    </div>
  )
}

/* ---- Right: System Status ---- */
function MenuBarRight() {
  const { batteryLevel, isCharging, isOnline, clock } = useSystemStore()
  const { themeMode, setThemeMode, resolvedTheme } = useDesktopStore()
  const unreadCount = useNotificationStore(s => s.getUnreadCount())
  const { togglePanel: toggleNotifPanel } = useNotificationStore()
  const activeTasks = useTaskStore(s => s.getActiveTasks())
  const { togglePanel: toggleTaskPanel } = useTaskStore()

  const timeStr = clock.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = clock.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })

  function BatteryIndicator() {
    if (batteryLevel === null) return null
    if (isCharging) return <BatteryCharging size={13} />
    if (batteryLevel < 20) return <BatteryLow size={13} style={{ color: 'var(--vos-accent-danger)' }} />
    return <Battery size={13} />
  }

  function cycleTheme() {
    const modes: Array<typeof themeMode> = ['light', 'dark', 'auto']
    const next = modes[(modes.indexOf(themeMode) + 1) % modes.length]
    setThemeMode(next)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <div className="vos-topbar-status" title={isOnline ? '已连接' : '未连接'}>
        {isOnline ? <Wifi size={13} /> : <WifiOff size={13} style={{ color: 'var(--vos-accent-danger)' }} />}
      </div>

      {batteryLevel !== null && (
        <div className="vos-topbar-status" title={`电池: ${batteryLevel}%`}>
          <BatteryIndicator />
          {batteryLevel < 100 && <span style={{ fontSize: 10 }}>{batteryLevel}</span>}
        </div>
      )}

      {activeTasks.length > 0 && (
        <button type="button" className="vos-topbar-btn" onClick={toggleTaskPanel} title="任务中心">
          <Loader2 size={13} className="vos-spin" />
          <span style={{ fontSize: 11 }}>{activeTasks.length}</span>
        </button>
      )}

      <button type="button" className="vos-topbar-btn" onClick={toggleNotifPanel} title="通知中心" style={{ position: 'relative' }}>
        <Bell size={13} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="vos-badge">
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <button type="button" className="vos-topbar-btn" onClick={cycleTheme} title={`主题: ${themeMode}`}>
        {resolvedTheme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
      </button>

      <div className="vos-topbar-clock" title={dateStr}>
        <span>{timeStr}</span>
      </div>
    </div>
  )
}

export default function TopBar() {
  const focusedWindow = useWindowStore(s => s.getFocusedWindow())

  return (
    <header className="vos-topbar" style={{ height: H }}>
      <MenuBarLeft />
      <div className="vos-topbar-title">{focusedWindow?.title}</div>
      <MenuBarRight />
    </header>
  )
}
