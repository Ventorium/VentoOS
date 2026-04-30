/**
 * Settings App — System Preferences
 *
 * macOS-style settings with sidebar categories and content panels.
 * Categories: Appearance, Desktop & Dock, Notifications, AI, General
 */

import { BaiduOutlined, GithubOutlined, GoogleOutlined } from '@ant-design/icons'
import {
  Bell,
  Bot,
  CheckCircle2,
  Cpu,
  Globe,
  Info,
  Layout,
  Lock,
  MapPin,
  Monitor,
  Palette,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Volume2,
  Wifi,
  XCircle,
  Zap
} from 'lucide-react'
import type React from 'react'
import { FormSelect } from '@/components/ui'
import { useCallback, useEffect, useState } from 'react'
import type {
  AgentConfig,
  AgentProfile,
  AgentToolPolicyMode,
  ChannelConfig,
  ChannelKind,
  ProviderConfig,
  ProviderProbeResult,
  ProviderTemplate
} from '@/apps/ai-assistant/api'
import { agentApi } from '@/apps/ai-assistant/api'
import BrandLogo from '@/components/BrandLogo'
import { apiClient } from '@/infra/api'
import { useWindowStore } from '@/kernel'
import { authService, useAuthStore } from '@/services/auth'
import { notificationService, useNotificationStore } from '@/services/notification'
import { type ThemeMode, useSettingsStore } from '@/services/settings'
import { darkTheme, lightTheme } from '@/theme'

type Category =
  | 'appearance'
  | 'desktop'
  | 'notifications'
  | 'network'
  | 'sound'
  | 'lockscreen'
  | 'location'
  | 'update'
  | 'autostart'
  | 'ai'
  | 'general'

const CATEGORIES = [
  { id: 'appearance' as Category, label: '外观', icon: Palette },
  { id: 'desktop' as Category, label: '桌面与Dock', icon: Layout },
  { id: 'notifications' as Category, label: '通知', icon: Bell },
  { id: 'network' as Category, label: '网络', icon: Wifi },
  { id: 'sound' as Category, label: '声音', icon: Volume2 },
  { id: 'lockscreen' as Category, label: '锁屏', icon: Lock },
  { id: 'location' as Category, label: '定位', icon: MapPin },
  { id: 'update' as Category, label: '软件更新', icon: RefreshCw },
  { id: 'autostart' as Category, label: '开机自启', icon: Zap },
  { id: 'ai' as Category, label: 'AI 助手', icon: Bot },
  { id: 'general' as Category, label: '通用', icon: Monitor }
]

