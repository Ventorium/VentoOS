/**
 * Settings App — System Preferences
 *
 * macOS-style settings with sidebar categories and content panels.
 * Categories: Appearance, Desktop & Dock, Notifications, General
 */
import { Bell, Info, Layout, Monitor, Palette } from 'lucide-react'
import { useState } from 'react'
import { useNotificationStore } from '@/services/notification'
import { type DockPosition, type ThemeMode, useSettingsStore } from '@/services/settings'

type Category = 'appearance' | 'desktop' | 'notifications' | 'general'

const CATEGORIES = [
  { id: 'appearance' as Category, label: '外观', icon: Palette },
  { id: 'desktop' as Category, label: '桌面与Dock', icon: Layout },
  { id: 'notifications' as Category, label: '通知', icon: Bell },
  { id: 'general' as Category, label: '通用', icon: Monitor }
]

/* ---- Appearance Settings ---- */
function AppearancePanel() {
  const { themeMode, setThemeMode, wallpaper, setWallpaper } = useSettingsStore()

  const themes: { value: ThemeMode; label: string; desc: string }[] = [
    { value: 'light', label: '浅色', desc: '始终使用浅色外观' },
    { value: 'dark', label: '深色', desc: '始终使用深色外观' },
    { value: 'auto', label: '自动', desc: '随日出日落自动切换' }
  ]

  const accentColors = ['#007AFF', '#FF3B30', '#FF9500', '#30D158', '#5AC8FA', '#BF5AF2', '#FF2D55', '#A2845E']

  const gradientWallpapers = [
    '/wallpapers/dark-aurora.jpg',
    '/wallpapers/dark-mountain.jpg',
    '/wallpapers/dark-ocean.jpg',
    '/wallpapers/light-beach.jpg',
    '/wallpapers/light-sunset.jpg',
    '/wallpapers/light-field.jpg',
    'linear-gradient(145deg, #0d1117 0%, #161b27 30%, #1a2035 60%, #0f1a2e 100%)',
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 60%, #533483 100%)',
    'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)'
  ]

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">外观</h2>

      {/* Theme mode */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">主题模式</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {themes.map(t => (
            <button
              key={t.value}
              type="button"
              className={`vos-settings-theme-card ${themeMode === t.value ? 'active' : ''}`}
              onClick={() => setThemeMode(t.value)}
            >
              <div className="vos-settings-theme-preview" data-theme={t.value} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">强调色</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {accentColors.map(color => (
            <button
              key={color}
              type="button"
              aria-label={`强调色 ${color}`}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: color,
                border: '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.1s'
              }}
              onClick={() => {
                document.documentElement.style.setProperty('--vos-accent-primary', color)
              }}
            />
          ))}
        </div>
      </div>

      {/* Wallpaper */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">桌面背景</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {gradientWallpapers.map((g, i) => (
            <button
              key={i}
              type="button"
              className={`vos-settings-wallpaper ${wallpaper === g ? 'active' : ''}`}
              style={{
                background: g.startsWith('/') ? `url(${g}) center/cover no-repeat` : g
              }}
              onClick={() => setWallpaper(g)}
              aria-label={`壁纸 ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---- Desktop & Dock Settings ---- */
function DesktopPanel() {
  const dockSize = useSettingsStore(s => s.dockIconSize)
  const setDockSize = useSettingsStore(s => s.setDockIconSize)
  const dockPosition = useSettingsStore(s => s.dockPosition)
  const setDockPosition = useSettingsStore(s => s.setDockPosition)
  const magnification = useSettingsStore(s => s.dockMagnification)
  const setMagnification = useSettingsStore(s => s.setDockMagnification)
  const autohide = useSettingsStore(s => s.dockAutoHide)
  const setAutohide = useSettingsStore(s => s.setDockAutoHide)

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">桌面与Dock</h2>

      <div className="vos-settings-group">
        <label className="vos-settings-label">Dock大小</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range"
            min={32}
            max={80}
            value={dockSize}
            onChange={e => setDockSize(Number(e.target.value))}
            className="vos-settings-slider"
          />
          <span style={{ fontSize: 13, color: 'var(--vos-text-secondary)', minWidth: 30 }}>{dockSize}px</span>
        </div>
      </div>

      <div className="vos-settings-group">
        <label className="vos-settings-label">Dock位置</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['bottom', 'left'] as const).map(pos => (
            <button
              key={pos}
              type="button"
              className={`vos-settings-chip ${dockPosition === pos ? 'active' : ''}`}
              onClick={() => setDockPosition(pos)}
            >
              {pos === 'bottom' ? '底部' : '左侧'}
            </button>
          ))}
        </div>
      </div>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>放大效果</div>
            <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)' }}>鼠标悬停时放大Dock图标</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${magnification ? 'on' : ''}`}
            onClick={() => setMagnification(!magnification)}
            aria-label="放大效果"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
      </div>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>自动隐藏</div>
            <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)' }}>鼠标移到底部时显示Dock</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${autohide ? 'on' : ''}`}
            onClick={() => setAutohide(!autohide)}
            aria-label="自动隐藏"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---- Notifications Settings ---- */
