/**
 * SshServers — SSH Server management panel
 *
 * Left sidebar: group tree (derived from server.group field)
 * Right main:   server list with toolbar, context menu, batch ops
 * Modals:       server create/edit form, SSH config import
 */

import { CircleDot, Copy, Download, FolderOpen, Link, Monitor, Pencil, Plus, Server, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { superTerminalApi } from '@/apps/super-terminal/api'
import { useSuperTerminalStore } from '@/apps/super-terminal/store'
import type {
  CreateSshServerReq,
  JumpHost,
  ProxyConfig,
  SshAuthMethod,
  SshConfigHost,
  SshServer
} from '@/apps/super-terminal/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ── Constants ──────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 240
const ROW_HEIGHT = 48
const GIT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com', 'coding.net']

// ── Helpers ────────────────────────────────────────────────────────────────

function osIcon(osType?: string) {
  if (!osType) {
    return (
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Server size={18} style={{ color: 'var(--vos-text-tertiary)' }} />
        <span
          style={{
            position: 'absolute',
            bottom: -4,
            right: -6,
            fontSize: 9,
            color: 'var(--vos-text-tertiary)',
            background: '#252525',
            borderRadius: 3,
            padding: '0 2px',
            lineHeight: 1.2
          }}
        >
          ?
        </span>
      </span>
    )
  }
  const lower = osType.toLowerCase()
  if (lower.includes('ubuntu') || lower.includes('debian') || lower.includes('linux'))
    return <Monitor size={18} style={{ color: '#e95420' }} />
  if (lower.includes('centos') || lower.includes('rhel') || lower.includes('fedora'))
    return <Monitor size={18} style={{ color: '#9ccd2a' }} />
  if (lower.includes('windows')) return <Monitor size={18} style={{ color: '#00a4ef' }} />
  if (lower.includes('darwin') || lower.includes('macos') || lower.includes('mac'))
    return <Monitor size={18} style={{ color: '#999' }} />
  return <Monitor size={18} style={{ color: 'var(--vos-text-secondary)' }} />
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

/** Build default empty form data */
function emptyFormData(): ServerFormData {
  return {
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    privateKey: '',
    keyPath: '',
    group: '',
    remark: '',
    connectTimeout: 10000,
    heartbeatMs: 30000,
    defaultPath: '',
    initScript: '',
    jumpType: 'none',
    jumpServerId: '',
    jumpHost: '',
    jumpPort: 22,
    jumpUsername: '',
    jumpPassword: '',
    jumpPrivateKey: '',
    proxyEnabled: false,
    proxyAddress: ''
  }
}

function serverToFormData(s: SshServer): ServerFormData {
  const authType =
    s.auth_method.type === 'password' ? 'password' : s.auth_method.type === 'private_key' ? 'private_key' : 'agent'
  const keyPath = s.auth_method.type === 'private_key' ? (s.auth_method.key_path ?? '') : ''
  return {
    name: s.name,
    host: s.host,
    port: s.port,
    username: s.username,
    authType,
    password: '',
    privateKey: '',
    keyPath,
    group: s.group ?? '',
    remark: s.remark ?? '',
    connectTimeout: s.connect_timeout_ms,
    heartbeatMs: s.heartbeat_ms,
    defaultPath: s.default_path ?? '',
    initScript: s.init_script ?? '',
    jumpType: s.jump_host ? (s.jump_host.type === 'existing' ? 'existing' : 'manual') : 'none',
    jumpServerId: s.jump_host?.type === 'existing' ? s.jump_host.server_id : '',
    jumpHost: s.jump_host?.type === 'manual' ? s.jump_host.host : '',
    jumpPort: s.jump_host?.type === 'manual' ? (s.jump_host.port ?? 22) : 22,
    jumpUsername: s.jump_host?.type === 'manual' ? s.jump_host.username : '',
    jumpPassword: '',
    jumpPrivateKey: '',
    proxyEnabled: s.proxy?.enabled ?? false,
    proxyAddress: s.proxy?.address ?? ''
  }
}

function formDataToReq(f: ServerFormData): CreateSshServerReq {
  let auth_method: SshAuthMethod
  let password: string | undefined
  let private_key: string | undefined

  if (f.authType === 'password') {
    auth_method = { type: 'password' }
    password = f.password || undefined
  } else if (f.authType === 'private_key') {
    auth_method = { type: 'private_key', key_path: f.keyPath || null }
    private_key = f.privateKey || undefined
  } else {
    auth_method = { type: 'agent' }
  }

  let jump_host: JumpHost | undefined
  if (f.jumpType === 'existing' && f.jumpServerId) {
    jump_host = { type: 'existing', server_id: f.jumpServerId }
  } else if (f.jumpType === 'manual' && f.jumpHost) {
    const jumpAuth: SshAuthMethod = f.jumpPrivateKey ? { type: 'private_key' } : { type: 'password' }
    jump_host = {
      type: 'manual',
      host: f.jumpHost,
      port: f.jumpPort,
      username: f.jumpUsername,
      auth_method: jumpAuth,
      password: f.jumpPassword || undefined,
      private_key: f.jumpPrivateKey || undefined
    }
  }

  let proxy: ProxyConfig | undefined
  if (f.proxyEnabled && f.proxyAddress) {
    proxy = { enabled: true, address: f.proxyAddress }
  }

  return {
    name: f.name,
    host: f.host,
    port: f.port,
    username: f.username,
    auth_method,
    group: f.group || undefined,
    remark: f.remark || undefined,
    connect_timeout_ms: f.connectTimeout,
    heartbeat_ms: f.heartbeatMs,
    default_path: f.defaultPath || undefined,
    init_script: f.initScript || undefined,
    jump_host,
    proxy,
    password,
    private_key
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ServerFormData {
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'private_key' | 'agent'
  password: string
  privateKey: string
  keyPath: string
  group: string
  remark: string
  connectTimeout: number
  heartbeatMs: number
  defaultPath: string
  initScript: string
  jumpType: 'none' | 'existing' | 'manual'
  jumpServerId: string
  jumpHost: string
  jumpPort: number
  jumpUsername: string
  jumpPassword: string
  jumpPrivateKey: string
  proxyEnabled: boolean
  proxyAddress: string
}

interface ContextMenuState {
  x: number
  y: number
  type: 'server' | 'group' | 'sidebar-empty'
  serverId?: string
  groupName?: string
}

// ── Inline style tag ───────────────────────────────────────────────────────

const hoverStyles = `
  .ssh-row:hover { background: rgba(255,255,255,0.03) !important; }
  .ssh-row.selected { background: rgba(22,104,220,0.15) !important; }
  .ssh-ctx-item:hover { background: #333 !important; }
  .ssh-group-item:hover { background: rgba(255,255,255,0.05) !important; }
  .ssh-group-item.active { background: rgba(22,104,220,0.18) !important; }
  .ssh-server-name:hover { text-decoration: underline; }
  .ssh-copy-btn { opacity: 0; transition: opacity 0.15s; }
  .ssh-row:hover .ssh-copy-btn { opacity: 1; }
  .ssh-form-tabs .tab { padding: 6px 14px; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--vos-text-secondary); }
  .ssh-form-tabs .tab.active { color: var(--vos-accent-primary); border-bottom-color: var(--vos-accent-primary); }
  .ssh-form-tabs .tab:hover { color: var(--vos-text-primary); }
`

// ── Context menu ───────────────────────────────────────────────────────────

function CtxMenu({
  x,
  y,
  items,
  onDismiss
}: {
  x: number
  y: number
  items: { label: string; danger?: boolean; onClick: () => void }[]
  onDismiss: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const nx = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : x
    const ny = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handler, true)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler, true)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onDismiss])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        background: '#252525',
        border: '1px solid #444',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 160,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        userSelect: 'none'
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className="ssh-ctx-item"
          style={{
            padding: '6px 16px',
            cursor: 'pointer',
            fontSize: 13,
            color: item.danger ? '#ff453a' : '#d4d4d4',
            whiteSpace: 'nowrap'
          }}
          onClick={e => {
            e.stopPropagation()
            item.onClick()
            onDismiss()
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}

// ── Server form modal ──────────────────────────────────────────────────────

function ServerFormModal({
  open,
  editingServer,
  groups,
  servers,
  onClose,
  onSubmit
}: {
  open: boolean
  editingServer: SshServer | null
  groups: string[]
  servers: SshServer[]
  onClose: () => void
  onSubmit: (data: CreateSshServerReq) => void
}) {
  const [form, setForm] = useState<ServerFormData>(emptyFormData)
  const [activeTab, setActiveTab] = useState('basic')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(editingServer ? serverToFormData(editingServer) : emptyFormData())
      setActiveTab('basic')
      setSubmitting(false)
    }
  }, [open, editingServer])

  const updateField = <K extends keyof ServerFormData>(key: K, value: ServerFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) return
    setSubmitting(true)
    try {
      onSubmit(formDataToReq(form))
    } finally {
      setSubmitting(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: 'var(--vos-text-secondary)',
    marginBottom: 4
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    fontSize: 13,
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 4,
    color: 'var(--vos-text-primary)',
    outline: 'none',
    boxSizing: 'border-box'
  }
  const rowStyle: React.CSSProperties = { marginBottom: 12 }
  const twoColStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12
  }

  const tabs = [
    { key: 'basic', label: '基本信息' },
    { key: 'connection', label: '连接设置' },
    { key: 'init', label: '初始化' },
    { key: 'jump', label: '跳板机' },
    { key: 'proxy', label: '代理' }
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingServer ? '编辑服务器' : '新建服务器'}
      width={520}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary vos-btn-sm"
            disabled={submitting || !form.name.trim() || !form.host.trim() || !form.username.trim()}
            onClick={handleSubmit}
          >
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      }
    >
      {/* Tabs */}
      <div
        className="ssh-form-tabs"
        style={{
          display: 'flex',
          borderBottom: '1px solid #333',
          marginBottom: 16,
          gap: 4
        }}
      >
        {tabs.map(t => (
          <div key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Tab: Basic */}
      {activeTab === 'basic' && (
        <div>
          <div style={rowStyle}>
            <label style={labelStyle}>分组</label>
            <input
              list="ssh-group-datalist"
              style={inputStyle}
              value={form.group}
              onChange={e => updateField('group', e.target.value)}
              placeholder="选择或输入分组名称"
            />
            <datalist id="ssh-group-datalist">
              {groups.map(g => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>
              名称 <span style={{ color: '#ff453a' }}>*</span>
            </label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="My Server"
            />
          </div>
          <div style={twoColStyle}>
            <div style={rowStyle}>
              <label style={labelStyle}>
                地址 <span style={{ color: '#ff453a' }}>*</span>
              </label>
              <input
                style={inputStyle}
                value={form.host}
                onChange={e => updateField('host', e.target.value)}
                placeholder="192.168.1.100"
              />
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>端口</label>
              <input
                type="number"
                style={inputStyle}
                value={form.port}
                onChange={e => updateField('port', Number(e.target.value) || 22)}
              />
            </div>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>
              用户名 <span style={{ color: '#ff453a' }}>*</span>
            </label>
            <input
              style={inputStyle}
              value={form.username}
              onChange={e => updateField('username', e.target.value)}
              placeholder="root"
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>认证方式</label>
            <select
              style={inputStyle}
              value={form.authType}
              onChange={e => updateField('authType', e.target.value as 'password' | 'private_key' | 'agent')}
            >
              <option value="password">密码</option>
              <option value="private_key">密钥</option>
              <option value="agent">SSH Agent</option>
            </select>
          </div>
          {form.authType === 'password' && (
            <div style={rowStyle}>
              <label style={labelStyle}>密码</label>
              <input
                type="password"
                style={inputStyle}
                value={form.password}
                onChange={e => updateField('password', e.target.value)}
                placeholder="输入密码"
              />
            </div>
          )}
          {form.authType === 'private_key' && (
            <>
              <div style={rowStyle}>
                <label style={labelStyle}>密钥路径</label>
                <input
                  style={inputStyle}
                  value={form.keyPath}
                  onChange={e => updateField('keyPath', e.target.value)}
                  placeholder="~/.ssh/id_rsa"
                />
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>密钥内容（可选，优先于路径）</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                  value={form.privateKey}
                  onChange={e => updateField('privateKey', e.target.value)}
                  placeholder="粘贴私钥内容…"
                />
              </div>
            </>
          )}
          <div style={rowStyle}>
            <label style={labelStyle}>备注</label>
            <input
              style={inputStyle}
              value={form.remark}
              onChange={e => updateField('remark', e.target.value)}
              placeholder="可选备注"
            />
          </div>
        </div>
      )}

      {/* Tab: Connection */}
      {activeTab === 'connection' && (
        <div>
          <div style={rowStyle}>
            <label style={labelStyle}>连接超时 (ms)</label>
            <input
              type="number"
              style={inputStyle}
              value={form.connectTimeout}
              onChange={e => updateField('connectTimeout', Number(e.target.value) || 10000)}
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>心跳间隔 (ms)</label>
            <input
              type="number"
              style={inputStyle}
              value={form.heartbeatMs}
              onChange={e => updateField('heartbeatMs', Number(e.target.value) || 30000)}
            />
          </div>
        </div>
      )}

      {/* Tab: Init */}
      {activeTab === 'init' && (
        <div>
          <div style={rowStyle}>
            <label style={labelStyle}>默认路径</label>
            <input
              style={inputStyle}
              value={form.defaultPath}
              onChange={e => updateField('defaultPath', e.target.value)}
              placeholder="/home/user"
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>初始化脚本</label>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'monospace' }}
              value={form.initScript}
              onChange={e => updateField('initScript', e.target.value)}
              placeholder={'# 连接后自动执行的命令\nexport LANG=en_US.UTF-8'}
            />
          </div>
        </div>
      )}

      {/* Tab: Jump host */}
      {activeTab === 'jump' && (
        <div>
          <div style={rowStyle}>
            <label style={labelStyle}>跳板机方式</label>
            <select
              style={inputStyle}
              value={form.jumpType}
              onChange={e => updateField('jumpType', e.target.value as 'none' | 'existing' | 'manual')}
            >
              <option value="none">不使用跳板机</option>
              <option value="existing">选择已有服务器</option>
              <option value="manual">手动输入</option>
            </select>
          </div>
          {form.jumpType === 'existing' && (
            <div style={rowStyle}>
              <label style={labelStyle}>选择服务器</label>
              <select
                style={inputStyle}
                value={form.jumpServerId}
                onChange={e => updateField('jumpServerId', e.target.value)}
              >
                <option value="">-- 请选择 --</option>
                {servers
                  .filter(s => s.id !== editingServer?.id)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.host})
                    </option>
                  ))}
              </select>
            </div>
          )}
          {form.jumpType === 'manual' && (
            <>
              <div style={twoColStyle}>
                <div style={rowStyle}>
                  <label style={labelStyle}>地址</label>
                  <input
                    style={inputStyle}
                    value={form.jumpHost}
                    onChange={e => updateField('jumpHost', e.target.value)}
                    placeholder="jump.example.com"
                  />
                </div>
                <div style={rowStyle}>
                  <label style={labelStyle}>端口</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={form.jumpPort}
                    onChange={e => updateField('jumpPort', Number(e.target.value) || 22)}
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>用户名</label>
                <input
                  style={inputStyle}
                  value={form.jumpUsername}
                  onChange={e => updateField('jumpUsername', e.target.value)}
                />
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>密码</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={form.jumpPassword}
                  onChange={e => updateField('jumpPassword', e.target.value)}
                  placeholder="留空则使用密钥"
                />
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>密钥内容（可选）</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                  value={form.jumpPrivateKey}
                  onChange={e => updateField('jumpPrivateKey', e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Proxy */}
      {activeTab === 'proxy' && (
        <div>
          <div style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--vos-text-primary)' }}>启用代理</label>
            <input
              type="checkbox"
              checked={form.proxyEnabled}
              onChange={e => updateField('proxyEnabled', e.target.checked)}
            />
          </div>
          {form.proxyEnabled && (
            <div style={rowStyle}>
              <label style={labelStyle}>代理地址</label>
              <input
                style={inputStyle}
                value={form.proxyAddress}
                onChange={e => updateField('proxyAddress', e.target.value)}
                placeholder="socks5://127.0.0.1:1080 或 http://proxy:8080"
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Import SSH config modal ────────────────────────────────────────────────

function ImportConfigModal({
  open,
  onClose,
  onImport
}: {
  open: boolean
  onClose: () => void
  onImport: (hosts: SshConfigHost[]) => void
}) {
  const [hosts, setHosts] = useState<SshConfigHost[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    superTerminalApi
      .getSshConfigHosts()
      .then(res => {
        const filtered = (res.data ?? []).filter(
          h => !GIT_HOSTS.some(g => h.hostname?.includes(g) || h.alias.includes(g))
        )
        setHosts(filtered)
        setSelected(new Set())
      })
      .catch(() => setHosts([]))
      .finally(() => setLoading(false))
  }, [open])

  const allSelected = hosts.length > 0 && selected.size === hosts.length

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(hosts.map(h => h.alias)))
    }
  }

  const toggle = (alias: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(alias)) next.delete(alias)
      else next.add(alias)
      return next
    })
  }

  const handleImport = () => {
    const toImport = hosts.filter(h => selected.has(h.alias))
    onImport(toImport)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="导入 SSH 配置"
      icon={<Download size={16} />}
      width={560}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>
            已选 {selected.size} / {hosts.length} 项
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="vos-btn vos-btn-primary vos-btn-sm"
              disabled={selected.size === 0}
              onClick={handleImport}
            >
              导入选中 ({selected.size})
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--vos-text-tertiary)' }}>加载中…</div>
      ) : hosts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--vos-text-tertiary)' }}>
          未找到可导入的 SSH 配置
        </div>
      ) : (
        <div>
          {/* Select all */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              paddingBottom: 8,
              borderBottom: '1px solid #333'
            }}
          >
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span style={{ fontSize: 13, color: 'var(--vos-text-secondary)' }}>全选</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {hosts.map(h => (
              <label
                key={h.alias}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid #222',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(h.alias)}
                  onChange={() => toggle(h.alias)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--vos-text-primary)',
                      fontWeight: 500
                    }}
                  >
                    {h.alias}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', marginTop: 2 }}>
                    {h.hostname ?? '—'}
                    {h.port ? `:${h.port}` : ''}
                    {h.user ? ` (${h.user})` : ''}
                    {h.identity_file ? ` 🔑 ${h.identity_file}` : ''}
                    {h.proxy_jump ? ` ⤵ ${h.proxy_jump}` : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Rename group inline modal ──────────────────────────────────────────────

function RenameGroupModal({
  open,
  groupName,
  onClose,
  onConfirm
}: {
  open: boolean
  groupName: string
  onClose: () => void
  onConfirm: (newName: string) => void
}) {
  const [value, setValue] = useState(groupName)
  useEffect(() => {
    if (open) setValue(groupName)
  }, [open, groupName])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="重命名分组"
      width={360}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary vos-btn-sm"
            disabled={!value.trim() || value.trim() === groupName}
            onClick={() => onConfirm(value.trim())}
          >
            确定
          </button>
        </div>
      }
    >
      <input
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: 13,
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 4,
          color: 'var(--vos-text-primary)',
          outline: 'none',
          boxSizing: 'border-box'
        }}
        value={value}
        onChange={e => setValue(e.target.value)}
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter' && value.trim() && value.trim() !== groupName) {
            onConfirm(value.trim())
          }
        }}
      />
    </Modal>
  )
}