/* ---- Appearance Settings ---- */
function AppearancePanel() {
  const { themeMode, setThemeMode, accentColor, setAccentColor, resolvedTheme, wallpaper, setWallpaper } =
    useSettingsStore()
  const [bingWallpapers, setBingWallpapers] = useState<string[]>([])
  const [bingLoading, setBingLoading] = useState(false)

  useEffect(() => {
    setBingLoading(true)
    apiClient
      .getBingWallpapers()
      .then(res => {
        if (res.data) setBingWallpapers(res.data)
      })
      .catch(() => {
        // silently ignore — Bing might not be reachable
      })
      .finally(() => setBingLoading(false))
  }, [])

  const themes: { value: ThemeMode; label: string; desc: string }[] = [
    { value: 'light', label: '浅色', desc: '始终使用浅色外观' },
    { value: 'dark', label: '深色', desc: '始终使用深色外观' },
    { value: 'auto', label: '自动', desc: '随日出日落自动切换' }
  ]

  const accentColors = ['#0A84FF', '#007AFF', '#FF3B30', '#FF9500', '#30D158', '#5AC8FA', '#BF5AF2', '#FF2D55', '#A2845E']
  const currentAccent = accentColor ?? (resolvedTheme === 'dark' ? darkTheme.accent.primary : lightTheme.accent.primary)

  const gradientWallpapers = [
    '/wallpapers/dark-mountain.jpg',
    '/wallpapers/light-field.jpg',
    '/wallpapers/light-sunset.jpg',
    '/wallpapers/dark-aurora.jpg',
    '/wallpapers/light-beach.jpg',
    '/wallpapers/dark-ocean.jpg'
  ]

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">外观</h2>

      {/* Theme mode */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">主题模式</label>
        <div className="flex gap-3">
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
        <div className="flex gap-2 items-center">
          {accentColors.map(color => (
            <button
              key={color}
              type="button"
              aria-label={`强调色 ${color}`}
              className="w-[24px] h-[24px] rounded-full border-2 border-solid border-transparent cursor-pointer flex items-center justify-center transition-transform duration-100"
              style={{
                background: color,
                borderColor: color === currentAccent ? 'var(--vos-text-primary)' : 'transparent',
                transform: color === currentAccent ? 'scale(1.08)' : undefined
              }}
              onClick={() => setAccentColor(color)}
            />
          ))}
        </div>
      </div>

      {/* Wallpaper */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">桌面背景</label>
        <div className="grid grid-cols-3 gap-2">
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

      {/* Bing daily wallpapers */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">
          Bing 每日壁纸
          {bingLoading && <span className="ml-[8px] text-[11px] vos-text-tertiary">加载中…</span>}
        </label>
        {!bingLoading && bingWallpapers.length === 0 ? (
          <p className="text-xs vos-text-tertiary">暂无 Bing 壁纸（网络不可用）</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {bingWallpapers.map((url, i) => (
              <button
                key={url}
                type="button"
                className={`vos-settings-wallpaper ${wallpaper === url ? 'active' : ''}`}
                style={{ background: `url(${url}) center/cover no-repeat` }}
                onClick={() => setWallpaper(url)}
                aria-label={`Bing 壁纸 ${i + 1}`}
              />
            ))}
          </div>
        )}
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
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={32}
            max={80}
            value={dockSize}
            onChange={e => setDockSize(Number(e.target.value))}
            className="vos-settings-slider"
          />
          <span className="text-[13px] min-w-[30px] vos-text-secondary">{dockSize}px</span>
        </div>
      </div>

      <div className="vos-settings-group">
        <label className="vos-settings-label">Dock位置</label>
        <div className="flex gap-2">
          {(['bottom', 'left', 'right'] as const).map(pos => (
            <button
              key={pos}
              type="button"
              className={`vos-settings-chip ${dockPosition === pos ? 'active' : ''}`}
              onClick={() => setDockPosition(pos)}
            >
              {pos === 'bottom' ? '底部' : pos === 'left' ? '左侧' : '右侧'}
            </button>
          ))}
        </div>
      </div>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">放大效果</div>
            <div className="text-xs vos-text-secondary">鼠标悬停时放大Dock图标</div>
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
            <div className="text-sm font-medium">自动隐藏</div>
            <div className="text-xs vos-text-secondary">鼠标移到底部时显示Dock</div>
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
  const nativeEnabled = useNotificationStore(s => s.nativeNotificationsEnabled)
  const setNativeEnabled = useNotificationStore(s => s.setNativeNotificationsEnabled)

  const sendTestNotification = useCallback(() => {
    const levels: Array<{ level: 'info' | 'success' | 'warning' | 'error'; title: string; msg: string }> = [
      { level: 'info', title: '系统提示', msg: '这是一条信息通知测试' },
      { level: 'success', title: '操作成功', msg: '数据库备份已完成' },
      { level: 'warning', title: '资源警告', msg: '内存使用率已超过 85%' },
      { level: 'error', title: '连接失败', msg: '无法连接到 Redis 服务器' }
    ]
    const pick = levels[Math.floor(Math.random() * levels.length)]
    notificationService.add({ title: pick.title, message: pick.msg, level: pick.level, source: 'system' })
  }, [])

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">通知</h2>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">浏览器通知</div>
            <div className="text-xs vos-text-secondary">页面不在前台时推送浏览器原生通知</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${nativeEnabled ? 'on' : ''}`}
            onClick={async () => {
              if (!nativeEnabled) {
                const granted = await notificationService.requestNativePermission()
                setNativeEnabled(granted)
              } else {
                setNativeEnabled(false)
              }
            }}
            aria-label="浏览器通知"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
      </div>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">勿扰模式</div>
            <div className="text-xs vos-text-secondary">不弹出通知横幅，仅在通知中心保留未读数量</div>
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

      <div className="vos-settings-group">
        <label className="vos-settings-label">测试通知</label>
        <p className="text-[13px] vos-text-secondary mb-3">发送一条随机级别的测试通知，验证通知中心是否正常工作。</p>
        <button type="button" className="vos-btn vos-btn-primary text-[13px]" onClick={sendTestNotification}>
          发送测试通知
        </button>
      </div>

      <div className="vos-settings-group opacity-50">
        <label className="vos-settings-label">应用通知（即将推出）</label>
        <p className="text-[13px] vos-text-secondary">即将支持每个应用的通知权限控制。</p>
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
        <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-default)]">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-[linear-gradient(135deg,#1a1a2e,#0f3460)]">
            <svg width="30" height="30" viewBox="0 0 16 16" fill="white">
              <circle cx="8" cy="4.5" r="2.5" />
              <path d="M8 9c-3 0-5.5 1.3-5.5 3S5 15 8 15s5.5-1.3 5.5-3S11 9 8 9z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-[15px]">VentoOS</div>
            <div className="text-[13px] vos-text-secondary">版本 0.1.0</div>
            <div className="text-xs mt-0.5 vos-text-tertiary">本地优先 · 运维基础设施管理平台</div>
          </div>
        </div>
      </div>

      <div className="vos-settings-group">
        <label className="vos-settings-label">语言与地区</label>
        <div className="vos-settings-row">
          <span>语言</span>
          <span className="vos-text-secondary">简体中文</span>
        </div>
        <div className="vos-settings-row">
          <span>时区</span>
          <span className="vos-text-secondary">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>
      </div>
    </div>
  )
}

/* ---- Network Settings ---- */

interface NetworkInterface {
  name: string
  type: string
  ip: string
  netmask: string
  gateway: string
  dns: string[]
  mac: string
  status: string
}

function NetworkPanel() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient
      .getNetworkInfo()
      .then(res => {
        if (res.data) setInterfaces(res.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const typeLabel: Record<string, string> = { wifi: 'Wi-Fi', ethernet: '以太网', loopback: '回环' }

  const speedTargets = [
    { name: '百度', url: 'https://www.baidu.com', icon: 'baidu' },
    { name: 'Google', url: 'https://www.google.com', icon: 'google' },
    { name: 'GitHub', url: 'https://github.com', icon: 'github' }
  ]

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">网络</h2>

      {/* Network Interfaces */}
      {loading && (
        <div className="vos-settings-group">
          <div className="flex items-center gap-3 text-[13px] vos-text-secondary">
            <div className="vos-loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            正在获取网络信息...
          </div>
        </div>
      )}
      {!loading && interfaces.length === 0 && (
        <div className="vos-settings-group">
          <p className="text-[13px] vos-text-secondary">未检测到网络接口</p>
        </div>
      )}
      {interfaces.map(iface => (
        <div key={iface.name} className="vos-settings-group">
          <label className="vos-settings-label">
            {typeLabel[iface.type] ?? iface.type} — {iface.name}
            <span
              className={`ml-2 inline-block w-2 h-2 rounded-full align-middle ${iface.status === 'up' ? 'bg-green-500' : 'bg-gray-400'}`}
            />
          </label>
          <div className="rounded-lg border-[0.5px] border-solid border-[var(--vos-border-default)] bg-[var(--vos-bg-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
              <span className="text-[13px]">IP 地址</span>
              <span className="text-[13px] vos-text-secondary font-mono">{iface.ip}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
              <span className="text-[13px]">子网掩码</span>
              <span className="text-[13px] vos-text-secondary font-mono">{iface.netmask}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
              <span className="text-[13px]">网关</span>
              <span className="text-[13px] vos-text-secondary font-mono">{iface.gateway}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
              <span className="text-[13px]">DNS</span>
              <span className="text-[13px] vos-text-secondary font-mono">{iface.dns.join(', ')}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[13px]">MAC 地址</span>
              <span className="text-[13px] vos-text-secondary font-mono">{iface.mac}</span>
            </div>
          </div>
        </div>
      ))}

      {/* Speed Test — per-site */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">网络测速</label>
        <div className="rounded-lg border-[0.5px] border-solid border-[var(--vos-border-default)] bg-[var(--vos-bg-surface)] overflow-hidden">
          {speedTargets.map((target, idx) => (
            <SpeedTestRow key={target.name} target={target} isLast={idx === speedTargets.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SpeedTestRow({ target, isLast }: { target: { name: string; url: string; icon: string }; isLast: boolean }) {
  const IconComponent =
    target.icon === 'baidu' ? BaiduOutlined : target.icon === 'google' ? GoogleOutlined : GithubOutlined
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ latency: number; status: string } | null>(null)

  const runTest = useCallback(() => {
    setTesting(true)
    setResult(null)
    const start = performance.now()
    // Use no-cors mode so we can measure latency even for sites that block CORS
    fetch(target.url, { mode: 'no-cors', cache: 'no-store' })
      .then(() => {
        const latency = Math.round(performance.now() - start)
        setResult({ latency, status: 'ok' })
      })
      .catch(() => {
        const latency = Math.round(performance.now() - start)
        setResult({ latency, status: 'error' })
      })
      .finally(() => setTesting(false))
  }, [target.url])

  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={!isLast ? { borderBottom: '0.5px solid var(--vos-border-subtle)' } : undefined}
    >
      <div className="flex items-center gap-2">
        <IconComponent style={{ fontSize: 16, color: 'var(--vos-text-secondary)' }} />
        <span className="text-[13px] font-medium">{target.name}</span>
      </div>
      <div className="flex items-center gap-3">
        {testing && <div className="vos-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
        {result && !testing && (
          <span
            className={`text-[13px] font-mono ${result.status === 'ok' ? 'vos-text-secondary' : ''}`}
            style={result.status === 'error' ? { color: 'var(--vos-accent-danger)' } : undefined}
          >
            {result.status === 'ok' ? `${result.latency} ms` : '超时'}
          </span>
        )}
        <button type="button" className="vos-btn text-[12px] min-w-[60px]" disabled={testing} onClick={runTest}>
          {testing ? '...' : '测速'}
        </button>
      </div>
    </div>
  )
}

/* ---- Sound Settings ---- */

const SOUND_TYPES = [
  { value: 'default', label: '默认', freq: 880, type: 'sine' as OscillatorType, duration: 0.15 },
  { value: 'crystal', label: '水晶', freq: 1200, type: 'sine' as OscillatorType, duration: 0.3 },
  { value: 'digital', label: '数码', freq: 660, type: 'square' as OscillatorType, duration: 0.1 },
  { value: 'gentle', label: '柔和', freq: 520, type: 'triangle' as OscillatorType, duration: 0.4 },
  { value: 'alert', label: '警报', freq: 440, type: 'sawtooth' as OscillatorType, duration: 0.2 }
]

function playSound(type: string, volume: number) {
  try {
    const ctx = new AudioContext()
    const preset = SOUND_TYPES.find(s => s.value === type) ?? SOUND_TYPES[0]
    const gain = ctx.createGain()
    gain.gain.value = (volume / 100) * 0.3
    gain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = preset.type
    osc.frequency.value = preset.freq
    osc.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + preset.duration)
    setTimeout(() => ctx.close(), preset.duration * 1000 + 100)
  } catch {
    // Web Audio not available
  }
}

function SoundPanel() {
  const [alertVolume, setAlertVolume] = useState(80)
  const [notifVolume, setNotifVolume] = useState(60)
  const [alertSound, setAlertSound] = useState('default')
  const [notifSound, setNotifSound] = useState('default')
  const [muteAlerts, setMuteAlerts] = useState(false)
  const [muteNotifs, setMuteNotifs] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load from backend
  useEffect(() => {
    apiClient
      .getSystemSettings()
      .then(res => {
        if (res.data) {
          const d = res.data
          setAlertVolume(d.sound_alert_volume)
          setNotifVolume(d.sound_notif_volume)
          setMuteAlerts(d.sound_alert_muted)
          setMuteNotifs(d.sound_notif_muted)
          setAlertSound(d.sound_alert_type)
          setNotifSound(d.sound_notif_type)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Sync to backend on change (debounced)
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => {
      apiClient
        .saveSystemSettings({
          sound_alert_volume: alertVolume,
          sound_notif_volume: notifVolume,
          sound_alert_muted: muteAlerts,
          sound_notif_muted: muteNotifs,
          sound_alert_type: alertSound,
          sound_notif_type: notifSound
        })
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [loaded, alertVolume, notifVolume, muteAlerts, muteNotifs, alertSound, notifSound])

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">声音</h2>

      {/* Alert Sound */}
      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">提醒声音</div>
            <div className="text-xs vos-text-secondary">系统提醒和对话框提示音</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${muteAlerts ? '' : 'on'}`}
            onClick={() => setMuteAlerts(!muteAlerts)}
            aria-label="提醒声音"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
        {!muteAlerts && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] min-w-[40px]">音量</span>
              <input
                type="range"
                min={0}
                max={100}
                value={alertVolume}
                onChange={e => setAlertVolume(Number(e.target.value))}
                className="vos-settings-slider flex-1"
              />
              <span className="text-[13px] min-w-[35px] text-right vos-text-secondary">{alertVolume}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] min-w-[40px]">音效</span>
              <div className="flex gap-2 flex-wrap">
                {SOUND_TYPES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className={`vos-settings-chip text-[12px] ${alertSound === s.value ? 'active' : ''}`}
                    onClick={() => {
                      setAlertSound(s.value)
                      playSound(s.value, alertVolume)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notification Sound */}
      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">通知声音</div>
            <div className="text-xs vos-text-secondary">收到新通知时播放提示音</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${muteNotifs ? '' : 'on'}`}
            onClick={() => setMuteNotifs(!muteNotifs)}
            aria-label="通知声音"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
        {!muteNotifs && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] min-w-[40px]">音量</span>
              <input
                type="range"
                min={0}
                max={100}
                value={notifVolume}
                onChange={e => setNotifVolume(Number(e.target.value))}
                className="vos-settings-slider flex-1"
              />
              <span className="text-[13px] min-w-[35px] text-right vos-text-secondary">{notifVolume}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] min-w-[40px]">音效</span>
              <div className="flex gap-2 flex-wrap">
                {SOUND_TYPES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className={`vos-settings-chip text-[12px] ${notifSound === s.value ? 'active' : ''}`}
                    onClick={() => {
                      setNotifSound(s.value)
                      playSound(s.value, notifVolume)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---- Lock Screen Settings ---- */

function LockScreenPanel() {
  const initialized = useAuthStore(s => s.initialized)
  const [enabled, setEnabled] = useState(true)
  const [idleMinutes, setIdleMinutes] = useState(5)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load lockscreen settings from backend (enabled + idle minutes only, NOT password)
  useEffect(() => {
    apiClient
      .getSystemSettings()
      .then(res => {
        if (res.data) {
          setEnabled(res.data.lockscreen_enabled)
          setIdleMinutes(res.data.lockscreen_idle_minutes)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Sync enabled/idle to backend (debounced)
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => {
      apiClient
        .saveSystemSettings({
          lockscreen_enabled: enabled,
          lockscreen_idle_minutes: idleMinutes
        })
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [loaded, enabled, idleMinutes])

  const handleChangePassword = useCallback(() => {
    if (!newPwd || newPwd.length < 6) {
      setPwdError('新密码至少需要 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的密码不一致')
      return
    }
    if (!currentPwd) {
      setPwdError('请输入当前密码')
      return
    }
    setPwdSaving(true)
    setPwdError('')
    authService
      .changePassword(currentPwd, newPwd)
      .then(() => {
        setShowChangePassword(false)
        setCurrentPwd('')
        setNewPwd('')
        setConfirmPwd('')
      })
      .catch(err => {
        setPwdError(err instanceof Error ? err.message : '密码修改失败')
      })
      .finally(() => setPwdSaving(false))
  }, [currentPwd, newPwd, confirmPwd])

  const idleOptions = [
    { value: 1, label: '1 分钟' },
    { value: 5, label: '5 分钟' },
    { value: 10, label: '10 分钟' },
    { value: 15, label: '15 分钟' },
    { value: 30, label: '30 分钟' },
    { value: 60, label: '1 小时' }
  ]

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">锁屏</h2>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">空闲锁屏</div>
            <div className="text-xs vos-text-secondary">达到指定空闲时间后自动锁定屏幕</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${enabled ? 'on' : ''}`}
            onClick={() => setEnabled(!enabled)}
            aria-label="空闲锁屏"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
      </div>

      {enabled && (
        <div className="vos-settings-group">
          <label className="vos-settings-label">空闲时间</label>
          <div className="flex gap-2 flex-wrap">
            {idleOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`vos-settings-chip text-[12px] ${idleMinutes === opt.value ? 'active' : ''}`}
                onClick={() => setIdleMinutes(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Password — uses the auth system */}
      <div className="vos-settings-group">
        <label className="vos-settings-label">解锁密码</label>
        {initialized ? (
          <div className="vos-settings-toggle-row">
            <div>
              <div className="text-sm font-medium">密码已设置</div>
              <div className="text-xs vos-text-secondary">解锁时需要输入系统密码</div>
            </div>
            <button
              type="button"
              className="vos-btn text-[12px]"
              onClick={() => {
                setShowChangePassword(true)
                setCurrentPwd('')
                setNewPwd('')
                setConfirmPwd('')
                setPwdError('')
              }}
            >
              修改密码
            </button>
          </div>
        ) : (
          <div className="vos-settings-toggle-row">
            <div>
              <div className="text-sm font-medium">设置解锁密码</div>
              <div className="text-xs vos-text-secondary">首次使用需要设置系统密码以保护数据安全</div>
            </div>
            <button type="button" className="vos-btn vos-btn-primary text-[12px]" onClick={() => authService.lock()}>
              前往设置
            </button>
          </div>
        )}
      </div>

      {/* Change Password Dialog */}
      {showChangePassword && (
        <div className="vos-modal-overlay" onClick={() => setShowChangePassword(false)} onKeyDown={e => e.key === 'Escape' && setShowChangePassword(false)}>
          <div className="vos-modal" style={{ width: 360, zIndex: 7000 }} onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-[15px] font-semibold mb-4">修改解锁密码</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] vos-text-tertiary block mb-1">当前密码</label>
                  <input
                    type="password"
                    className="vos-input w-full"
                    value={currentPwd}
                    onChange={e => {
                      setCurrentPwd(e.target.value)
                      setPwdError('')
                    }}
                    placeholder="输入当前密码"
                  />
                </div>
                <div>
                  <label className="text-[11px] vos-text-tertiary block mb-1">新密码</label>
                  <input
                    type="password"
                    className="vos-input w-full"
                    value={newPwd}
                    onChange={e => {
                      setNewPwd(e.target.value)
                      setPwdError('')
                    }}
                    placeholder="至少 6 位"
                  />
                </div>
                <div>
                  <label className="text-[11px] vos-text-tertiary block mb-1">确认新密码</label>
                  <input
                    type="password"
                    className="vos-input w-full"
                    value={confirmPwd}
                    onChange={e => {
                      setConfirmPwd(e.target.value)
                      setPwdError('')
                    }}
                    placeholder="再次输入新密码"
                  />
                </div>
                {pwdError && (
                  <p className="text-[12px]" style={{ color: 'var(--vos-accent-danger)' }}>
                    {pwdError}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button type="button" className="vos-btn text-[13px]" onClick={() => setShowChangePassword(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="vos-btn vos-btn-primary text-[13px]"
                  disabled={pwdSaving}
                  onClick={handleChangePassword}
                >
                  {pwdSaving ? '保存中...' : '确定'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- Location Settings ---- */

function LocationPanel() {
  const [enabled, setEnabled] = useState(false)
  const [locating, setLocating] = useState(false)
  const [location, setLocation] = useState<{ city: string; address: string; lat: number; lon: number } | null>(null)
  const [locError, setLocError] = useState('')
  const [loaded, setLoaded] = useState(false)

  // Load from backend
  useEffect(() => {
    apiClient
      .getSystemSettings()
      .then(res => {
        if (res.data) setEnabled(res.data.location_enabled)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Sync enabled state to backend
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => {
      apiClient.saveSystemSettings({ location_enabled: enabled }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [loaded, enabled])

  const locate = useCallback(() => {
    if (!enabled) return
    if (!navigator.geolocation) {
      setLocError('浏览器不支持定位功能')
      return
    }
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords
        // Reverse geocode using free Nominatim API
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=zh`,
            { headers: { 'User-Agent': 'VentoOS/1.0' } }
          )
          const data = await res.json()
          const addr = data.address ?? {}
          const city = addr.city || addr.town || addr.county || addr.state || ''
          const address = data.display_name ?? ''
          setLocation({ city, address, lat: latitude, lon: longitude })
        } catch {
          // Fallback: just show coordinates
          setLocation({ city: '', address: '', lat: latitude, lon: longitude })
        }
        setLocating(false)
      },
      err => {
        setLocError(
          err.message === 'User denied Geolocation'
            ? '定位权限被拒绝，请在浏览器设置中允许'
            : `定位失败: ${err.message}`
        )
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [enabled])

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">定位</h2>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">定位服务</div>
            <div className="text-xs vos-text-secondary">允许应用获取当前位置信息</div>
          </div>
          <button
            type="button"
            className={`vos-toggle ${enabled ? 'on' : ''}`}
            onClick={() => {
              setEnabled(!enabled)
              if (enabled) setLocation(null)
            }}
            aria-label="定位服务"
          >
            <div className="vos-toggle-thumb" />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          <div className="vos-settings-group">
            <label className="vos-settings-label">当前位置</label>
            <div className="rounded-lg border-[0.5px] border-solid border-[var(--vos-border-default)] bg-[var(--vos-bg-surface)] p-4">
              {locating && (
                <div className="flex items-center gap-3 text-[13px] vos-text-secondary">
                  <div className="vos-loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                  正在获取位置...
                </div>
              )}
              {locError && !locating && (
                <p className="text-[12px] mb-3" style={{ color: 'var(--vos-accent-danger)' }}>
                  {locError}
                </p>
              )}
              {location && !locating && (
                <div className="space-y-2">
                  {location.city && (
                    <div className="flex items-center justify-between">
                      <span className="text-[13px]">城市</span>
                      <span className="text-[13px] vos-text-secondary">{location.city}</span>
                    </div>
                  )}
                  {location.address && (
                    <div className="flex items-center justify-between">
                      <span className="text-[13px]">地址</span>
                      <span className="text-[13px] vos-text-secondary text-right max-w-[60%]">{location.address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[13px]">经纬度</span>
                    <span className="text-[13px] vos-text-secondary font-mono">
                      {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}
              {!location && !locating && !locError && (
                <p className="text-[13px] vos-text-secondary mb-3">点击刷新按钮获取当前位置</p>
              )}
              <button type="button" className="vos-btn text-[13px] mt-3" disabled={locating} onClick={locate}>
                <RefreshCw size={12} className="mr-1" />
                刷新位置
              </button>
            </div>
          </div>

          <div className="vos-settings-group opacity-50">
            <label className="vos-settings-label">应用定位权限（即将推出）</label>
            <p className="text-[13px] vos-text-secondary">即将支持对每个应用的定位权限进行单独控制。</p>
          </div>
        </>
      )}
    </div>
  )
}

/* ---- Software Update Settings ---- */

function UpdatePanel() {
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [currentVersion] = useState('1.0.0')
  const [latestVersion, setLatestVersion] = useState('')
  const [lastChecked, setLastChecked] = useState<string>('')

  const checkUpdate = useCallback(() => {
    setChecking(true)
    // Mock — simulates checking
    setTimeout(() => {
      const hasUpdate = Math.random() > 0.5
      setUpdateAvailable(hasUpdate)
      setLatestVersion(hasUpdate ? '1.1.0' : currentVersion)
      setLastChecked(new Date().toLocaleString('zh-CN'))
      setChecking(false)
    }, 2000)
  }, [currentVersion])

  const doUpdate = useCallback(() => {
    setUpdating(true)
    // Mock — simulates update
    setTimeout(() => {
      setUpdating(false)
      setUpdateAvailable(false)
    }, 3000)
  }, [])

  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">软件更新</h2>

      <div className="vos-settings-group">
        <div className="rounded-lg border-[0.5px] border-solid border-[var(--vos-border-default)] bg-[var(--vos-bg-surface)] p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[linear-gradient(135deg,#1a1a2e,#0f3460)]">
              <RefreshCw size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-medium">VentoOS</div>
              <div className="text-[12px] vos-text-secondary">当前版本 {currentVersion}</div>
            </div>
          </div>

          {checking && (
            <div className="flex items-center gap-2 text-[13px] vos-text-secondary mb-3">
              <div className="vos-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              正在检查更新...
            </div>
          )}

          {updateAvailable && !checking && (
            <div className="mb-3 p-3 rounded-lg bg-[var(--vos-bg-input)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
              <div className="flex items-center gap-2 text-[13px]">
                <Shield size={14} style={{ color: 'var(--vos-accent-success)' }} />
                <span className="font-medium">发现新版本 {latestVersion}</span>
              </div>
              <p className="text-[12px] vos-text-secondary mt-1">新版本包含性能优化和安全修复</p>
            </div>
          )}

          {!updateAvailable && lastChecked && !checking && (
            <div className="mb-3 text-[12px] vos-text-secondary">已是最新版本 · 上次检查 {lastChecked}</div>
          )}

          <div className="flex gap-2">
            <button type="button" className="vos-btn text-[13px]" disabled={checking} onClick={checkUpdate}>
              检查更新
            </button>
            {updateAvailable && (
              <button
                type="button"
                className="vos-btn vos-btn-primary text-[13px]"
                disabled={updating}
                onClick={doUpdate}
              >
                {updating ? '更新中...' : '立即更新'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="vos-settings-group">
        <div className="vos-settings-toggle-row">
          <div>
            <div className="text-sm font-medium">自动检查更新</div>
            <div className="text-xs vos-text-secondary">每天自动检查是否有新版本可用</div>
          </div>
          <button type="button" className="vos-toggle on" aria-label="自动检查更新">
            <div className="vos-toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---- Auto-start Settings ---- */

function AutoStartPanel() {
  return (
    <div className="vos-settings-content">
      <h2 className="vos-settings-section-title">开机自启</h2>

      <div className="vos-settings-group">
        <div className="rounded-lg border-[0.5px] border-solid border-[var(--vos-border-default)] bg-[var(--vos-bg-surface)] p-8 text-center">
          <Zap size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-[13px] vos-text-secondary">开机自启功能开发中</p>
          <p className="text-[12px] vos-text-tertiary mt-1">后续将支持配置开机时自动启动的应用</p>
        </div>
      </div>
    </div>
  )
}

/* ---- AI Assistant Settings ---- */

function AIFieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-medium vos-text-tertiary">{children}</label>
}

function AITextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`vos-input ${props.className ?? ''}`} />
}

function AITextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`vos-textarea ${props.className ?? ''}`} />
}

function AISelect({
  value,
  onChange,
  options,
  placeholder
}: {
  value?: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
}) {
  return (
    <FormSelect value={value ?? ''} onChange={e => onChange(e.target.value)} variant="toolbar" wrapperClassName="w-full">
      <option value="">{placeholder ?? '请选择'}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </FormSelect>
  )
}

function AIBtn({
  children,
  onClick,
  tone = 'default',
  disabled = false
}: {
  children: React.ReactNode
  onClick?: () => void
  tone?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}) {
  const cls =
    tone === 'primary'
      ? 'vos-btn-sm vos-btn-primary'
      : tone === 'danger'
        ? 'vos-btn-sm vos-btn-danger'
        : 'vos-btn-sm vos-btn-ghost'
  return (
    <button type="button" className={`${cls} ${disabled ? 'opacity-50' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function AIProviderSettings({
  providers,
  templates,
  config,
  onReload,
  onConfigReload
}: {
  providers: ProviderConfig[]
  templates: ProviderTemplate[]
  config: AgentConfig | null
  onReload: () => Promise<void>
  onConfigReload: () => Promise<void>
}) {
  const [draft, setDraft] = useState<Partial<ProviderConfig>>(() =>
    templates[0]
      ? {
          name: templates[0].name,
          provider_type: templates[0].provider_type,
          vendor: templates[0].vendor,
          api_key: '',
          base_url: templates[0].base_url,
          default_model: templates[0].default_model,
          enabled: true,
          capabilities: templates[0].capabilities
        }
      : {
          name: '',
          provider_type: 'native',
          vendor: 'open_ai',
          api_key: '',
          base_url: '',
          default_model: '',
          enabled: true
        }
  )
  const [saving, setSaving] = useState(false)
  const [probeResult, setProbeResult] = useState<ProviderProbeResult | null>(null)
  const [probeLoading, setProbeLoading] = useState(false)

  const applyTemplate = (vendor: string) => {
    const t = templates.find(item => item.vendor === vendor)
    if (!t) return
    setDraft(cur => ({
      name: t.name,
      provider_type: t.provider_type,
      vendor: t.vendor,
      api_key: cur.api_key ?? '',
      base_url: t.base_url,
      default_model: t.default_model,
      enabled: true,
      capabilities: t.capabilities
    }))
    setProbeResult(null)
  }

  const handleSave = async () => {
    if (!draft.name || !draft.base_url || !draft.default_model) return
    setSaving(true)
    try {
      await agentApi.createAgentProvider(draft as ProviderConfig)
      setDraft(
        templates[0]
          ? {
              name: templates[0].name,
              vendor: templates[0].vendor,
              api_key: '',
              base_url: templates[0].base_url,
              default_model: templates[0].default_model,
              provider_type: templates[0].provider_type,
              enabled: true
            }
          : {}
      )
      await onReload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex gap-3 h-full">
      <div className="w-[38%] overflow-auto flex-shrink-0">
        <div className="text-xs font-medium mb-2 vos-text-secondary">已配置的 Provider</div>
        <div className="space-y-2">
          {providers.map(p => (
            <div
              key={p.id}
              className="rounded-xl p-2.5"
              className="rounded-xl p-2.5 bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-[var(--vos-text-primary)]">{p.name}</div>
                  <div className="text-[10px] mt-0.5 vos-text-tertiary">
                    {p.vendor} · {p.default_model}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <AIBtn onClick={() => setDraft(p)}>编辑</AIBtn>
                  <AIBtn
                    onClick={() => {
                      if (!config) return
                      agentApi.updateAgentConfig({ ...config, default_provider_id: p.id }).then(onConfigReload)
                    }}
                    tone="primary"
                  >
                    默认
                  </AIBtn>
                  <AIBtn tone="danger" onClick={() => agentApi.deleteAgentProvider(p.id).then(onReload)}>
                    删除
                  </AIBtn>
                </div>
              </div>
              <div className="text-[10px] mt-1.5 vos-text-tertiary">{p.base_url}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="text-xs font-medium mb-2 vos-text-secondary">编辑 / 新建 Provider</div>
        <div className="space-y-2.5 rounded-xl p-3 bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <AIFieldLabel>模板</AIFieldLabel>
              <AISelect
                value={draft.vendor}
                onChange={applyTemplate}
                options={templates.map(t => ({ value: t.vendor, label: `${t.name} (${t.provider_type})` }))}
              />
            </div>
            <div>
              <AIFieldLabel>名称</AIFieldLabel>
              <AITextInput value={draft.name ?? ''} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <AIFieldLabel>接口地址</AIFieldLabel>
              <AITextInput
                value={draft.base_url ?? ''}
                onChange={e => setDraft({ ...draft, base_url: e.target.value })}
              />
            </div>
            <div>
              <AIFieldLabel>默认模型</AIFieldLabel>
              <AITextInput
                value={draft.default_model ?? ''}
                onChange={e => setDraft({ ...draft, default_model: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <AIFieldLabel>Provider 类型</AIFieldLabel>
              <AITextInput value={draft.provider_type ?? ''} readOnly />
            </div>
            <div>
              <AIFieldLabel>API 密钥</AIFieldLabel>
              <AITextInput
                type="password"
                value={draft.api_key ?? ''}
                onChange={e => setDraft({ ...draft, api_key: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <AIBtn tone="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存 Provider'}
            </AIBtn>
            <AIBtn
              onClick={async () => {
                setProbeLoading(true)
                try {
                  const r = await agentApi.testAgentProvider({
                    provider: draft as ProviderConfig,
                    prompt: '1+1=?',
                    max_tokens: 1,
                    reasoning_mode: 'off',
                    timeout_ms: 15000
                  })
                  setProbeResult(r.data)
                } finally {
                  setProbeLoading(false)
                }
              }}
              disabled={probeLoading}
            >
              {probeLoading ? '测试中...' : '连通性测试'}
            </AIBtn>
          </div>
          {probeResult && (
            <div className="rounded-xl p-2.5 bg-[var(--vos-bg-input)]">
              <div className="flex items-center gap-2 text-xs">
                {probeResult.success ? (
                  <CheckCircle2 size={13} className="text-[#34c759]" />
                ) : (
                  <XCircle size={13} className="text-[#ff3b30]" />
                )}
                <span className="text-[var(--vos-text-primary)]">{probeResult.message}</span>
              </div>
              <div className="text-[10px] mt-1.5 vos-text-tertiary">
                {probeResult.provider_name} · {probeResult.model} · {probeResult.latency_ms}ms
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AIAgentSettings({
  profiles,
  providers,
  onReload
}: {
  profiles: AgentProfile[]
  providers: ProviderConfig[]
  onReload: () => Promise<void>
}) {
  const emptyDraft: AgentProfile = {
    id: '',
    name: '自定义 Agent',
    description: '',
    preset_kind: 'custom',
    is_builtin: false,
    system_prompt: 'You are a custom VentoOS agent.',
    behavior: { require_impact_for_destructive: true, read_only_mode: false, concise_output: true, extra_rules: [] },
    tool_config: { mode: 'all', enabled_tools: ['read', 'write', 'edit', 'bash'], allow_bash: true },
    default_provider_id: undefined,
    default_model: undefined,
    temperature: 0.2,
    max_tokens: 1024,
    reasoning_mode: 'off'
  }
  const [draft, setDraft] = useState<AgentProfile>(emptyDraft)

  return (
    <div className="flex gap-3 h-full">
      <div className="w-[38%] overflow-auto flex-shrink-0">
        <div className="text-xs font-medium mb-2 vos-text-secondary">Agent 列表</div>
        <div className="space-y-2">
          <AIBtn tone="primary" onClick={() => setDraft(emptyDraft)}>
            + 新建自定义 Agent
          </AIBtn>
          {profiles.map(p => (
            <div
              key={p.id}
              className="rounded-xl p-2.5 bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-[var(--vos-text-primary)]">{p.name}</div>
                  <div className="text-[10px] mt-0.5 vos-text-tertiary">
                    {p.preset_kind}
                    {p.is_builtin ? ' · 内置' : ' · 自定义'}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <AIBtn onClick={() => setDraft({ ...p })}>编辑</AIBtn>
                  {!p.is_builtin && (
                    <AIBtn tone="danger" onClick={() => agentApi.deleteAgentProfile(p.id).then(onReload)}>
                      删除
                    </AIBtn>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="text-xs font-medium mb-2 vos-text-secondary">编辑 Agent</div>
        <div className="rounded-xl p-3 space-y-2.5 bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <AIFieldLabel>名称</AIFieldLabel>
              <AITextInput value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <AIFieldLabel>描述</AIFieldLabel>
              <AITextInput
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <AIFieldLabel>默认 Provider</AIFieldLabel>
              <AISelect
                value={draft.default_provider_id}
                onChange={v => setDraft({ ...draft, default_provider_id: v || undefined })}
                options={providers.map(p => ({ value: p.id, label: p.name }))}
                placeholder="继承全局"
              />
            </div>
            <div>
              <AIFieldLabel>默认模型</AIFieldLabel>
              <AITextInput
                value={draft.default_model ?? ''}
                onChange={e => setDraft({ ...draft, default_model: e.target.value || undefined })}
              />
            </div>
            <div>
              <AIFieldLabel>推理强度</AIFieldLabel>
              <AISelect
                value={draft.reasoning_mode}
                onChange={v => setDraft({ ...draft, reasoning_mode: v as AgentProfile['reasoning_mode'] })}
                options={[
                  { value: 'off', label: '关闭' },
                  { value: 'low', label: '低' },
                  { value: 'medium', label: '中' },
                  { value: 'high', label: '高' }
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <AIFieldLabel>温度</AIFieldLabel>
              <AITextInput
                type="number"
                value={String(draft.temperature)}
                onChange={e => setDraft({ ...draft, temperature: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <AIFieldLabel>最大 Token 数</AIFieldLabel>
              <AITextInput
                type="number"
                value={String(draft.max_tokens)}
                onChange={e => setDraft({ ...draft, max_tokens: Number(e.target.value) || 1 })}
              />
            </div>
            <div>
              <AIFieldLabel>工具策略</AIFieldLabel>
              <AISelect
                value={draft.tool_config.mode}
                onChange={v =>
                  setDraft({ ...draft, tool_config: { ...draft.tool_config, mode: v as AgentToolPolicyMode } })
                }
                options={[
                  { value: 'all', label: '全部工具' },
                  { value: 'allow_list', label: '白名单' },
                  { value: 'disabled', label: '禁用工具' }
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs vos-text-secondary">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.behavior.require_impact_for_destructive}
                onChange={e =>
                  setDraft({
                    ...draft,
                    behavior: { ...draft.behavior, require_impact_for_destructive: e.target.checked }
                  })
                }
              />
              危险操作确认
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.behavior.read_only_mode}
                onChange={e =>
                  setDraft({ ...draft, behavior: { ...draft.behavior, read_only_mode: e.target.checked } })
                }
              />
              只读模式
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.tool_config.allow_bash}
                onChange={e =>
                  setDraft({ ...draft, tool_config: { ...draft.tool_config, allow_bash: e.target.checked } })
                }
              />
              允许执行 Bash
            </label>
          </div>
          <div>
            <AIFieldLabel>系统提示词</AIFieldLabel>
            <AITextArea
              rows={5}
              value={draft.system_prompt}
              onChange={e => setDraft({ ...draft, system_prompt: e.target.value })}
            />
          </div>
          <AIBtn
            tone="primary"
            onClick={async () => {
              if (draft.id) await agentApi.updateAgentProfile(draft.id, draft)
              else await agentApi.createAgentProfile(draft)
              await onReload()
            }}
          >
            保存 Agent
          </AIBtn>
        </div>
      </div>
    </div>
  )
}

function AIRuntimeSettings({
  config,
  profiles,
  providers,
  onReload
}: {
  config: AgentConfig | null
  profiles: AgentProfile[]
  providers: ProviderConfig[]
  onReload: () => Promise<void>
}) {
  const [draft, setDraft] = useState<AgentConfig | null>(config)
  useEffect(() => {
    setDraft(config)
  }, [config])

  if (!draft) return <div className="text-xs vos-text-tertiary">加载中…</div>

  return (
    <div className="max-w-[640px] rounded-xl p-3 space-y-2.5 bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
      <div className="text-xs font-medium mb-2 vos-text-secondary">全局运行时配置</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <AIFieldLabel>默认 Provider</AIFieldLabel>
          <AISelect
            value={draft.default_provider_id}
            onChange={v => setDraft({ ...draft, default_provider_id: v || undefined })}
            options={providers.map(p => ({ value: p.id, label: p.name }))}
            placeholder="未设置"
          />
        </div>
        <div>
          <AIFieldLabel>默认 Agent</AIFieldLabel>
          <AISelect
            value={draft.default_agent_profile_id}
            onChange={v => setDraft({ ...draft, default_agent_profile_id: v || undefined })}
            options={profiles.map(p => ({ value: p.id, label: p.name }))}
            placeholder="未设置"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <AIFieldLabel>默认模型</AIFieldLabel>
          <AITextInput
            value={draft.default_model ?? ''}
            onChange={e => setDraft({ ...draft, default_model: e.target.value || undefined })}
          />
        </div>
        <div>
          <AIFieldLabel>最大迭代次数</AIFieldLabel>
          <AITextInput
            type="number"
            value={String(draft.max_iterations)}
            onChange={e => setDraft({ ...draft, max_iterations: Number(e.target.value) || 1 })}
          />
        </div>
      </div>
      <div>
        <AIFieldLabel>默认系统提示词</AIFieldLabel>
        <AITextArea
          rows={4}
          value={draft.default_system_prompt}
          onChange={e => setDraft({ ...draft, default_system_prompt: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-xs vos-text-secondary">
        <input
          type="checkbox"
          checked={draft.tools_enabled}
          onChange={e => setDraft({ ...draft, tools_enabled: e.target.checked })}
        />
        全局启用工具调用
      </label>
      <AIBtn tone="primary" onClick={() => agentApi.updateAgentConfig(draft).then(onReload)}>
        保存运行时配置
      </AIBtn>
    </div>
  )
}

const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = {
  qq: 'QQ',
  ding_talk: '钉钉',
  feishu: '飞书',
  we_com: '企业微信',
  telegram: 'Telegram'
}

function AIChannelSettings({
  channels,
  profiles,
  onReload
}: {
  channels: ChannelConfig[]
  profiles: AgentProfile[]
  onReload: () => Promise<void>
}) {
  const emptyDraft: ChannelConfig = {
    id: '',
    name: '',
    kind: 'telegram',
    enabled: true,
    auto_route_agent: true,
    credentials: {}
  }
  const [draft, setDraft] = useState<ChannelConfig>(emptyDraft)

  return (
    <div className="flex gap-3 h-full">
      <div className="w-[38%] overflow-auto flex-shrink-0">
        <div className="text-xs font-medium mb-2 vos-text-secondary">已接入的渠道</div>
        <div className="space-y-2">
          <AIBtn tone="primary" onClick={() => setDraft(emptyDraft)}>
            + 新建渠道
          </AIBtn>
          {channels.map(c => (
            <div
              key={c.id}
              className="rounded-xl p-2.5 cursor-pointer border-[0.5px] border-solid border-[var(--vos-border-subtle)]"
              style={{
                background: draft.id === c.id ? 'var(--vos-bg-active)' : 'var(--vos-bg-surface)'
              }}
              onClick={() => setDraft({ ...c })}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium">{c.name}</div>
                  <div className="text-[10px] mt-0.5 vos-text-tertiary">
                    {CHANNEL_KIND_LABELS[c.kind]} · {c.enabled ? '已启用' : '已禁用'}
                  </div>
                </div>
                <AIBtn
                  tone="danger"
                  onClick={e => {
                    e.stopPropagation()
                    agentApi.agentDeleteChannel(c.id).then(onReload)
                  }}
                >
                  删除
                </AIBtn>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-xl p-3 space-y-2.5 bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
        <div className="text-xs font-medium vos-text-secondary">{draft.id ? '编辑渠道' : '新建渠道'}</div>
        <div>
          <AIFieldLabel>名称</AIFieldLabel>
          <AITextInput value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <AIFieldLabel>平台</AIFieldLabel>
          <AISelect
            value={draft.kind}
            onChange={v => setDraft({ ...draft, kind: (v || 'telegram') as ChannelKind, credentials: {} })}
            options={[
              { value: 'qq', label: 'QQ' },
              { value: 'ding_talk', label: '钉钉' },
              { value: 'feishu', label: '飞书' },
              { value: 'we_com', label: '企业微信' },
              { value: 'telegram', label: 'Telegram' }
            ]}
          />
        </div>
        <div>
          <AIFieldLabel>默认 Agent</AIFieldLabel>
          <AISelect
            value={draft.default_agent_profile_id}
            onChange={v => setDraft({ ...draft, default_agent_profile_id: v || undefined })}
            options={profiles.map(p => ({ value: p.id, label: p.name }))}
            placeholder="未设置"
          />
        </div>
        {draft.kind === 'telegram' && (
          <div>
            <AIFieldLabel>Bot Token</AIFieldLabel>
            <AITextInput
              value={String(draft.credentials?.token ?? '')}
              onChange={e => setDraft({ ...draft, credentials: { ...draft.credentials, token: e.target.value } })}
            />
          </div>
        )}
        {draft.kind === 'ding_talk' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <AIFieldLabel>App Key</AIFieldLabel>
              <AITextInput
                value={String(draft.credentials?.app_key ?? '')}
                onChange={e => setDraft({ ...draft, credentials: { ...draft.credentials, app_key: e.target.value } })}
              />
            </div>
            <div>
              <AIFieldLabel>App Secret</AIFieldLabel>
              <AITextInput
                value={String(draft.credentials?.app_secret ?? '')}
                onChange={e =>
                  setDraft({ ...draft, credentials: { ...draft.credentials, app_secret: e.target.value } })
                }
              />
            </div>
          </div>
        )}
        {draft.kind === 'feishu' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <AIFieldLabel>App ID</AIFieldLabel>
              <AITextInput
                value={String(draft.credentials?.app_id ?? '')}
                onChange={e => setDraft({ ...draft, credentials: { ...draft.credentials, app_id: e.target.value } })}
              />
            </div>
            <div>
              <AIFieldLabel>App Secret</AIFieldLabel>
              <AITextInput
                value={String(draft.credentials?.app_secret ?? '')}
                onChange={e =>
                  setDraft({ ...draft, credentials: { ...draft.credentials, app_secret: e.target.value } })
                }
              />
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs vos-text-secondary">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={e => setDraft({ ...draft, enabled: e.target.checked })}
          />
          启用此渠道
        </label>
        <label className="flex items-center gap-2 text-xs vos-text-secondary">
          <input
            type="checkbox"
            checked={draft.auto_route_agent}
            onChange={e => setDraft({ ...draft, auto_route_agent: e.target.checked })}
          />
          自动路由到默认 Agent
        </label>
        <AIBtn
          tone="primary"
          onClick={async () => {
            if (draft.id) await agentApi.agentUpdateChannel(draft.id, draft)
            else await agentApi.agentCreateChannel(draft)
            setDraft(emptyDraft)
            await onReload()
          }}
        >
          {draft.id ? '保存渠道' : '创建渠道'}
        </AIBtn>
      </div>
    </div>
  )
}

type AISettingsTab = 'providers' | 'agents' | 'runtime' | 'channels'

function AIPanel() {
  const [tab, setTab] = useState<AISettingsTab>('providers')
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [templates, setTemplates] = useState<ProviderTemplate[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [config, setConfig] = useState<AgentConfig | null>(null)

  const loadProviders = useCallback(async () => {
    const [pr, tr] = await Promise.all([agentApi.getAgentProviders(), agentApi.getAgentProviderTemplates()])
    setProviders(pr.data)
    setTemplates(tr.data)
  }, [])
  const loadProfiles = useCallback(async () => {
    setProfiles((await agentApi.getAgentProfiles()).data)
  }, [])
  const loadConfig = useCallback(async () => {
    setConfig((await agentApi.getAgentConfig()).data)
  }, [])
  const loadChannels = useCallback(async () => {
    setChannels((await agentApi.agentListChannels()).data)
  }, [])

  useEffect(() => {
    void Promise.all([loadProviders(), loadProfiles(), loadConfig(), loadChannels()])
  }, [loadProviders, loadProfiles, loadConfig, loadChannels])

  const AI_TABS = [
    { key: 'providers' as AISettingsTab, label: 'Provider', icon: Cpu },
    { key: 'agents' as AISettingsTab, label: 'Agent', icon: Bot },
    { key: 'runtime' as AISettingsTab, label: '运行时', icon: Shield },
    { key: 'channels' as AISettingsTab, label: '渠道', icon: Radio }
  ]

  return (
    <div className="flex flex-col h-full px-5 py-4">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles size={16} className="text-[var(--vos-accent-primary)]" />
        <h2 className="vos-settings-section-title m-0">AI 助手配置</h2>
        <div className="flex items-center gap-1 rounded-xl p-1 ml-auto bg-[var(--vos-bg-input)]">
          {AI_TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border-none cursor-pointer"
                style={{
                  background: active ? 'var(--vos-accent-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--vos-text-secondary)'
                }}
                onClick={() => setTab(t.key)}
              >
                <Icon size={11} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'providers' && (
          <AIProviderSettings
            providers={providers}
            templates={templates}
            config={config}
            onReload={loadProviders}
            onConfigReload={loadConfig}
          />
        )}
        {tab === 'agents' && <AIAgentSettings profiles={profiles} providers={providers} onReload={loadProfiles} />}
        {tab === 'runtime' && (
          <AIRuntimeSettings config={config} profiles={profiles} providers={providers} onReload={loadConfig} />
        )}
        {tab === 'channels' && <AIChannelSettings channels={channels} profiles={profiles} onReload={loadChannels} />}
      </div>
    </div>
  )
}

const PANELS: Record<Category, React.ComponentType> = {
  appearance: AppearancePanel,
  desktop: DesktopPanel,
  notifications: NotificationsPanel,
  network: NetworkPanel,
  sound: SoundPanel,
  lockscreen: LockScreenPanel,
  location: LocationPanel,
  update: UpdatePanel,
  autostart: AutoStartPanel,
  ai: AIPanel,
  general: GeneralPanel
}

/* ---- About VentoOS Dialog (in Settings) ---- */
function AboutVentoOSDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="vos-modal-overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="vos-modal w-[340px] p-0 relative z-[7000]" onClick={e => e.stopPropagation()}>
        <div className="px-[28px] pt-[28px] pb-[24px] text-center">
          <div className="flex justify-center mb-[14px]">
            <BrandLogo size={72} />
          </div>
          <div className="text-[20px] font-bold text-[var(--vos-text-primary)] tracking-[-0.01em]">VentoOS</div>
          <div className="text-xs text-[var(--vos-text-secondary)] mt-1">版本 1.0.0</div>
          <div className="text-xs text-[var(--vos-text-secondary)] mt-3 leading-[1.7]">
            运维与基础设施管理平台
            <br />
            统一管理 Kubernetes、数据库、Redis 与远程文件系统
          </div>
          <div className="text-[11px] text-[var(--vos-text-secondary)] mt-3 opacity-70">© 2025 VentoOS Project</div>
          <div className="flex justify-center mt-5">
            <button type="button" className="vos-btn vos-btn-primary min-w-[80px]" onClick={onClose}>
              好
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---- Settings App Root ---- */
export default function SettingsApp(_props: { windowId: string; processId: number }) {
  const win = useWindowStore(s => s.windows.find(w => w.id === _props.windowId))
  const initialCategory = (win?.appState?.category as Category) ?? 'appearance'
  const [activeCategory, setActiveCategory] = useState<Category>(initialCategory)
  const [showAbout, setShowAbout] = useState(false)
  const Panel = PANELS[activeCategory]

  return (
    <div className="flex h-full items-stretch">
      {/* Sidebar */}
      <div className="vos-settings-sidebar">
        <div className="vos-label p-3 pb-2">设置</div>

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
              <CatIcon size={16} className="shrink-0" />
              <span>{cat.label}</span>
            </button>
          )
        })}

        <div className="flex-1" />
        <div className="p-2 px-3 border-t-[0.5px] border-t-solid border-t-[var(--vos-border-subtle)]">
          <button
            type="button"
            className="flex items-center gap-1.5 px-2 py-1.5 border-none bg-transparent cursor-pointer text-[var(--vos-text-secondary)] text-[11px] rounded-[6px] w-full"
            onClick={() => setShowAbout(true)}
          >
            <BrandLogo size={14} />
            <span>VentoOS</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="vos-flex-1 overflow-auto">
        <Panel />
      </div>

      {/* About Dialog */}
      {showAbout && <AboutVentoOSDialog onClose={() => setShowAbout(false)} />}
    </div>
  )
}