function NotificationsPanel() {
  const doNotDisturb = useNotificationStore(s => s.doNotDisturb)
  const toggleDoNotDisturb = useNotificationStore(s => s.toggleDoNotDisturb)

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">通知</h2>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>勿扰模式</div>
            <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)' }}>暂停所有通知横幅</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${doNotDisturb ? 'on' : ''}`}
            onClick={toggleDoNotDisturb}
            aria-label="勿扰模式"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
      </div>

      <div className="vos-settings-group" style={{ opacity: 0.5 }}>
        <label className="vos-settings-label">应用通知（即将推出）</label>
        <p style={{ fontSize: 13, color: 'var(--vos-text-secondary)' }}>即将支持每个应用的通知权限控制。</p>
      </div>
    </div>
  )
}

/* ---- General Settings ---- */
function GeneralPanel() {
  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">通用</h2>

      <div className="vos-settings-group">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px',
            background: 'var(--vos-bg-surface)',
            borderRadius: 8,
            border: '0.5px solid var(--vos-border-default)'
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="30" height="30" viewBox="0 0 16 16" fill="white">
              <circle cx="8" cy="4.5" r="2.5" />
              <path d="M8 9c-3 0-5.5 1.3-5.5 3S5 15 8 15s5.5-1.3 5.5-3S11 9 8 9z" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>VentoOS</div>
            <div style={{ fontSize: 13, color: 'var(--vos-text-secondary)' }}>版本 0.1.0</div>
            <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)', marginTop: 2 }}>
              本地优先 · 运维基础设施管理平台
            </div>
          </div>
        </div>
      </div>

      <div className="vos-settings-group">
        <label className="vos-settings-label">语言与地区</label>
        <div className="vos-settings-row">
          <span>语言</span>
          <span style={{ color: 'var(--vos-text-secondary)' }}>简体中文</span>
        </div>
        <div className="vos-settings-row">
          <span>时区</span>
          <span style={{ color: 'var(--vos-text-secondary)' }}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>
      </div>
    </div>
  )
}

const PANELS: Record<Category, React.ComponentType> = {
  appearance: AppearancePanel,
  desktop: DesktopPanel,
  notifications: NotificationsPanel,
  general: GeneralPanel
}

/* ---- Settings App Root ---- */
export default function SettingsApp(_props: { windowId: string; processId: number }) {
  const [activeCategory, setActiveCategory] = useState<Category>('appearance')
  const Panel = PANELS[activeCategory]

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--vos-bg-window)' }}>
      {/* Sidebar */}
      <div className="vos-settings-sidebar">
        <div
          style={{
            padding: '12px 8px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--vos-text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase'
          }}
        >
          设置
        </div>

        {CATEGORIES.map(cat => {
          const CatIcon = cat.icon
          const active = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              className={`vos-settings-nav-item ${active ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <CatIcon size={16} style={{ flexShrink: 0 }} />
              <span>{cat.label}</span>
            </button>
          )
        })}

        <div style={{ flex: 1 }} />
        <div style={{ padding: '8px 12px', borderTop: '0.5px solid var(--vos-border-subtle)' }}>
          <div className="vos-settings-nav-item" style={{ opacity: 0.6 }}>
            <Info size={14} />
            <span style={{ fontSize: 11 }}>VentoOS</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Panel />
      </div>
    </div>
  )
}
