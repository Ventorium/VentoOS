/**
 * Settings App — System Preferences
 *
 * macOS-style settings with sidebar categories and content panels.
 * Categories: Appearance, Desktop & Dock, Notifications, AI, General
 */

import {
  Bell,
  Bot,
  CheckCircle2,
  Cpu,
  Info,
  Layout,
  Monitor,
  Palette,
  Radio,
  Shield,
  Sparkles,
  XCircle
} from 'lucide-react'
import type React from 'react'
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
import { apiClient } from '@/infra/api'
import { useWindowStore } from '@/kernel'
import { useNotificationStore } from '@/services/notification'
import { type ThemeMode, useSettingsStore } from '@/services/settings'

type Category = 'appearance' | 'desktop' | 'notifications' | 'ai' | 'general'

const CATEGORIES = [
  { id: 'appearance' as Category, label: '外观', icon: Palette },
  { id: 'desktop' as Category, label: '桌面与Dock', icon: Layout },
  { id: 'notifications' as Category, label: '通知', icon: Bell },
  { id: 'ai' as Category, label: 'AI 助手', icon: Bot },
  { id: 'general' as Category, label: '通用', icon: Monitor }
]

/* ---- Appearance Settings ---- */
function AppearancePanel() {
  const { themeMode, setThemeMode, wallpaper, setWallpaper } = useSettingsStore()
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

  const accentColors = ['#007AFF', '#FF3B30', '#FF9500', '#30D158', '#5AC8FA', '#BF5AF2', '#FF2D55', '#A2845E']

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
          {bingLoading && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--vos-text-tertiary)' }}>加载中…</span>
          )}
        </label>
        {!bingLoading && bingWallpapers.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>暂无 Bing 壁纸（网络不可用）</p>
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
          <span className="text-[13px] min-w-[30px]" style={{ color: 'var(--vos-text-secondary)' }}>
            {dockSize}px
          </span>
        </div>
      </div>

      <div className="vos-settings-group">
        <label className="vos-settings-label">Dock位置</label>
        <div className="flex gap-2">
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
            <div className="text-sm font-medium">放大效果</div>
            <div className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
              鼠标悬停时放大Dock图标
            </div>
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
            <div className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
              鼠标移到底部时显示Dock
            </div>
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
            <div className="text-sm font-medium">勿扰模式</div>
            <div className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
              暂停所有通知横幅
            </div>
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

      <div className="vos-settings-group opacity-50">
        <label className="vos-settings-label">应用通知（即将推出）</label>
        <p className="text-[13px]" style={{ color: 'var(--vos-text-secondary)' }}>
          即将支持每个应用的通知权限控制。
        </p>
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
          className="flex items-center gap-4 p-4 rounded-lg"
          style={{ background: 'var(--vos-bg-surface)', border: '0.5px solid var(--vos-border-default)' }}
        >
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f3460)' }}
          >
            <svg width="30" height="30" viewBox="0 0 16 16" fill="white">
              <circle cx="8" cy="4.5" r="2.5" />
              <path d="M8 9c-3 0-5.5 1.3-5.5 3S5 15 8 15s5.5-1.3 5.5-3S11 9 8 9z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-[15px]">VentoOS</div>
            <div className="text-[13px]" style={{ color: 'var(--vos-text-secondary)' }}>
              版本 0.1.0
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--vos-text-tertiary)' }}>
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

