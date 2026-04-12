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
        className="vos-modal w-[320px] p-0 rounded-xl"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="pt-6 px-6 pb-5 text-center">
          <div className="w-16 h-16 rounded-[14px] mx-auto mb-4 vos-flex-center overflow-hidden">
            {app.icon ?? '📦'}
          </div>
          <div className="text-[17px] font-semibold text-[var(--vos-text-primary)]">{app.name}</div>
          <div className="text-xs text-[var(--vos-text-secondary)] mt-1">版本 {app.version}</div>
          {app.description && (
            <div className="text-xs text-[var(--vos-text-secondary)] mt-2.5 leading-[1.6] px-2">
              {app.description}
            </div>
          )}
          <div className="text-[11px] text-[var(--vos-text-secondary)] mt-3">
            作者: {app.author.name}
            {app.author.email && ` <${app.author.email}>`}
          </div>
          <div className="flex justify-center mt-5">
            <button
              type="button"
              className="vos-btn vos-btn-primary justify-center min-w-[80px] w-auto"
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
        className="vos-modal w-[340px] p-0"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="pt-7 px-7 pb-6 text-center">
          <div className="flex justify-center mb-3.5">
            <BrandLogo size={72} />
          </div>
          <div className="text-xl font-bold text-[var(--vos-text-primary)] tracking-[-0.01em]">
            VentoOS
          </div>
          <div className="text-xs text-[var(--vos-text-secondary)] mt-1">版本 1.0.0</div>
          <div className="text-xs text-[var(--vos-text-secondary)] mt-3 leading-[1.7]">
            运维与基础设施管理平台
            <br />
            统一管理 Kubernetes、数据库、Redis 与远程文件系统
          </div>
          <div className="text-[11px] text-[var(--vos-text-secondary)] mt-3 opacity-70">
            © 2025 VentoOS Project
          </div>
          <div className="flex justify-center mt-5">
            <button type="button" className="vos-btn vos-btn-primary min-w-[80px]" onClick={onClose}>
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
          className="vos-topbar-btn text-[13px]"
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
            className="vos-topbar-btn relative"
            title={config.tooltip ?? appId}
            onClick={e => {
              if (config.items && config.items.length > 0) {
                const rect = e.currentTarget.getBoundingClientRect()
                showCtxMenu(rect.left, rect.bottom + 2, toContextMenuItems(config.items))
              } else {
                config.onClick?.()
              }
            }}
          >
            {config.render ? (
              config.render()
            ) : (
              <>
                {config.icon ?? <span className="text-[13px]">●</span>}
                {config.badge && (
                  <span
                    className="vos-tray-badge absolute top-[2px] right-[2px] text-[9px] leading-none px-[3px] py-[1px] rounded-[6px] text-white font-semibold pointer-events-none"
                    style={{ backgroundColor: config.badgeColor ?? 'var(--vos-accent-primary)' }}
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
          <span className="text-[11px]">{activeTaskCount}</span>
        </button>
      )}

      <button
        type="button"
        className="vos-topbar-btn relative"
        onClick={toggleNotifPanel}
        title="通知中心"
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
        className={aiOpen ? 'vos-topbar-btn text-[var(--vos-accent-primary)]' : 'vos-topbar-btn'}
        onClick={toggleAI}
        title="AI 助手"
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
