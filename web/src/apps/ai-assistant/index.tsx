import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  User,
  Wand2,
  Wrench,
  X,
  XCircle
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentConfig,
  AgentProfile,
  AgentToolPolicyMode,
  ChatSession,
  ProviderConfig,
  ProviderProbeResult,
  ProviderTemplate,
  StreamEvent
} from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'

type SettingsTab = 'providers' | 'agents' | 'runtime'

export interface ProviderDraft extends ProviderConfig {}

export interface AgentProfileDraft extends AgentProfile {}

const panelBorder = '0.5px solid var(--vos-border-subtle)'

export function draftFromTemplate(template: ProviderTemplate): ProviderDraft {
  return {
    id: '',
    name: template.name,
    provider_type: template.provider_type,
    vendor: template.vendor,
    api_key: '',
    base_url: template.base_url,
    default_model: template.default_model,
    enabled: true,
    capabilities: template.capabilities
  }
}

export function createEmptyCustomProfile(): AgentProfileDraft {
  return {
    id: '',
    name: '自定义 Agent',
    description: '配置自己的行为约束、工具和默认模型。',
    preset_kind: 'custom',
    is_builtin: false,
    system_prompt: 'You are a custom VentoOS agent. Be precise, safe, and action-oriented.',
    behavior: {
      require_impact_for_destructive: true,
      read_only_mode: false,
      concise_output: true,
      extra_rules: []
    },
    tool_config: {
      mode: 'all',
      enabled_tools: ['read', 'write', 'edit', 'bash'],
      allow_bash: true
    },
    default_provider_id: undefined,
    default_model: undefined,
    temperature: 0.2,
    max_tokens: 1024,
    reasoning_mode: 'off'
  }
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-2">
      <div className="text-xs font-medium" style={{ color: 'var(--vos-text-secondary)' }}>
        {title}
      </div>
      {meta && (
        <div className="text-[11px] mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
          {meta}
        </div>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
      {children}
    </label>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full text-xs rounded-lg px-2 py-1.5 border-none outline-none"
      style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)' }}
    />
  )
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full text-xs rounded-lg px-2 py-2 border-none outline-none"
      style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)', resize: 'vertical' }}
    />
  )
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder
}: {
  value?: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full text-xs rounded-lg px-2 py-1.5 border-none outline-none"
      style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)' }}
    >
      <option value="">{placeholder ?? 'Select'}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function TinyButton({
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
  const palette =
    tone === 'primary'
      ? { background: 'var(--vos-accent-primary)', color: '#fff' }
      : tone === 'danger'
        ? { background: 'rgba(255,59,48,0.14)', color: '#ff3b30' }
        : { background: 'var(--vos-bg-input)', color: 'var(--vos-text-secondary)' }

  return (
    <button
      type="button"
      className="text-[11px] px-2.5 py-1.5 rounded-lg border-none cursor-pointer"
      style={{ ...palette, opacity: disabled ? 0.5 : 1 }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function MessageBubble({ msg }: { msg: ChatSession['messages'][number] }) {
  if (msg.role === 'system') return null

  if (msg.role === 'tool') {
    return (
      <div className="flex gap-3 mb-3">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
        >
          <Terminal size={14} />
        </div>
        <div
          className="max-w-[80%] px-3 py-2 rounded-lg text-xs leading-relaxed"
          style={{
            background: 'var(--vos-bg-surface)',
            color: 'var(--vos-text-secondary)',
            border: panelBorder,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          <div className="text-xs mb-1" style={{ color: 'var(--vos-text-tertiary)' }}>
            <Wrench size={10} className="inline mr-1" />
            {msg.name ?? 'tool'}
          </div>
          {(msg.content ?? '').slice(0, 600)}
          {(msg.content?.length ?? 0) > 600 && '...'}
        </div>
      </div>
    )
  }

  const isUser = msg.role === 'user'

  return (
    <div className="flex gap-3 mb-4" style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{
          background: isUser ? 'var(--vos-bg-input)' : 'var(--vos-accent-primary)',
          color: isUser ? 'var(--vos-text-primary)' : '#fff'
        }}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>
      <div
        className="max-w-[72%] px-3 py-2 rounded-lg text-sm leading-relaxed"
        style={{
          background: isUser ? 'var(--vos-accent-primary)' : 'var(--vos-bg-surface)',
          color: isUser ? '#fff' : 'var(--vos-text-primary)',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          whiteSpace: 'pre-wrap'
        }}
      >
        {msg.content ?? ''}
      </div>
    </div>
  )
}

function ToolCallEvent({ event }: { event: StreamEvent }) {
  if (event.type === 'tool_call_start') {
    return (
      <div className="flex gap-3 mb-2">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
        >
          <Wrench size={14} />
        </div>
        <div className="text-xs py-2" style={{ color: 'var(--vos-text-tertiary)' }}>
          Calling <strong>{event.name}</strong>...
        </div>
      </div>
    )
  }

  if (event.type === 'tool_result') {
    return (
      <div className="flex gap-3 mb-3">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: event.success ? 'var(--vos-bg-input)' : 'rgba(255,59,48,0.15)',
            color: event.success ? 'var(--vos-text-tertiary)' : '#ff3b30'
          }}
        >
          <Terminal size={14} />
        </div>
        <div
          className="max-w-[80%] px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'var(--vos-bg-surface)',
            border: panelBorder,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          <div className="mb-1" style={{ color: 'var(--vos-text-tertiary)' }}>
            {event.name} → {event.success ? '✓' : '✗'}
          </div>
          <div style={{ color: 'var(--vos-text-secondary)' }}>
            {event.content.slice(0, 300)}
            {event.content.length > 300 && '...'}
          </div>
        </div>
      </div>
    )
  }

  return null
}

function ProviderSettings({
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
  const [draft, setDraft] = useState<ProviderDraft>(() =>
    templates[0] ? draftFromTemplate(templates[0]) : draftFromTemplate({
      vendor: 'open_ai',
      provider_type: 'native',
      name: 'OpenAI',
      base_url: 'https://api.openai.com/v1',
      default_model: 'gpt-4o-mini',
      requires_api_key: true,
      capabilities: {
        supports_streaming: true,
        supports_tools: true,
        supports_reasoning_control: true,
        supports_connection_test: true,
        supports_model_fetch: false
      }
    })
  )
  const [saving, setSaving] = useState(false)
  const [probeResult, setProbeResult] = useState<ProviderProbeResult | null>(null)
  const [probeLoading, setProbeLoading] = useState(false)

  useEffect(() => {
    if (templates.length > 0 && !draft.vendor) {
      setDraft(draftFromTemplate(templates[0]))
    }
  }, [templates, draft.vendor])

  const applyTemplate = (vendor: string) => {
    const template = templates.find(item => item.vendor === vendor)
    if (!template) return
    setDraft(current => ({
      ...draftFromTemplate(template),
      id: current.id,
      api_key: current.api_key
    }))
    setProbeResult(null)
  }

  const handleSave = async () => {
    if (!draft.name || !draft.base_url || !draft.default_model) return
    setSaving(true)
    try {
      await apiClient.createAgentProvider(draft)
      setDraft(templates[0] ? draftFromTemplate(templates[0]) : createEmptyProvider())
      await onReload()
    } finally {
      setSaving(false)
    }
  }

  const handleProbe = async () => {
    setProbeLoading(true)
    try {
      const response = await apiClient.testAgentProvider({
        provider: draft,
        prompt: '1+1=?',
        max_tokens: 1,
        reasoning_mode: 'off',
        timeout_ms: 15000
      })
      setProbeResult(response.data)
    } finally {
      setProbeLoading(false)
    }
  }

  const handleSetDefault = async (providerId: string) => {
    if (!config) return
    await apiClient.updateAgentConfig({ ...config, default_provider_id: providerId })
    await onConfigReload()
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="w-[48%] overflow-auto">
        <SectionTitle title="Provider Inventory" meta="原生 provider 与 OpenAI-compatible provider 都在这里统一管理。" />
        <div className="space-y-2">
          {providers.map(provider => (
            <div key={provider.id} className="rounded-xl p-3" style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                    {provider.name}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                    {provider.vendor} · {provider.default_model}
                  </div>
                </div>
                <div className="flex gap-2">
                  <TinyButton onClick={() => setDraft(provider)}>Load</TinyButton>
                  <TinyButton onClick={() => handleSetDefault(provider.id)} tone="primary">
                    Default
                  </TinyButton>
                  <TinyButton tone="danger" onClick={() => apiClient.deleteAgentProvider(provider.id).then(onReload)}>
                    Delete
                  </TinyButton>
                </div>
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--vos-text-tertiary)' }}>
                {provider.base_url} · Key: {provider.api_key}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <SectionTitle title="Provider Editor" meta="支持官方模板、地址确认、最小探针测试。OpenAI-compatible 主要差异就是 base_url。" />
        <div className="space-y-3 rounded-xl p-3" style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Template</FieldLabel>
              <SelectInput
                value={draft.vendor}
                onChange={applyTemplate}
                options={templates.map(template => ({
                  value: template.vendor,
                  label: `${template.name} (${template.provider_type})`
                }))}
              />
            </div>
            <div>
              <FieldLabel>Name</FieldLabel>
              <TextInput value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Base URL</FieldLabel>
              <TextInput value={draft.base_url} onChange={e => setDraft({ ...draft, base_url: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Default Model</FieldLabel>
              <TextInput
                value={draft.default_model}
                onChange={e => setDraft({ ...draft, default_model: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Provider Type</FieldLabel>
              <TextInput value={draft.provider_type} readOnly />
            </div>
            <div>
              <FieldLabel>API Key</FieldLabel>
              <TextInput
                type="password"
                value={draft.api_key}
                onChange={e => setDraft({ ...draft, api_key: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <TinyButton tone="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Provider'}
            </TinyButton>
            <TinyButton onClick={handleProbe} disabled={probeLoading}>
              {probeLoading ? 'Testing...' : 'Probe 1+1'}
            </TinyButton>
          </div>

          {probeResult && (
            <div className="rounded-xl p-3" style={{ background: 'var(--vos-bg-input)' }}>
              <div className="flex items-center gap-2 text-sm">
                {probeResult.success ? (
                  <CheckCircle2 size={15} style={{ color: '#34c759' }} />
                ) : (
                  <XCircle size={15} style={{ color: '#ff3b30' }} />
                )}
                <span style={{ color: 'var(--vos-text-primary)' }}>{probeResult.message}</span>
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--vos-text-tertiary)' }}>
                {probeResult.provider_name} · {probeResult.model} · {probeResult.latency_ms}ms
                {probeResult.status_code ? ` · HTTP ${probeResult.status_code}` : ''}
              </div>
              {probeResult.response_preview && (
                <div className="text-xs mt-2" style={{ color: 'var(--vos-text-secondary)' }}>
                  Preview: {probeResult.response_preview}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentSettings({
  profiles,
  providers,
  onReload
}: {
  profiles: AgentProfile[]
  providers: ProviderConfig[]
  onReload: () => Promise<void>
}) {
  const [draft, setDraft] = useState<AgentProfileDraft>(createEmptyCustomProfile())

  const providerOptions = providers.map(provider => ({
    value: provider.id,
    label: `${provider.name} · ${provider.default_model}`
  }))

  const handleSave = async () => {
    if (!draft.name || !draft.system_prompt) return
    if (draft.id) {
      await apiClient.updateAgentProfile(draft.id, draft)
    } else {
      await apiClient.createAgentProfile(draft)
    }
    await onReload()
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="w-[44%] overflow-auto">
        <SectionTitle title="Agent Profiles" meta="内置 4 个常用预设，并支持自定义复制与编辑。" />
        <div className="space-y-2">
          <TinyButton tone="primary" onClick={() => setDraft(createEmptyCustomProfile())}>
            New Custom Agent
          </TinyButton>
          {profiles.map(profile => (
            <div key={profile.id} className="rounded-xl p-3" style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                    {profile.name}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                    {profile.preset_kind} {profile.is_builtin ? '· preset' : '· custom'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <TinyButton onClick={() => setDraft({ ...profile })}>Edit</TinyButton>
                  {!profile.is_builtin && (
                    <TinyButton tone="danger" onClick={() => apiClient.deleteAgentProfile(profile.id).then(onReload)}>
                      Delete
                    </TinyButton>
                  )}
                </div>
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--vos-text-tertiary)' }}>
                {profile.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <SectionTitle title="Agent Editor" meta="配置行为约束、工具策略、系统提示词、默认模型与推理强度。" />
        <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Name</FieldLabel>
              <TextInput value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <TextInput
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Default Provider</FieldLabel>
              <SelectInput
                value={draft.default_provider_id}
                onChange={value => setDraft({ ...draft, default_provider_id: value || undefined })}
                options={providerOptions}
                placeholder="Inherit"
              />
            </div>
            <div>
              <FieldLabel>Default Model</FieldLabel>
              <TextInput
                value={draft.default_model ?? ''}
                onChange={e => setDraft({ ...draft, default_model: e.target.value || undefined })}
              />
            </div>
            <div>
              <FieldLabel>Reasoning Mode</FieldLabel>
              <SelectInput
                value={draft.reasoning_mode}
                onChange={value => setDraft({ ...draft, reasoning_mode: value as AgentProfile['reasoning_mode'] })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' }
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Temperature</FieldLabel>
              <TextInput
                type="number"
                value={String(draft.temperature)}
                onChange={e => setDraft({ ...draft, temperature: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <FieldLabel>Max Tokens</FieldLabel>
              <TextInput
                type="number"
                value={String(draft.max_tokens)}
                onChange={e => setDraft({ ...draft, max_tokens: Number(e.target.value) || 1 })}
              />
            </div>
            <div>
              <FieldLabel>Tool Policy</FieldLabel>
              <SelectInput
                value={draft.tool_config.mode}
                onChange={value =>
                  setDraft({
                    ...draft,
                    tool_config: { ...draft.tool_config, mode: value as AgentToolPolicyMode }
                  })
                }
                options={[
                  { value: 'all', label: 'All Tools' },
                  { value: 'allow_list', label: 'Allow List' },
                  { value: 'disabled', label: 'Disabled' }
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
            <label className="flex items-center gap-2">
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
              Destructive impact warning
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.behavior.read_only_mode}
                onChange={e =>
                  setDraft({
                    ...draft,
                    behavior: { ...draft.behavior, read_only_mode: e.target.checked }
                  })
                }
              />
              Read-only mode
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.tool_config.allow_bash}
                onChange={e =>
                  setDraft({
                    ...draft,
                    tool_config: { ...draft.tool_config, allow_bash: e.target.checked }
                  })
                }
              />
              Allow bash
            </label>
          </div>

          <div>
            <FieldLabel>Enabled Tools</FieldLabel>
            <TextInput
              value={draft.tool_config.enabled_tools.join(', ')}
              onChange={e =>
                setDraft({
                  ...draft,
                  tool_config: {
                    ...draft.tool_config,
                    enabled_tools: e.target.value
                      .split(',')
                      .map(item => item.trim())
                      .filter(Boolean)
                  }
                })
              }
            />
          </div>

          <div>
            <FieldLabel>System Prompt</FieldLabel>
            <TextArea
              rows={6}
              value={draft.system_prompt}
              onChange={e => setDraft({ ...draft, system_prompt: e.target.value })}
            />
          </div>

          <div>
            <FieldLabel>Extra Rules</FieldLabel>
            <TextArea
              rows={3}
              value={draft.behavior.extra_rules.join('\n')}
              onChange={e =>
                setDraft({
                  ...draft,
                  behavior: {
                    ...draft.behavior,
                    extra_rules: e.target.value
                      .split('\n')
                      .map(item => item.trim())
                      .filter(Boolean)
                  }
                })
              }
            />
          </div>

          <TinyButton tone="primary" onClick={handleSave}>
            Save Agent
          </TinyButton>
        </div>
      </div>
    </div>
  )
}

function RuntimeSettings({
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

  if (!draft) {
    return <div className="text-sm" style={{ color: 'var(--vos-text-tertiary)' }}>Loading runtime config…</div>
  }

  return (
    <div className="max-w-[760px] rounded-xl p-4" style={{ background: 'var(--vos-bg-surface)', border: panelBorder }}>
      <SectionTitle title="Runtime Defaults" meta="设置全局默认 provider、默认 agent、默认系统提示词和 agent loop 上限。" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Default Provider</FieldLabel>
          <SelectInput
            value={draft.default_provider_id}
            onChange={value => setDraft({ ...draft, default_provider_id: value || undefined })}
            options={providers.map(provider => ({ value: provider.id, label: provider.name }))}
            placeholder="Unset"
          />
        </div>
        <div>
          <FieldLabel>Default Agent</FieldLabel>
          <SelectInput
            value={draft.default_agent_profile_id}
            onChange={value => setDraft({ ...draft, default_agent_profile_id: value || undefined })}
            options={profiles.map(profile => ({ value: profile.id, label: profile.name }))}
            placeholder="Unset"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <FieldLabel>Default Model</FieldLabel>
          <TextInput
            value={draft.default_model ?? ''}
            onChange={e => setDraft({ ...draft, default_model: e.target.value || undefined })}
          />
        </div>
        <div>
          <FieldLabel>Max Iterations</FieldLabel>
          <TextInput
            type="number"
            value={String(draft.max_iterations)}
            onChange={e => setDraft({ ...draft, max_iterations: Number(e.target.value) || 1 })}
          />
        </div>
      </div>
      <div className="mt-3">
        <FieldLabel>Default System Prompt</FieldLabel>
        <TextArea
          rows={6}
          value={draft.default_system_prompt}
          onChange={e => setDraft({ ...draft, default_system_prompt: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-xs mt-3" style={{ color: 'var(--vos-text-secondary)' }}>
        <input
          type="checkbox"
          checked={draft.tools_enabled}
          onChange={e => setDraft({ ...draft, tools_enabled: e.target.checked })}
        />
        Enable tools globally
      </label>
      <div className="mt-3">
        <TinyButton
          tone="primary"
          onClick={() => apiClient.updateAgentConfig(draft).then(onReload)}
        >
          Save Runtime Config
        </TinyButton>
      </div>
    </div>
  )
}

function SettingsPanel({
  tab,
  onTabChange,
  onClose,
  providers,
  templates,
  profiles,
  config,
  onReloadProviders,
  onReloadProfiles,
  onReloadConfig
}: {
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  onClose: () => void
  providers: ProviderConfig[]
  templates: ProviderTemplate[]
  profiles: AgentProfile[]
  config: AgentConfig | null
  onReloadProviders: () => Promise<void>
  onReloadProfiles: () => Promise<void>
  onReloadConfig: () => Promise<void>
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-3 gap-3 flex-shrink-0" style={{ borderBottom: panelBorder }}>
        <Settings size={15} style={{ color: 'var(--vos-text-tertiary)' }} />
        <span className="text-sm font-medium flex-1">AI Control Center</span>
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--vos-bg-input)' }}>
          {[
            { key: 'providers', label: 'Providers', icon: Cpu },
            { key: 'agents', label: 'Agents', icon: Bot },
            { key: 'runtime', label: 'Runtime', icon: Shield }
          ].map(item => {
            const Icon = item.icon
            const active = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer"
                style={{
                  background: active ? 'var(--vos-accent-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--vos-text-secondary)'
                }}
                onClick={() => onTabChange(item.key as SettingsTab)}
              >
                <Icon size={12} />
                {item.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="bg-transparent border-none cursor-pointer p-0"
          style={{ color: 'var(--vos-text-tertiary)' }}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === 'providers' && (
          <ProviderSettings
            providers={providers}
            templates={templates}
            config={config}
            onReload={onReloadProviders}
            onConfigReload={onReloadConfig}
          />
        )}
        {tab === 'agents' && (
          <AgentSettings profiles={profiles} providers={providers} onReload={onReloadProfiles} />
        )}
        {tab === 'runtime' && (
          <RuntimeSettings config={config} profiles={profiles} providers={providers} onReload={onReloadConfig} />
        )}
      </div>
    </div>
  )
}

function createEmptyProvider(): ProviderDraft {
  return {
    id: '',
    name: '',
    provider_type: 'native',
    vendor: 'open_ai',
    api_key: '',
    base_url: '',
    default_model: '',
    enabled: true
  }
}

export default function AIAssistantApp(_props: AppComponentProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatSession['messages']>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [toolEvents, setToolEvents] = useState<StreamEvent[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('providers')
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [templates, setTemplates] = useState<ProviderTemplate[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const activeProfile = useMemo(
    () => profiles.find(profile => profile.id === selectedAgentId) ?? null,
    [profiles, selectedAgentId]
  )
  const activeProvider = useMemo(
    () => providers.find(provider => provider.id === config?.default_provider_id) ?? null,
    [providers, config?.default_provider_id]
  )

  const loadSessions = useCallback(async () => {
    const response = await apiClient.getAgentSessions()
    setSessions(response.data)
  }, [])

  const loadProviders = useCallback(async () => {
    const [providerResponse, templateResponse] = await Promise.all([
      apiClient.getAgentProviders(),
      apiClient.getAgentProviderTemplates()
    ])
    setProviders(providerResponse.data)
    setTemplates(templateResponse.data)
  }, [])

  const loadProfiles = useCallback(async () => {
    const response = await apiClient.getAgentProfiles()
    setProfiles(response.data)
  }, [])

  const loadConfig = useCallback(async () => {
    const response = await apiClient.getAgentConfig()
    setConfig(response.data)
    setSelectedAgentId(response.data.default_agent_profile_id ?? '')
  }, [])

  useEffect(() => {
    void Promise.all([loadSessions(), loadProviders(), loadProfiles(), loadConfig()])
  }, [loadSessions, loadProviders, loadProfiles, loadConfig])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, toolEvents])

  const selectSession = async (id: string) => {
    setCurrentSession(id)
    setStreamingContent('')
    setToolEvents([])
    const response = await apiClient.getAgentSession(id)
    setMessages(response.data.messages)
    setSelectedAgentId(response.data.agent_profile_id ?? config?.default_agent_profile_id ?? '')
  }

  const newSession = () => {
    setCurrentSession(null)
    setMessages([])
    setStreamingContent('')
    setToolEvents([])
  }

  const deleteSession = async (id: string) => {
    await apiClient.deleteAgentSession(id)
    if (currentSession === id) {
      newSession()
    }
    await loadSessions()
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    setStreamingContent('')
    setToolEvents([])
    setMessages(prev => [...prev, { role: 'user', content: text }])

    try {
      let sessionId = currentSession
      const nextEvents: StreamEvent[] = []

      for await (const event of apiClient.agentChatStream({
        message: text,
        session_id: currentSession ?? undefined,
        agent_profile_id: selectedAgentId || undefined
      })) {
        switch (event.type) {
          case 'content_delta':
            setStreamingContent(prev => prev + event.content)
            break
          case 'tool_call_start':
          case 'tool_result':
            nextEvents.push(event)
            setToolEvents([...nextEvents])
            break
          case 'message_complete':
            setStreamingContent('')
            setToolEvents([])
            setMessages(prev => [...prev, event.message])
            break
          case 'done':
            sessionId = event.session_id
            break
          case 'error':
            setStreamingContent('')
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.message}` }])
            break
        }
      }

      if (!currentSession && sessionId) {
        setCurrentSession(sessionId)
      }

      await loadSessions()
    } catch (error) {
      console.error(error)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Check provider connectivity, API key, and selected agent config.'
        }
      ])
    } finally {
      setSending(false)
    }
  }

  if (showSettings) {
    return (
      <SettingsPanel
        tab={settingsTab}
        onTabChange={setSettingsTab}
        onClose={() => setShowSettings(false)}
        providers={providers}
        templates={templates}
        profiles={profiles}
        config={config}
        onReloadProviders={loadProviders}
        onReloadProfiles={loadProfiles}
        onReloadConfig={loadConfig}
      />
    )
  }

  return (
    <div className="flex h-full">
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{ width: 220, borderRight: panelBorder, background: 'var(--vos-bg-surface)' }}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
            SESSIONS
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => {
                setSettingsTab('providers')
                setShowSettings(true)
              }}
              title="Settings"
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-accent-primary)' }}
              onClick={newSession}
              title="New Session"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        {sessions.map(session => (
          <div
            key={session.id}
            className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group"
            style={{ background: currentSession === session.id ? 'var(--vos-bg-item-hover)' : 'transparent' }}
          >
            <MessageSquare size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
            <span className="flex-1 truncate" onClick={() => void selectSession(session.id)} onKeyDown={() => {}}>
              {session.title}
            </span>
            <button
              type="button"
              className="hidden group-hover:block bg-transparent border-none p-0 cursor-pointer"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => void deleteSession(session.id)}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: panelBorder }}>
          <div className="flex items-center gap-2">
            <Wand2 size={16} style={{ color: 'var(--vos-accent-primary)' }} />
            <span className="text-sm font-medium">AI Assistant</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-1.5 rounded-lg"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => {
                setSettingsTab('providers')
                setShowSettings(true)
              }}
              title="Settings"
            >
              <Settings size={15} />
            </button>
            <div className="min-w-[220px]">
              <SelectInput
                value={selectedAgentId}
                onChange={setSelectedAgentId}
                options={profiles.map(profile => ({
                  value: profile.id,
                  label: profile.name
                }))}
                placeholder="Choose Agent"
              />
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
            >
              <Cpu size={12} />
              {activeProvider ? activeProvider.name : 'No default provider'}
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-tertiary)' }}
            >
              <Bot size={12} />
              {activeProfile ? activeProfile.name : 'No agent'}
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-auto px-4 py-3"
          style={{
            background: 'var(--vos-bg-surface)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)'
          }}
        >
          {messages.length === 0 && !streamingContent && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center max-w-[520px]">
                <Sparkles size={36} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
                <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                  VentoOS AI Control Center
                </div>
                <div className="text-xs mt-2" style={{ color: 'var(--vos-text-tertiary)' }}>
                  配置 provider、执行 1+1 最小探针、切换预设 / 自定义 agent，然后开始对话。
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <MessageBubble key={`msg-${index}`} msg={msg} />
          ))}

          {toolEvents.map((event, index) => (
            <ToolCallEvent key={`tool-${index}`} event={event} />
          ))}

          {streamingContent && (
            <div className="flex gap-3 mb-4">
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              >
                <Sparkles size={14} />
              </div>
              <div
                className="max-w-[72%] px-3 py-2 rounded-lg text-sm leading-relaxed"
                style={{
                  background: 'var(--vos-bg-surface)',
                  color: 'var(--vos-text-primary)',
                  borderRadius: '12px 12px 12px 4px',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {streamingContent}
                <span className="animate-pulse">▊</span>
              </div>
            </div>
          )}

          {sending && !streamingContent && toolEvents.length === 0 && (
            <div className="flex gap-3 mb-4">
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              >
                <Sparkles size={14} />
              </div>
              <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--vos-bg-surface)' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: panelBorder }}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <input
                type="text"
                className="w-full text-sm bg-transparent border-none outline-none rounded-lg px-3 py-2"
                style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)' }}
                placeholder={providers.length === 0 ? 'Configure a provider first...' : 'Ask anything…'}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleSend()}
                disabled={providers.length === 0 || !selectedAgentId}
              />
              <div className="flex items-center gap-4 mt-2 text-[11px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                <span className="flex items-center gap-1">
                  <Bot size={11} />
                  {activeProfile?.description ?? 'Select an agent profile'}
                </span>
                <span className="flex items-center gap-1">
                  <ChevronDown size={11} />
                  Runtime defaults come from Provider / Agent settings
                </span>
              </div>
            </div>
            <button
              type="button"
              className="flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer self-start"
              style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
              onClick={() => void handleSend()}
              disabled={sending || providers.length === 0 || !selectedAgentId}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