/* ---- AI Assistant Settings ---- */
const panelBorder = '0.5px solid var(--vos-border-subtle)'

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
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} className="vos-select">
      <option value="">{placeholder ?? '请选择'}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
          已配置的 Provider
        </div>
        <div className="space-y-2">
          {providers.map(p => (
            <div
              key={p.id}
              className="rounded-xl p-2.5"
              style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                    {p.name}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--vos-text-tertiary)' }}>
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
              <div className="text-[10px] mt-1.5" style={{ color: 'var(--vos-text-tertiary)' }}>
                {p.base_url}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
          编辑 / 新建 Provider
        </div>
        <div
          className="space-y-2.5 rounded-xl p-3"
          style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}
        >
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
            <div className="rounded-xl p-2.5" style={{ background: 'var(--vos-bg-input)' }}>
              <div className="flex items-center gap-2 text-xs">
                {probeResult.success ? (
                  <CheckCircle2 size={13} style={{ color: '#34c759' }} />
                ) : (
                  <XCircle size={13} style={{ color: '#ff3b30' }} />
                )}
                <span style={{ color: 'var(--vos-text-primary)' }}>{probeResult.message}</span>
              </div>
              <div className="text-[10px] mt-1.5" style={{ color: 'var(--vos-text-tertiary)' }}>
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
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
          Agent 列表
        </div>
        <div className="space-y-2">
          <AIBtn tone="primary" onClick={() => setDraft(emptyDraft)}>
            + 新建自定义 Agent
          </AIBtn>
          {profiles.map(p => (
            <div
              key={p.id}
              className="rounded-xl p-2.5"
              style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                    {p.name}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--vos-text-tertiary)' }}>
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
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
          编辑 Agent
        </div>
        <div
          className="rounded-xl p-3 space-y-2.5"
          style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}
        >
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
          <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
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

  if (!draft)
    return (
      <div className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
        加载中…
      </div>
    )

  return (
    <div
      className="max-w-[640px] rounded-xl p-3 space-y-2.5"
      style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}
    >
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
        全局运行时配置
      </div>
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
      <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
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
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--vos-text-secondary)' }}>
          已接入的渠道
        </div>
        <div className="space-y-2">
          <AIBtn tone="primary" onClick={() => setDraft(emptyDraft)}>
            + 新建渠道
          </AIBtn>
          {channels.map(c => (
            <div
              key={c.id}
              className="rounded-xl p-2.5 cursor-pointer"
              style={{
                background: draft.id === c.id ? 'var(--vos-bg-active)' : 'var(--vos-bg-surface)',
                border: panelBorder
              }}
              onClick={() => setDraft({ ...c })}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium">{c.name}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--vos-text-tertiary)' }}>
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
      <div
        className="flex-1 overflow-auto rounded-xl p-3 space-y-2.5"
        style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}
      >
        <div className="text-xs font-medium" style={{ color: 'var(--vos-text-secondary)' }}>
          {draft.id ? '编辑渠道' : '新建渠道'}
        </div>
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
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={e => setDraft({ ...draft, enabled: e.target.checked })}
          />
          启用此渠道
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
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
        <Sparkles size={16} style={{ color: 'var(--vos-accent-primary)' }} />
        <h2 className="vos-settings-section-title" style={{ margin: 0 }}>
          AI 助手配置
        </h2>
        <div className="flex items-center gap-1 rounded-xl p-1 ml-auto" style={{ background: 'var(--vos-bg-input)' }}>
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
  ai: AIPanel,
  general: GeneralPanel
}

/* ---- Settings App Root ---- */
export default function SettingsApp(_props: { windowId: string; processId: number }) {
  const win = useWindowStore(s => s.windows.find(w => w.id === _props.windowId))
  const initialCategory = (win?.appState?.category as Category) ?? 'appearance'
  const [activeCategory, setActiveCategory] = useState<Category>(initialCategory)
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
              <CatIcon size={16} style={{ flexShrink: 0 }} />
              <span>{cat.label}</span>
            </button>
          )
        })}

        <div className="flex-1" />
        <div className="p-2 px-3" style={{ borderTop: '0.5px solid var(--vos-border-subtle)' }}>
          <div className="vos-settings-nav-item opacity-60">
            <Info size={14} />
            <span className="text-[11px]">VentoOS</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="vos-flex-1 overflow-auto">
        <Panel />
      </div>
    </div>
  )
}