// ── Delete confirmation modal ──────────────────────────────────────────────

function DeleteConfirmModal({
  open,
  message,
  onClose,
  onConfirm
}: {
  open: boolean
  message: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="确认删除"
      width={360}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-danger vos-btn-sm" onClick={onConfirm}>
            删除
          </button>
        </div>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--vos-text-secondary)', margin: 0 }}>{message}</p>
    </Modal>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SshServers() {
  const servers = useSuperTerminalStore(s => s.servers)
  const groups = useSuperTerminalStore(s => s.groups)
  const selectedGroup = useSuperTerminalStore(s => s.selectedGroup)
  const setSelectedGroup = useSuperTerminalStore(s => s.setSelectedGroup)
  const setServers = useSuperTerminalStore(s => s.setServers)
  const removeServer = useSuperTerminalStore(s => s.removeServer)
  const addSessionTab = useSuperTerminalStore(s => s.addSessionTab)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)

  // Modal state
  const [formOpen, setFormOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<SshServer | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [renameGroupOpen, setRenameGroupOpen] = useState(false)
  const [renameGroupTarget, setRenameGroupTarget] = useState('')
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    message: string
    onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)

  // ── Data loading ─────────────────────────────────────────────────────

  useEffect(() => {
    superTerminalApi
      .getSshServers()
      .then(res => {
        if (res.data) setServers(res.data)
      })
      .catch(() => {})
  }, [setServers])

  // ── Derived ──────────────────────────────────────────────────────────

  const filteredServers = useMemo(() => {
    if (!selectedGroup) return servers
    return servers.filter(s => (s.group ?? '') === selectedGroup)
  }, [servers, selectedGroup])

  const groupCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of servers) {
      const g = s.group ?? ''
      map[g] = (map[g] ?? 0) + 1
    }
    return map
  }, [servers])

  // ── Connect to server ────────────────────────────────────────────────

  const connectServer = useCallback(
    (server: SshServer) => {
      addSessionTab({
        id: crypto.randomUUID(),
        serverId: server.id,
        serverName: server.name,
        title: server.name
      })
    },
    [addSessionTab]
  )

  // ── Selection helpers ────────────────────────────────────────────────

  const handleRowClick = useCallback(
    (serverId: string, e: React.MouseEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey

      if (isShift && lastClickedId) {
        // Range select
        const ids = filteredServers.map(s => s.id)
        const startIdx = ids.indexOf(lastClickedId)
        const endIdx = ids.indexOf(serverId)
        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx)
          const max = Math.max(startIdx, endIdx)
          const rangeIds = ids.slice(min, max + 1)
          setSelectedIds(prev => {
            const next = new Set(prev)
            for (const id of rangeIds) next.add(id)
            return next
          })
        }
      } else if (isMeta) {
        // Toggle select
        setSelectedIds(prev => {
          const next = new Set(prev)
          if (next.has(serverId)) next.delete(serverId)
          else next.add(serverId)
          return next
        })
        setLastClickedId(serverId)
      } else {
        setSelectedIds(new Set([serverId]))
        setLastClickedId(serverId)
      }
    },
    [lastClickedId, filteredServers]
  )

  const handleCheckboxChange = useCallback((serverId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(serverId)
      else next.delete(serverId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(filteredServers.map(s => s.id)))
      } else {
        setSelectedIds(new Set())
      }
    },
    [filteredServers]
  )

  // ── Server CRUD ──────────────────────────────────────────────────────

  const handleFormSubmit = useCallback(
    async (data: CreateSshServerReq) => {
      try {
        if (editingServer) {
          const res = await superTerminalApi.updateSshServer(editingServer.id, data)
          if (res.data) {
            const updated = servers.map(s => (s.id === editingServer.id ? res.data : s))
            setServers(updated)
          }
        } else {
          const res = await superTerminalApi.createSshServer(data)
          if (res.data) {
            setServers([...servers, res.data])
          }
        }
        setFormOpen(false)
        setEditingServer(null)
      } catch {
        // Error handling left to API layer
      }
    },
    [editingServer, servers, setServers]
  )

  const handleDeleteServer = useCallback(
    async (id: string) => {
      try {
        await superTerminalApi.deleteSshServer(id)
        removeServer(id)
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } catch {
        // noop
      }
    },
    [removeServer]
  )

  const handleDuplicate = useCallback(
    async (server: SshServer) => {
      const req: CreateSshServerReq = {
        name: `${server.name} (副本)`,
        host: server.host,
        port: server.port,
        username: server.username,
        auth_method: server.auth_method,
        group: server.group,
        tags: [...server.tags],
        remark: server.remark,
        connect_timeout_ms: server.connect_timeout_ms,
        heartbeat_ms: server.heartbeat_ms,
        default_path: server.default_path,
        init_script: server.init_script,
        jump_host: server.jump_host,
        proxy: server.proxy
      }
      try {
        const res = await superTerminalApi.createSshServer(req)
        if (res.data) {
          setServers([...servers, res.data])
        }
      } catch {
        // noop
      }
    },
    [servers, setServers]
  )

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    try {
      await Promise.all(ids.map(id => superTerminalApi.deleteSshServer(id)))
      const remaining = servers.filter(s => !selectedIds.has(s.id))
      setServers(remaining)
      setSelectedIds(new Set())
    } catch {
      // partial delete — reload
      superTerminalApi.getSshServers().then(res => {
        if (res.data) setServers(res.data)
      })
    }
  }, [selectedIds, servers, setServers])

  const handleBatchConnect = useCallback(() => {
    for (const id of selectedIds) {
      const server = servers.find(s => s.id === id)
      if (server) connectServer(server)
    }
  }, [selectedIds, servers, connectServer])

  // ── Group operations ─────────────────────────────────────────────────

  const handleRenameGroup = useCallback(
    async (oldName: string, newName: string) => {
      const affected = servers.filter(s => s.group === oldName)
      try {
        await Promise.all(affected.map(s => superTerminalApi.updateSshServer(s.id, { group: newName })))
        const updated = servers.map(s => (s.group === oldName ? { ...s, group: newName } : s))
        setServers(updated)
        if (selectedGroup === oldName) setSelectedGroup(newName)
      } catch {
        // noop
      }
      setRenameGroupOpen(false)
    },
    [servers, setServers, selectedGroup, setSelectedGroup]
  )

  const handleDeleteGroup = useCallback(
    async (groupName: string) => {
      const affected = servers.filter(s => s.group === groupName)
      try {
        await Promise.all(affected.map(s => superTerminalApi.updateSshServer(s.id, { group: undefined })))
        const updated = servers.map(s => (s.group === groupName ? { ...s, group: undefined } : s))
        setServers(updated)
        if (selectedGroup === groupName) setSelectedGroup(null)
      } catch {
        // noop
      }
    },
    [servers, setServers, selectedGroup, setSelectedGroup]
  )

  const handleNewGroup = useCallback(() => {
    setNewGroupName('')
    setNewGroupOpen(true)
  }, [])

  const confirmNewGroup = useCallback(
    (name: string) => {
      if (name && !groups.includes(name)) {
        // Just select the new group; it'll appear when a server is assigned to it
        setSelectedGroup(name)
        // Manually add to store for immediate UI feedback
        const store = useSuperTerminalStore.getState()
        store.setGroups([...groups, name].sort())
      }
      setNewGroupOpen(false)
    },
    [groups, setSelectedGroup]
  )

  // ── Import SSH config ────────────────────────────────────────────────

  const handleImportConfirm = useCallback(
    async (hosts: SshConfigHost[]) => {
      const reqs: CreateSshServerReq[] = hosts.map(h => {
        const authMethod: SshAuthMethod = h.identity_file
          ? { type: 'private_key', key_path: h.identity_file }
          : { type: 'password' }

        let jumpHost: JumpHost | undefined
        if (h.proxy_jump) {
          // proxy_jump might be "user@host:port" or just "host"
          const match = h.proxy_jump.match(/^(?:(\S+)@)?(\S+?)(?::(\d+))?$/)
          if (match) {
            jumpHost = {
              type: 'manual',
              host: match[2],
              port: match[3] ? Number(match[3]) : 22,
              username: match[1] ?? 'root',
              auth_method: { type: 'agent' }
            }
          }
        }

        return {
          name: h.alias,
          host: h.hostname ?? h.alias,
          port: h.port ?? 22,
          username: h.user ?? 'root',
          auth_method: authMethod,
          group: 'SSH Config',
          jump_host: jumpHost
        }
      })

      try {
        const results = await Promise.all(reqs.map(r => superTerminalApi.createSshServer(r)))
        const newServers = results.filter(r => r.data).map(r => r.data!)
        setServers([...servers, ...newServers])
      } catch {
        // partial import — reload
        superTerminalApi.getSshServers().then(res => {
          if (res.data) setServers(res.data)
        })
      }
      setImportOpen(false)
    },
    [servers, setServers]
  )

  // ── Context menu helpers ─────────────────────────────────────────────

  const dismissCtx = useCallback(() => setCtxMenu(null), [])

  const serverCtxItems = useCallback(
    (serverId: string) => {
      const server = servers.find(s => s.id === serverId)
      if (!server) return []
      return [
        {
          label: '连接',
          onClick: () => connectServer(server)
        },
        {
          label: '编辑',
          onClick: () => {
            setEditingServer(server)
            setFormOpen(true)
          }
        },
        {
          label: '复制',
          onClick: () => handleDuplicate(server)
        },
        {
          label: '删除',
          danger: true,
          onClick: () => {
            setDeleteConfirm({
              open: true,
              message: `确定删除服务器「${server.name}」吗？此操作不可恢复。`,
              onConfirm: () => {
                handleDeleteServer(server.id)
                setDeleteConfirm(p => ({ ...p, open: false }))
              }
            })
          }
        }
      ]
    },
    [servers, connectServer, handleDuplicate, handleDeleteServer]
  )

  const groupCtxItems = useCallback(
    (groupName: string) => [
      {
        label: '重命名',
        onClick: () => {
          setRenameGroupTarget(groupName)
          setRenameGroupOpen(true)
        }
      },
      {
        label: '删除分组',
        danger: true,
        onClick: () => {
          setDeleteConfirm({
            open: true,
            message: `删除分组「${groupName}」？组内服务器不会被删除，仅解除分组关联。`,
            onConfirm: () => {
              handleDeleteGroup(groupName)
              setDeleteConfirm(p => ({ ...p, open: false }))
            }
          })
        }
      }
    ],
    [handleDeleteGroup]
  )

  const allChecked = filteredServers.length > 0 && filteredServers.every(s => selectedIds.has(s.id))
  const someChecked = filteredServers.some(s => selectedIds.has(s.id))

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#1a1a1a',
        color: 'var(--vos-text-primary)',
        overflow: 'hidden'
      }}
    >
      <style>{hoverStyles}</style>

      {/* ── Left sidebar ────────────────────────────────────────────── */}
      <div
        style={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          height: '100%',
          background: '#141414',
          borderRight: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onContextMenu={e => {
          e.preventDefault()
          // Only show "new group" if right-clicking empty area
          const target = e.target as HTMLElement
          if (!target.closest('[data-group]')) {
            setCtxMenu({
              x: e.clientX,
              y: e.clientY,
              type: 'sidebar-empty'
            })
          }
        }}
      >
        <div
          style={{
            padding: '12px 12px 8px',
            fontSize: 11,
            color: 'var(--vos-text-tertiary)',
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase'
          }}
        >
          分组
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* All servers */}
          <div
            className={`ssh-group-item ${selectedGroup === null ? 'active' : ''}`}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRadius: 4,
              margin: '0 4px'
            }}
            onClick={() => setSelectedGroup(null)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FolderOpen size={14} style={{ color: 'var(--vos-accent-primary)' }} />
              全部服务器
            </span>
            <span style={{ fontSize: 11, color: 'var(--vos-text-tertiary)' }}>{servers.length}</span>
          </div>

          {/* Groups */}
          {groups.map(g => (
            <div
              key={g}
              data-group={g}
              className={`ssh-group-item ${selectedGroup === g ? 'active' : ''}`}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: 4,
                margin: '0 4px'
              }}
              onClick={() => setSelectedGroup(g)}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setCtxMenu({
                  x: e.clientX,
                  y: e.clientY,
                  type: 'group',
                  groupName: g
                })
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                <FolderOpen size={14} style={{ color: 'var(--vos-text-tertiary)' }} />
                {g}
              </span>
              <span style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', flexShrink: 0 }}>
                {groupCounts[g] ?? 0}
              </span>
            </div>
          ))}

          {/* Ungrouped if any */}
          {(groupCounts[''] ?? 0) > 0 && (
            <div
              data-group=""
              className={`ssh-group-item ${selectedGroup === '' ? 'active' : ''}`}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: 4,
                margin: '0 4px',
                color: 'var(--vos-text-tertiary)'
              }}
              onClick={() => setSelectedGroup('')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderOpen size={14} />
                未分组
              </span>
              <span style={{ fontSize: 11 }}>{groupCounts['']}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Right main area ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid #333',
            flexShrink: 0
          }}
        >
          <button
            type="button"
            className="vos-btn vos-btn-primary vos-btn-sm"
            onClick={() => {
              setEditingServer(null)
              setFormOpen(true)
            }}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            新建服务器
          </button>
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={() => setImportOpen(true)}>
            <Download size={14} style={{ marginRight: 4 }} />
            导入 SSH 配置
          </button>

          {someChecked && (
            <>
              <div style={{ width: 1, height: 20, background: '#444', margin: '0 4px' }} />
              <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={handleBatchConnect}>
                <Link size={14} style={{ marginRight: 4 }} />
                批量连接 ({selectedIds.size})
              </button>
              <button
                type="button"
                className="vos-btn vos-btn-danger vos-btn-sm"
                onClick={() => {
                  setDeleteConfirm({
                    open: true,
                    message: `确定删除选中的 ${selectedIds.size} 台服务器吗？此操作不可恢复。`,
                    onConfirm: () => {
                      handleBatchDelete()
                      setDeleteConfirm(p => ({ ...p, open: false }))
                    }
                  })
                }}
              >
                <Trash2 size={14} style={{ marginRight: 4 }} />
                批量删除 ({selectedIds.size})
              </button>
            </>
          )}

          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>共 {filteredServers.length} 台</span>
        </div>

        {/* Server list */}
        {filteredServers.length === 0 ? (
          <EmptyState
            icon={<Server size={40} />}
            title="暂无服务器"
            description={selectedGroup ? '当前分组无服务器' : '点击上方按钮新建或导入服务器'}
            action={
              <button
                type="button"
                className="vos-btn vos-btn-primary vos-btn-sm"
                onClick={() => {
                  setEditingServer(null)
                  setFormOpen(true)
                }}
              >
                <Plus size={14} style={{ marginRight: 4 }} />
                新建服务器
              </button>
            }
          />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Header row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 36,
                padding: '0 16px',
                borderBottom: '1px solid #333',
                fontSize: 11,
                color: 'var(--vos-text-tertiary)',
                fontWeight: 600,
                flexShrink: 0
              }}
            >
              <div style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => {
                    if (el) el.indeterminate = someChecked && !allChecked
                  }}
                  onChange={e => handleSelectAll(e.target.checked)}
                />
              </div>
              <div style={{ width: 32 }} />
              <div style={{ flex: 2, minWidth: 120 }}>名称</div>
              <div style={{ flex: 2, minWidth: 140 }}>地址</div>
              <div style={{ flex: 2, minWidth: 100 }}>备注</div>
              <div style={{ width: 80 }}>状态</div>
            </div>

            {/* Rows */}
            {filteredServers.map(server => {
              const isSelected = selectedIds.has(server.id)
              return (
                <div
                  key={server.id}
                  className={`ssh-row ${isSelected ? 'selected' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: ROW_HEIGHT,
                    padding: '0 16px',
                    borderBottom: '1px solid #262626',
                    cursor: 'default',
                    fontSize: 13
                  }}
                  onClick={e => handleRowClick(server.id, e)}
                  onContextMenu={e => {
                    e.preventDefault()
                    setCtxMenu({
                      x: e.clientX,
                      y: e.clientY,
                      type: 'server',
                      serverId: server.id
                    })
                  }}
                >
                  {/* Checkbox */}
                  <div style={{ width: 32, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => handleCheckboxChange(server.id, e.target.checked)}
                    />
                  </div>

                  {/* OS icon */}
                  <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                    {osIcon(server.os_type)}
                  </div>

                  {/* Name */}
                  <div
                    style={{
                      flex: 2,
                      minWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span
                      className="ssh-server-name"
                      style={{
                        cursor: 'pointer',
                        color: 'var(--vos-accent-primary)',
                        fontWeight: 500
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        connectServer(server)
                      }}
                    >
                      {server.name}
                    </span>
                  </div>

                  {/* Address */}
                  <div
                    style={{
                      flex: 2,
                      minWidth: 140,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      overflow: 'hidden'
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--vos-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                        fontSize: 12
                      }}
                    >
                      {server.host}:{server.port}
                    </span>
                    <button
                      type="button"
                      className="ssh-copy-btn"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--vos-text-tertiary)',
                        flexShrink: 0
                      }}
                      title="复制地址"
                      onClick={e => {
                        e.stopPropagation()
                        copyToClipboard(`${server.host}:${server.port}`)
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  </div>

                  {/* Remark */}
                  <div
                    style={{
                      flex: 2,
                      minWidth: 100,
                      color: 'var(--vos-text-tertiary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 12
                    }}
                  >
                    {server.remark || '—'}
                  </div>

                  {/* Status */}
                  <div style={{ width: 80, flexShrink: 0 }}>
                    <StatusBadge status={server.status} icon={<CircleDot size={10} />} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Context menu ────────────────────────────────────────────── */}
      {ctxMenu && ctxMenu.type === 'server' && ctxMenu.serverId && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={serverCtxItems(ctxMenu.serverId)} onDismiss={dismissCtx} />
      )}
      {ctxMenu && ctxMenu.type === 'group' && ctxMenu.groupName != null && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={groupCtxItems(ctxMenu.groupName)} onDismiss={dismissCtx} />
      )}
      {ctxMenu && ctxMenu.type === 'sidebar-empty' && (
        <CtxMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[{ label: '新建分组', onClick: handleNewGroup }]}
          onDismiss={dismissCtx}
        />
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}
      <ServerFormModal
        open={formOpen}
        editingServer={editingServer}
        groups={groups}
        servers={servers}
        onClose={() => {
          setFormOpen(false)
          setEditingServer(null)
        }}
        onSubmit={handleFormSubmit}
      />
      <ImportConfigModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImportConfirm} />
      <RenameGroupModal
        open={renameGroupOpen}
        groupName={renameGroupTarget}
        onClose={() => setRenameGroupOpen(false)}
        onConfirm={newName => handleRenameGroup(renameGroupTarget, newName)}
      />
      {/* New group modal (reuse rename modal pattern) */}
      <Modal
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        title="新建分组"
        width={360}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={() => setNewGroupOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="vos-btn vos-btn-primary vos-btn-sm"
              disabled={!newGroupName.trim()}
              onClick={() => confirmNewGroup(newGroupName.trim())}
            >
              创建
            </button>
          </div>
        }
      >
        <input
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: 13,
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 4,
            color: 'var(--vos-text-primary)',
            outline: 'none',
            boxSizing: 'border-box'
          }}
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          placeholder="输入分组名称"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && newGroupName.trim()) {
              confirmNewGroup(newGroupName.trim())
            }
          }}
        />
      </Modal>
      <DeleteConfirmModal
        open={deleteConfirm.open}
        message={deleteConfirm.message}
        onClose={() => setDeleteConfirm(p => ({ ...p, open: false }))}
        onConfirm={deleteConfirm.onConfirm}
      />
    </div>
  )
}
