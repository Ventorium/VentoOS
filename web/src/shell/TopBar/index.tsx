/**
 * TopBar — System Menu Bar
 *
 * Left:  VentoOS logo (system menu) → Active app name
 * Right: Tasks, Notifications, Theme, Clock
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff, Loader2, Moon, Sparkles, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiClient } from '@/infra/api'
import { closeAllWindows as closeAllWindowsFn, useAppStore, useWindowStore } from '@/kernel'
import { useAuthStore } from '@/services/auth'
import { useNotificationStore } from '@/services/notification'
import { useSettingsStore } from '@/services/settings'
import { useTaskStore } from '@/services/task'
import { useAISidePanelStore } from '@/shell/AISidePanel/store'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { tokens } from '@/theme'

const H = tokens.topBar.height

type AboutAppInfo = {
  name: string
  version: string
  author: { name: string; email?: string; url?: string }
  description?: string
  icon?: string
}

/* ---- About Dialog (shared, rendered outside header to avoid backdrop-filter fixed containment) ---- */
function AboutDialog({ app, onClose }: { app: AboutAppInfo; onClose: () => void }) {
  return (
    <div className="vos-modal-overlay" onClick={onClose}>
      <motion.div
        className="vos-modal"
        style={{ width: 320, padding: 0 }}
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '28px 28px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>{app.icon ?? '📦'}</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--vos-text-primary)' }}>{app.name}</div>
          <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginTop: 4 }}>版本 {app.version}</div>
          {app.description && (
            <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginTop: 10, lineHeight: 1.6 }}>
              {app.description}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--vos-text-secondary)', marginTop: 12 }}>
            作者: {app.author.name}
            {app.author.email && ` <${app.author.email}>`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button type="button" className="vos-btn vos-btn-primary" style={{ minWidth: 80, textAlign: 'center' }} onClick={onClose}>
              好
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ---- About VentoOS Dialog ---- */
function AboutVentoOSDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="vos-modal-overlay" onClick={onClose}>
      <motion.div
        className="vos-modal"
        style={{ width: 340, padding: 0 }}
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '28px 28px 24px', textAlign: 'center' }}>
          <div style={{ marginBottom: 14 }}>
            <svg width="52" height="52" viewBox="0 0 16 16" fill="var(--vos-accent-primary)" aria-hidden="true">
              <circle cx="8" cy="4.5" r="2.5" />
              <path d="M8 9c-3 0-5.5 1.3-5.5 3S5 15 8 15s5.5-1.3 5.5-3S11 9 8 9z" />
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--vos-text-primary)', letterSpacing: '-0.01em' }}>
            VentoOS
          </div>
          <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginTop: 4 }}>版本 1.0.0</div>
          <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginTop: 12, lineHeight: 1.7 }}>
            运维与基础设施管理平台
            <br />
            统一管理 Kubernetes、数据库、Redis 与远程文件系统
          </div>
          <div style={{ fontSize: 11, color: 'var(--vos-text-secondary)', marginTop: 12, opacity: 0.7 }}>
            © 2025 VentoOS Project
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button type="button" className="vos-btn vos-btn-primary" style={{ minWidth: 80 }} onClick={onClose}>
              好
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ---- Left: Logo + Active App ---- */
function MenuBarLeft({
  onAboutApp,
  onAboutVentoOS
}: {
  onAboutApp: (app: AboutAppInfo) => void
  onAboutVentoOS: () => void
}) {
  const toggleLaunchpad = useLaunchpadStore(s => s.toggle)
  const focusedAppId = useWindowStore(s => s.windows.find(w => w.isFocused)?.appId ?? null)
  const getApp = useAppStore(s => s.getApp)
  const activeApp = focusedAppId ? getApp(focusedAppId) : null
  const showCtxMenu = useContextMenuStore(s => s.show)

  function openLogoMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    showCtxMenu(rect.left, rect.bottom + 2, [
      { id: 'about', label: '关于 VentoOS', action: onAboutVentoOS },
      { type: 'separator' },
      { id: 'launchpad', label: '启动台', shortcut: '⌘Space', action: toggleLaunchpad },
      { type: 'separator' },
      {
        id: 'lock',
        label: '锁定屏幕',
        action: () => {
          apiClient.authLogout().catch(() => {})
          useAuthStore.getState().lock()
        }
      },
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
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            showCtxMenu(rect.left, rect.bottom + 2, [
              {
                id: 'about-app',
                label: `关于 ${activeApp.name}`,
                action: () => {
                  onAboutApp(activeApp)
                }
              },
              { type: 'separator' },
              { id: 'hide-app', label: `隐藏 ${activeApp.name}`, disabled: true },
              {
                id: 'quit-app',
                label: `退出 ${activeApp.name}`,
                action: () => {
                  closeAllWindowsFn()
                }
              }
            ])
          }}
        >
          {activeApp.name}
        </button>
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
  const doNotDisturb = useNotificationStore(s => s.doNotDisturb)
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

      <button
        type="button"
        className="vos-topbar-btn"
        onClick={toggleNotifPanel}
        title="通知中心"
        style={{ position: 'relative' }}
      >
        {doNotDisturb ? (
          <BellOff size={13} />
        ) : (
          <>
            <Bell size={13} />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="vos-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </>
        )}
      </button>

      <button
        type="button"
        className="vos-topbar-btn"
        onClick={toggleAI}
        title="AI 助手"
        style={aiOpen ? { color: 'var(--vos-accent-primary)' } : undefined}
      >
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
  const [aboutApp, setAboutApp] = useState<AboutAppInfo | null>(null)
  const [showAboutVentoOS, setShowAboutVentoOS] = useState(false)

  return (
    <>
      <header className="vos-topbar" style={{ height: H }}>
        <MenuBarLeft onAboutApp={setAboutApp} onAboutVentoOS={() => setShowAboutVentoOS(true)} />
        <MenuBarRight />
      </header>
      {/* Dialogs rendered outside header to avoid backdrop-filter fixed-position containment */}
      {showAboutVentoOS && <AboutVentoOSDialog onClose={() => setShowAboutVentoOS(false)} />}
      {aboutApp && <AboutDialog app={aboutApp} onClose={() => setAboutApp(null)} />}
    </>
  )
}
