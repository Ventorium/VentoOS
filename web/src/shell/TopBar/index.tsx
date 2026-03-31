/**
 * TopBar — System Menu Bar
 *
 * Left:  VentoOS logo (system menu) → Active app name
 * Center: Active window title
 * Right: Network, Battery, Tasks, Notifications, Theme, Clock
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Loader2, Moon, Sparkles, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiClient } from '@/infra/api'
import { useAppStore, useWindowStore, closeAllWindows as closeAllWindowsFn } from '@/kernel'
import { useAuthStore } from '@/services/auth'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { useSettingsStore } from '@/services/settings'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { useNotificationStore } from '@/services/notification'
import { useTaskStore } from '@/services/task'
import { useAISidePanelStore } from '@/shell/AISidePanel/store'
import { tokens } from '@/theme'

const H = tokens.topBar.height

/* ---- Left: Logo + Active App ---- */
function MenuBarLeft() {
  const toggleLaunchpad = useLaunchpadStore(s => s.toggle)
  const focusedAppId = useWindowStore(s => s.windows.find(w => w.isFocused)?.appId ?? null)
  const getApp = useAppStore(s => s.getApp)
  const activeApp = focusedAppId ? getApp(focusedAppId) : null
  const showCtxMenu = useContextMenuStore(s => s.show)
  const [aboutApp, setAboutApp] = useState<{ name: string; version: string; author: { name: string; email?: string; url?: string }; description?: string } | null>(null)

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
        <button
          type="button"
          className="vos-topbar-btn vos-topbar-appname"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            showCtxMenu(rect.left, rect.bottom + 2, [
              { id: 'about-app', label: `关于 ${activeApp.name}`, action: () => {
                setAboutApp(activeApp)
              }},
              { type: 'separator' },
              { id: 'hide-app', label: `隐藏 ${activeApp.name}`, disabled: true },
              { id: 'quit-app', label: `退出 ${activeApp.name}`, action: () => {
                closeAllWindowsFn()
              }},
            ])
          }}
        >
          {activeApp.name}
        </button>
      )}

      {/* About Dialog */}
      {aboutApp && (
        <div className="vos-modal-overlay" onClick={() => setAboutApp(null)}>
          <motion.div
            className="vos-modal"
            style={{ width: 320, padding: 0 }}
            initial={{ scale: 0.93, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '24px 24px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{aboutApp.icon ?? '📦'}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--vos-text-primary)' }}>
                {aboutApp.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginTop: 4 }}>
                版本 {aboutApp.version}
              </div>
              {aboutApp.description && (
                <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)', marginTop: 8 }}>
                  {aboutApp.description}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', marginTop: 12 }}>
                作者: {aboutApp.author.name}
                {aboutApp.author.email && ` <${aboutApp.author.email}>`}
              </div>
              <button
                type="button"
                className="vos-btn vos-btn-primary"
                style={{ marginTop: 16, minWidth: 80 }}
                onClick={() => setAboutApp(null)}
              >
                好
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

/* ---- Right: System Status ---- */
function MenuBarRight() {
  const themeMode = useSettingsStore(s => s.themeMode)
  const setThemeMode = useSettingsStore(s => s.setThemeMode)
  const resolvedTheme = useSettingsStore(s => s.resolvedTheme)
  const unreadCount = useNotificationStore(s => s.notifications.filter(n => !n.read).length)
  const toggleNotifPanel = useNotificationStore(s => s.togglePanel)
  const activeTaskCount = useTaskStore(s => s.tasks.filter(t => t.status === 'queued' || t.status === 'running').length)
  const toggleTaskPanel = useTaskStore(s => s.togglePanel)
  const toggleAI = useAISidePanelStore(s => s.toggle)
  const aiOpen = useAISidePanelStore(s => s.isOpen)

  // Clock tick
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })

  function cycleTheme() {
    const modes: Array<typeof themeMode> = ['light', 'dark', 'auto']
    const next = modes[(modes.indexOf(themeMode) + 1) % modes.length]
    setThemeMode(next)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
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

      <button type="button" className="vos-topbar-btn" onClick={toggleAI} title="AI 助手" style={aiOpen ? { color: 'var(--vos-accent-primary)' } : undefined}>
        <Sparkles size={13} />
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
