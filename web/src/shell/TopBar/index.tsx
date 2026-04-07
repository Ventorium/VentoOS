/**
 * TopBar — System Menu Bar
 *
 * Left:  VentoOS logo (system menu) → Active app name
 * Right: Tasks, Notifications, Theme, Clock
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff, Info, Loader2, Moon, Sparkles, Sun } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import BrandLogo from '@/components/BrandLogo'
import { apiClient } from '@/infra/api'
import type { AppMenuEntry } from '@/kernel'
import {
  closeAllWindows as closeAllWindowsFn,
  useActiveAppMenus,
  useAllTrays,
  useAppStore,
  useWindowStore
} from '@/kernel'
import type { AppManifest } from '@/kernel/apps/manifest'
import type { AppMenuGroup } from '@/kernel/apps/menu'
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
  icon?: ReactNode
}

/* ---- About Dialog (shared, rendered outside header to avoid backdrop-filter fixed containment) ---- */
function AboutDialog({ app, onClose }: { app: AboutAppInfo; onClose: () => void }) {
  return (
    <div className="vos-modal-overlay" onClick={onClose}>
      <motion.div
        className="vos-modal"
        style={{ width: 320, padding: 0, borderRadius: 12 }}
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 20px', textAlign: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}
          >
            {app.icon ?? '📦'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--vos-text-primary)' }}>{app.name}</div>
          <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginTop: 4 }}>版本 {app.version}</div>
          {app.description && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--vos-text-secondary)',
                marginTop: 10,
                lineHeight: 1.6,
                padding: '0 8px'
              }}
            >
              {app.description}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--vos-text-secondary)', marginTop: 12 }}>
            作者: {app.author.name}
            {app.author.email && ` <${app.author.email}>`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button
              type="button"
              className="vos-btn vos-btn-primary justify-center"
              style={{ minWidth: 80, width: 'auto' }}
              onClick={onClose}
            >
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <BrandLogo size={72} />
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

/* ---- Convert AppMenuEntry[] to ContextMenuItems ---- */
function toContextMenuItems(entries: AppMenuEntry[]): import('@/shell/ContextMenu/store').ContextMenuItems {
  return entries
    .filter(e => !('type' in e && e.type === 'separator') || true)
    .map(entry => {
      if ('type' in entry && entry.type === 'separator') return { type: 'separator' as const }
      const item = entry as import('@/kernel').AppMenuItem
      if (item.hidden) return null
      const result: import('@/shell/ContextMenu/store').MenuItem = {
        id: item.id,
        label: item.label,
        shortcut: item.shortcut,
        disabled: item.disabled,
        danger: item.danger,
        action: item.action
      }
      if (item.children && item.children.length > 0) {
        result.submenu = toContextMenuItems(item.children)
      }
      return result
    })
    .filter(Boolean) as import('@/shell/ContextMenu/store').ContextMenuItems
}

/* ---- Build the app-name dropdown menu ---- */
type CtxMenuItems = import('@/shell/ContextMenu/store').ContextMenuItems
type CtxMenuItem = import('@/shell/ContextMenu/store').MenuItem

function buildAppNameMenu(opts: {
  app: AppManifest
  aboutApp: (app: AboutAppInfo) => void
  appMenu: AppMenuGroup | undefined
}): CtxMenuItems {
  const { app, aboutApp, appMenu } = opts
  const result: CtxMenuItems = []

  // System-default "关于" — always first; app can override if it provides one
  const systemAbout: CtxMenuItem = {
    id: 'about-app',
    label: `关于 ${app.name}`,
    icon: <Info size={14} />,
    action: () => aboutApp(app)
  }

  if (appMenu) {
    // App registered an app-level menu — use its items as the body
    const converted = toContextMenuItems(appMenu.items)
    const hasAbout = converted.some(i => i && 'id' in i && (i as CtxMenuItem).label?.startsWith('关于'))
    if (!hasAbout) result.push(systemAbout)
    result.push(...converted)
  } else {
    // No app-level registration — use system defaults
    result.push(systemAbout)
  }

  // "退出 [App]" — always at the end, app cannot override
  result.push(
    { type: 'separator' },
    {
      id: 'quit-app',
      label: `退出 ${app.name}`,
      danger: true,
      action: () => closeAllWindowsFn()
    }
  )
  return result
}

/* ---- Left: Logo + Active App + App Menus ---- */
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
  const appMenuGroups = useActiveAppMenus()
  // Split: app-level group (label === app name) merges into app name button; others render as separate buttons
  const appMenu = appMenuGroups.find(g => g.label === activeApp?.name)
  const extraMenus = appMenuGroups.filter(g => g.label !== activeApp?.name)

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
    <div className="flex items-center gap-0.5 h-full">
      <button type="button" className="vos-topbar-btn vos-topbar-logo" onClick={openLogoMenu} title="VentoOS">
        <BrandLogo size={18} />
      </button>
      {activeApp && (
        <button
          type="button"
          className="vos-topbar-btn vos-topbar-appname"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            showCtxMenu(
              rect.left,
              rect.bottom + 2,
              buildAppNameMenu({
                app: activeApp,
                aboutApp: onAboutApp,
                appMenu
              })
            )
          }}
        >
          {activeApp.name}
        </button>
      )}
      {/* Additional app-registered menu groups rendered as separate menu bar items */}
      {extraMenus.map(group => (
        <button
          key={group.id}
          type="button"
          className="vos-topbar-btn"
          style={{ fontSize: 13 }}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            showCtxMenu(rect.left, rect.bottom + 2, toContextMenuItems(group.items))
          }}
        >
          {group.label}
        </button>
      ))}
    </div>
  )
}

/* ---- Right: Tray + System Status ---- */
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
  const trays = useAllTrays()
  const showCtxMenu = useContextMenuStore(s => s.show)

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
    <div className="flex items-center h-full">
      {/* App tray icons */}
      {trays
        .filter(({ config }) => config.visible !== false)
        .sort((a, b) => (b.config.priority ?? 0) - (a.config.priority ?? 0))
        .map(({ appId, config }) => (
          <button
            key={appId}
            type="button"
            className="vos-topbar-btn"
            title={config.tooltip ?? appId}
            style={{ position: 'relative' }}
            onClick={e => {
              if (config.items && config.items.length > 0) {
                const rect = e.currentTarget.getBoundingClientRect()
                showCtxMenu(rect.left, rect.bottom + 2, toContextMenuItems(config.items))
              } else {
                config.onClick?.()
              }
            }}
          >
            {config.render ? config.render() : (
              <>
                {config.icon ?? <span style={{ fontSize: 13 }}>●</span>}
                {config.badge && (
                  <span
                    className="vos-tray-badge"
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      fontSize: 9,
                      lineHeight: 1,
                      padding: '1px 3px',
                      borderRadius: 6,
                      backgroundColor: config.badgeColor ?? 'var(--vos-accent-primary)',
                      color: '#fff',
                      fontWeight: 600,
                      pointerEvents: 'none',
                    }}
                  >
                    {config.badge}
                  </span>
                )}
              </>
            )}
          </button>
        ))}

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
