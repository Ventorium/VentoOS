/**
 * TopBar — System Menu Bar
 *
 * Left:  VentoOS logo (system menu) → Active app name
 * Center: Active window title
 * Right: Network, Battery, Tasks, Notifications, Theme, Clock
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Battery, BatteryCharging, BatteryLow, Bell, Loader2, Moon, Sun, Wifi, WifiOff } from 'lucide-react'
import { apiClient } from '@/infra/api'
import { useAppStore, useWindowStore, closeAllWindows as closeAllWindowsFn } from '@/kernel'
import { useAuthStore } from '@/services/auth'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { useSettingsStore } from '@/services/settings'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { useNotificationStore } from '@/services/notification'
import { useSystemStore } from '@/services/system'
import { useTaskStore } from '@/services/task'
import { tokens } from '@/theme'

const H = tokens.topBar.height

/* ---- Left: Logo + Active App ---- */
function MenuBarLeft() {
  const toggleLaunchpad = useLaunchpadStore(s => s.toggle)
  // Select primitives only — object selectors cause infinite re-renders via unstable references
  const focusedAppId = useWindowStore(s => s.windows.find(w => w.isFocused)?.appId ?? null)
  const getApp = useAppStore(s => s.getApp)
  const activeApp = focusedAppId ? getApp(focusedAppId) : null
  const showCtxMenu = useContextMenuStore(s => s.show)

  function openLogoMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    showCtxMenu(rect.left, rect.bottom + 2, [
      { id: 'about', label: '关于 VentoOS', action: () => {} },
      { type: 'separator' },
      { id: 'launchpad', label: '启动台', shortcut: '⌘Space', action: toggleLaunchpad },
      { type: 'separator' },
      { id: 'lock', label: '锁定屏幕', action: () => {
        apiClient.authLogout().catch(() => {})
        useAuthStore.getState().lock()
      }},
      { type: 'separator' },
      { id: 'close-all', label: '关闭所有窗口', action: () => closeAllWindowsFn() }
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
  const batteryLevel = useSystemStore(s => s.batteryLevel)
  const isCharging = useSystemStore(s => s.isCharging)
  const isOnline = useSystemStore(s => s.isOnline)
  const clock = useSystemStore(s => s.clock)
  const themeMode = useSettingsStore(s => s.themeMode)
  const setThemeMode = useSettingsStore(s => s.setThemeMode)
  const resolvedTheme = useSettingsStore(s => s.resolvedTheme)
  // Select count (number primitive) not array — avoids unstable reference
  const unreadCount = useNotificationStore(s => s.notifications.filter(n => !n.read).length)
  const toggleNotifPanel = useNotificationStore(s => s.togglePanel)
  const activeTaskCount = useTaskStore(s => s.tasks.filter(t => t.status === 'queued' || t.status === 'running').length)
  const toggleTaskPanel = useTaskStore(s => s.togglePanel)

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

      {activeTaskCount > 0 && (
        <button type="button" className="vos-topbar-btn" onClick={toggleTaskPanel} title="任务中心">
          <Loader2 size={13} className="vos-spin" />
          <span style={{ fontSize: 11 }}>{activeTaskCount}</span>
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
  // Select title string (primitive) not window object — avoids unstable reference
  const focusedWindowTitle = useWindowStore(s => s.windows.find(w => w.isFocused)?.title ?? null)

  return (
    <header className="vos-topbar" style={{ height: H }}>
      <MenuBarLeft />
      <div className="vos-topbar-title">{focusedWindowTitle}</div>
      <MenuBarRight />
    </header>
  )
}
