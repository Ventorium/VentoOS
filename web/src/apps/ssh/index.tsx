/**
 * SSH Management App
 *
 * Tabs:
 *  1. SSH 服务器 — CRUD, 测试连接, 打开 WebShell
 *  2. 端口映射   — CRUD, 启动/停止
 *  3. 服务暴露   — CRUD, 启动/停止
 */
import './styles.css'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Download,
  ExternalLink,
  Globe,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Square,
  Terminal,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import { FormSelect, ModalOverlay } from '@/components/ui'
import { useCallback, useEffect, useState } from 'react'
import type { PreferenceGroup } from '@/components/PreferencesPanel'
import PreferencesPanel from '@/components/PreferencesPanel'
import { Tabs } from '@/components/ui'
import type { AppComponentProps } from '@/kernel'
import { openWindow, registerAppMenus, unregisterAppMenus, useAppStorage } from '@/kernel'
import {
  sshApi as api,
  type CreatePortMappingReq,
  type CreateServiceExposureReq,
  type CreateSshServerReq,
  type PortMapping,
  type ServiceExposure,
  type SshConfigHost,
  type SshKeyFile,
  type SshServer
} from './api'
import ResourceMonitorPanel from './ResourceMonitorPanel'

type TabId = 'servers' | 'port-mappings' | 'exposures'

/* ─── Status Badge ─────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    connected: { color: 'var(--vos-accent-success)', icon: <CheckCircle2 size={11} /> },
    active: { color: 'var(--vos-accent-success)', icon: <CheckCircle2 size={11} /> },
    connecting: { color: 'var(--vos-accent-warning)', icon: <Loader2 size={11} className="vos-spin" /> },
    starting: { color: 'var(--vos-accent-warning)', icon: <Loader2 size={11} className="vos-spin" /> },
    disconnected: { color: 'var(--vos-text-tertiary)', icon: <Circle size={11} /> },
    stopped: { color: 'var(--vos-text-tertiary)', icon: <Circle size={11} /> },
    error: { color: 'var(--vos-accent-danger)', icon: <AlertCircle size={11} /> }
  }
  const s = map[status] ?? map.disconnected
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color: s.color }}>
      {s.icon} {status}
    </span>
  )
}

/* ─── Delete Confirm Button ────────────────────────────────── */
function DelBtn({ onConfirm }: { onConfirm: () => void }) {
  const [confirm, setConfirm] = useState(false)
  if (confirm)
    return (
      <button type="button" className="ml-auto vos-btn vos-btn-danger px-[10px] py-[3px] text-xs" onClick={onConfirm}>
        确认删除
      </button>
    )
  return (
    <button type="button" className="vos-icon-btn" onClick={() => setConfirm(true)} title="删除">
      <Trash2 size={14} />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   SSH Server Section
═══════════════════════════════════════════════════════════ */
function ServersTab({
  onToggleMonitor,
  monitorServerId
}: {
  onToggleMonitor: (id: string) => void
  monitorServerId: string | null
}) {
  const [servers, setServers] = useState<SshServer[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)
  const [passwordPrompt, setPasswordPrompt] = useState<{ server: SshServer; pw: string } | null>(null)
  const [savingPw, setSavingPw] = useState(false)
  const [importingConfig, setImportingConfig] = useState(false)
  const [sshConfigHosts, setSshConfigHosts] = useState<SshConfigHost[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getSshServers()
      setServers(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(id: string) {
    await api.deleteSshServer(id)
    load()
  }

  function handleOpenShell(srv: SshServer) {
    const hasCredential =
      srv.auth_method.type === 'private_key' || (srv.auth_method.type === 'password' && srv.auth_method.credential_id)
    if (!hasCredential) {
      // Password auth with no stored password — prompt user
      setPasswordPrompt({ server: srv, pw: '' })
      return
    }
    openWindow('terminal', {
      title: `SSH: ${srv.name}`,
      width: 780,
      height: 520,
      appState: { sshTarget: srv.id, sshName: srv.name }
    })
  }

  async function handleSavePasswordAndOpen() {
    if (!passwordPrompt) return
    setSavingPw(true)
    try {
      await api.updateSshServer(passwordPrompt.server.id, { password: passwordPrompt.pw })
      const updated = await api.getSshServers()
      setServers(updated.data)
      const srv = updated.data.find(s => s.id === passwordPrompt.server.id) ?? passwordPrompt.server
      setPasswordPrompt(null)
      openWindow('terminal', {
        title: `SSH: ${srv.name}`,
        width: 780,
        height: 520,
        appState: { sshTarget: srv.id, sshName: srv.name }
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSavingPw(false)
    }
  }

  async function handleTest(id: string) {
    setTesting(id)
    setTestResult(null)
    try {
      const res = await api.testSshServer(id)
      setTestResult({ id, ok: res.data.success, msg: res.data.message })
    } catch (e: unknown) {
      setTestResult({ id, ok: false, msg: e instanceof Error ? e.message : '连接失败' })
    } finally {
      setTesting(null)
    }
  }

  async function handleImportConfig() {
    setImportingConfig(true)
    try {
      const res = await api.getSshConfigHosts()
      setSshConfigHosts(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setImportingConfig(false)
    }
  }

  async function importConfigHost(host: SshConfigHost, closeOnSuccess = true) {
    try {
      const authMethod: CreateSshServerReq['auth_method'] = host.identity_file
        ? { type: 'private_key', key_path: host.identity_file }
        : host.auto_detected_key
          ? { type: 'private_key', key_path: host.auto_detected_key }
          : { type: 'agent' }
      await api.createSshServer({
        name: host.alias,
        host: host.hostname ?? host.alias,
        port: host.port ?? 22,
        username: host.user ?? 'root',
        auth_method: authMethod
      })
      load()
      if (closeOnSuccess) {
        setSshConfigHosts(null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function importAllConfigHosts() {
    if (!sshConfigHosts || sshConfigHosts.length === 0) return
    setImportingConfig(true)
    try {
      // 并行导入所有服务器
      await Promise.all(sshConfigHosts.map(host => importConfigHost(host, false)))
      setSshConfigHosts(null)
    } finally {
      setImportingConfig(false)
    }
  }

  return (
    <div className="ssh-section">
      <div className="ssh-toolbar">
        <span className="ssh-count">{servers.length} 台服务器</span>
        <div className="flex gap-[6px]">
          <button type="button" className="vos-icon-btn" onClick={load} title="刷新">
            <RefreshCw size={14} className={loading ? 'vos-spin' : ''} />
          </button>
          <button
            type="button"
            className="vos-btn"
            onClick={handleImportConfig}
            disabled={importingConfig}
            title="从 ~/.ssh/config 导入"
          >
            {importingConfig ? <Loader2 size={14} className="vos-spin" /> : <Download size={14} />} 导入配置
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={14} /> 添加服务器
          </button>
        </div>
      </div>

      {servers.length === 0 && !loading && (
        <div className="ssh-empty">
          <Terminal size={32} className="opacity-30" />
          <p>还没有 SSH 服务器</p>
          <button type="button" className="vos-btn vos-btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={14} /> 添加第一台
          </button>
        </div>
      )}

      <div className="ssh-list">
        {servers.map(srv => (
          <div key={srv.id} className="ssh-card">
            <div className="ssh-card-header">
              <div className="ssh-card-icon">
                <Terminal size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="ssh-card-name">{srv.name}</div>
                <div className="ssh-card-host">
                  {srv.username}@{srv.host}:{srv.port}
                </div>
              </div>
              <StatusBadge status={srv.status} />
            </div>

            {testResult?.id === srv.id && (
              <div className={`ssh-test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                {testResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {testResult.msg}
              </div>
            )}

            <div className="ssh-card-actions">
              <button
                type="button"
                className="vos-btn vos-btn-sm"
                onClick={() => handleTest(srv.id)}
                disabled={testing === srv.id}
              >
                {testing === srv.id ? <Loader2 size={13} className="vos-spin" /> : <Activity size={13} />}
                测试
              </button>
              <button
                type="button"
                className={`vos-btn vos-btn-sm${monitorServerId === srv.id ? ' vos-btn-primary' : ''}`}
                onClick={() => onToggleMonitor(srv.id)}
                title="资源监控"
              >
                <Activity size={13} /> 监控
              </button>
              <button type="button" className="vos-btn vos-btn-sm vos-btn-primary" onClick={() => handleOpenShell(srv)}>
                <Terminal size={13} /> 打开 Shell
              </button>
              <DelBtn onConfirm={() => handleDelete(srv.id)} />
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <SshServerForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      {sshConfigHosts && (
        <ModalOverlay onClose={() => setSshConfigHosts(null)}>
          <motion.div
            className="vos-modal max-w-[480px]"
            initial={{ scale: 0.93, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="vos-modal-header">
              <span>~/.ssh/config Hosts ({sshConfigHosts.length})</span>
              <div className="ml-auto flex items-center gap-6px">
                <button
                  type="button"
                  className="vos-btn vos-btn-sm vos-btn-primary"
                  onClick={importAllConfigHosts}
                  disabled={importingConfig || sshConfigHosts.length === 0}
                >
                  {importingConfig ? <Loader2 size={12} className="vos-spin" /> : <Download size={12} />}
                  导入全部
                </button>
                <button type="button" className="vos-icon-btn" onClick={() => setSshConfigHosts(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="vos-modal-body max-h-[360px] overflow-auto">
              {sshConfigHosts.length === 0 && (
                <p className="vos-text-tertiary text-xs px-[8px] py-[4px]">未发现 SSH Host 配置</p>
              )}
              {sshConfigHosts.map(h => (
                <div key={h.alias} className="ssh-card px-[12px] py-[10px] mb-[6px]">
                  <div className="flex items-center justify-between mb-[4px]">
                    <span className="text-[13px] font-semibold">{h.alias}</span>
                    <button
                      type="button"
                      className="vos-btn vos-btn-sm vos-btn-primary"
                      onClick={() => importConfigHost(h)}
                    >
                      <Plus size={12} /> 导入
                    </button>
                  </div>
                  <div className="text-[11px] vos-text-secondary flex gap-[12px] flex-wrap">
                    {h.hostname && <span>Host: {h.hostname}</span>}
                    {h.user && <span>User: {h.user}</span>}
                    {h.port && <span>Port: {h.port}</span>}
                    {h.identity_file && <span>Key: {h.identity_file}</span>}
                    {!h.identity_file && h.auto_detected_key && (
                      <span style={{ color: 'var(--vos-accent-success)' }}>
                        Key (auto): {h.auto_detected_key.split('/').pop()}
                      </span>
                    )}
                    {!h.identity_file && !h.auto_detected_key && <span>Auth: SSH Agent / 系统默认</span>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </ModalOverlay>
      )}

      {passwordPrompt && (
        <ModalOverlay onClose={() => setPasswordPrompt(null)}>
          <motion.div
            className="vos-modal max-w-[380px]"
            initial={{ scale: 0.93, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="vos-modal-header">
              <Key size={14} />
              <span>输入连接密码</span>
              <button type="button" className="vos-icon-btn" onClick={() => setPasswordPrompt(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="vos-modal-body">
              <p className="text-[13px] vos-text-secondary mb-[12px]">
                服务器 <strong>{passwordPrompt.server.name}</strong> 尚未存储密码，请输入连接密码。
              </p>
              <div className="vos-form-row">
                <label>密码</label>
                <input
                  className="vos-input"
                  type="password"
                  autoFocus
                  placeholder="••••••••"
                  value={passwordPrompt.pw}
                  onChange={e => setPasswordPrompt(prev => (prev ? { ...prev, pw: e.target.value } : null))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSavePasswordAndOpen()
                  }}
                />
              </div>
            </div>
            <div className="vos-modal-footer">
              <button type="button" className="vos-btn" onClick={() => setPasswordPrompt(null)}>
                取消
              </button>
              <button
                type="button"
                className="vos-btn vos-btn-primary"
                onClick={handleSavePasswordAndOpen}
                disabled={savingPw || !passwordPrompt.pw}
              >
                {savingPw ? <Loader2 size={14} className="vos-spin" /> : <Terminal size={14} />}
                连接
              </button>
            </div>
          </motion.div>
        </ModalOverlay>
      )}
    </div>
  )
}

/* ─── SSH Server Add Form ──────────────────────────────────── */
function SshServerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CreateSshServerReq>({
    name: '',
    host: '',
    port: 22,
    username: '',
    auth_method: { type: 'password' },
    password: ''
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [keyFiles, setKeyFiles] = useState<SshKeyFile[] | null>(null)
  const [showKeyPicker, setShowKeyPicker] = useState(false)

  async function handleBrowseKeys() {
    try {
      const res = await api.getSshKeyFiles()
      setKeyFiles(res.data)
      setShowKeyPicker(true)
    } catch (e) {
      console.error(e)
    }
  }

  function selectKeyFile(path: string) {
    setForm(f => ({ ...f, auth_method: { type: 'private_key', key_path: path } }))
    setShowKeyPicker(false)
  }

  async function handleSave() {
    if (!form.name || !form.host || !form.username) {
      setErr('名称、主机、用户名为必填')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await api.createSshServer(form)
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        className="vos-modal"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="vos-modal-header">
          <span>添加 SSH 服务器</span>
          <button type="button" className="vos-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="vos-modal-body">
          <div className="vos-form-row">
            <label>名称</label>
            <input
              className="vos-input"
              placeholder="生产环境 Web01"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="vos-form-row grid grid-cols-[1fr_80px] gap-[8px]">
            <div>
              <label>主机</label>
              <input
                className="vos-input"
                placeholder="192.168.1.100 或 example.com"
                value={form.host}
                onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
              />
            </div>
            <div>
              <label>端口</label>
              <input
                className="vos-input"
                type="number"
                value={form.port}
                onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="vos-form-row">
            <label>用户名</label>
            <input
              className="vos-input"
              placeholder="root"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            />
          </div>
          <div className="vos-form-row">
            <label>认证方式</label>
            <div className="vos-segmented">
              {(['password', 'private_key'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`vos-segmented-item ${form.auth_method.type === t ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, auth_method: { type: t } }))}
                >
                  {t === 'password' ? '密码' : '私钥'}
                </button>
              ))}
            </div>
          </div>
          {form.auth_method.type === 'password' && (
            <div className="vos-form-row">
              <label>密码</label>
              <input
                className="vos-input"
                type="password"
                placeholder="••••••••"
                value={form.password ?? ''}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
          )}
          {form.auth_method.type === 'private_key' && (
            <div className="vos-form-row">
              <label>私钥路径</label>
              <div className="flex gap-[6px]">
                <input
                  className="vos-input flex-1"
                  placeholder="~/.ssh/id_rsa"
                  value={(form.auth_method as { type: 'private_key'; key_path?: string }).key_path ?? ''}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      auth_method: { type: 'private_key', key_path: e.target.value }
                    }))
                  }
                />
                <button type="button" className="vos-btn" onClick={handleBrowseKeys} title="从 ~/.ssh 选择">
                  <Key size={14} /> 浏览
                </button>
              </div>
            </div>
          )}
          {showKeyPicker && keyFiles && (
            <div className="vos-form-row">
              <label>~/.ssh/ 密钥文件</label>
              <div className="max-h-[160px] overflow-auto border border-solid border-[var(--vos-border)] rounded-[6px] p-[4px]">
                {keyFiles.filter(f => !f.is_public).length === 0 && (
                  <p className="vos-text-tertiary text-[11px] px-[8px] py-[4px]">未发现私钥文件</p>
                )}
                {keyFiles
                  .filter(f => !f.is_public)
                  .map(f => (
                    <button
                      key={f.path}
                      type="button"
                      className="flex items-center gap-[6px] w-full px-[8px] py-[5px] text-xs bg-transparent border-none text-[var(--vos-text-primary)] cursor-pointer rounded-[4px] text-left"
                      onMouseOver={e => {
                        ;(e.currentTarget as HTMLElement).style.background = 'var(--vos-bg-item-hover)'
                      }}
                      onMouseOut={e => {
                        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                      onClick={() => selectKeyFile(f.path)}
                    >
                      <Key size={12} className="opacity-60" />
                      <span className="flex-1">{f.name}</span>
                      <span className="text-[10px] opacity-50">{f.path}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
          {err && <p className="vos-form-error">{err}</p>}
        </div>
        <div className="vos-modal-footer">
          <button type="button" className="vos-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="vos-spin" /> : null} 保存
          </button>
        </div>
      </motion.div>
    </ModalOverlay>
  )
}

/* ─── Shell Modal ──────────────────────────────────────────── */
function ShellModal({ server, onClose }: { server: SshServer; onClose: () => void }) {
  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        className="vos-modal w-[800px] h-[500px]"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="vos-modal-header">
          <Terminal size={14} />
          <span>
            {server.name} — {server.host}
          </span>
          <button type="button" className="vos-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 bg-[#0d0d0d] overflow-hidden rounded-b-[10px]">
          <WebShellEmbed target={server.id} />
        </div>
      </motion.div>
    </ModalOverlay>
  )
}

/* ─── WebShell Embed ───────────────────────────────────────── */
function WebShellEmbed({ target }: { target: string }) {
  return <WebShell target={target} />
}

/* ═══════════════════════════════════════════════════════════
   Port Mappings Section
═══════════════════════════════════════════════════════════ */
function PortMappingsTab({ servers }: { servers: SshServer[] }) {
  const [mappings, setMappings] = useState<PortMapping[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getPortMappings()
      setMappings(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(m: PortMapping) {
    setActing(m.id)
    try {
      if (m.status === 'active') await api.stopPortMapping(m.id)
      else await api.startPortMapping(m.id)
      load()
    } finally {
      setActing(null)
    }
  }

  const serverName = (id: string) => servers.find(s => s.id === id)?.name ?? id

  return (
    <div className="ssh-section">
      <div className="ssh-toolbar">
        <span className="ssh-count">{mappings.length} 条映射</span>
        <div className="flex gap-[6px]">
          <button type="button" className="vos-icon-btn" onClick={load}>
            <RefreshCw size={14} className={loading ? 'vos-spin' : ''} />
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={14} /> 新建映射
          </button>
        </div>
      </div>

      {mappings.length === 0 && !loading && (
        <div className="ssh-empty">
          <Zap size={32} className="opacity-30" />
          <p>还没有端口映射</p>
        </div>
      )}

      <table className="ssh-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>服务器</th>
            <th>远端</th>
            <th>本地端口</th>
            <th>状态</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {mappings.map(m => (
            <tr key={m.id}>
              <td>
                <strong>{m.name}</strong>
              </td>
              <td>{serverName(m.ssh_server_id)}</td>
              <td className="font-mono text-[12px]">
                {m.remote_host}:{m.remote_port}
              </td>
              <td className="font-mono text-[12px]">:{m.local_port}</td>
              <td>
                <StatusBadge status={m.status} />
              </td>
              <td>
                <div className="flex gap-[6px] justify-end">
                  <button
                    type="button"
                    className="vos-icon-btn"
                    onClick={() => toggle(m)}
                    disabled={acting === m.id}
                    title={m.status === 'active' ? '停止' : '启动'}
                  >
                    {acting === m.id ? (
                      <Loader2 size={14} className="vos-spin" />
                    ) : m.status === 'active' ? (
                      <Square size={14} />
                    ) : (
                      <Activity size={14} />
                    )}
                  </button>
                  <DelBtn
                    onConfirm={async () => {
                      await api.deletePortMapping(m.id)
                      load()
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <PortMappingForm
          servers={servers}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function PortMappingForm({
  servers,
  onClose,
  onSaved
}: {
  servers: SshServer[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<CreatePortMappingReq>({
    name: '',
    ssh_server_id: servers[0]?.id ?? '',
    remote_host: 'localhost',
    remote_port: 3306,
    local_port: 13306
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!form.name || !form.ssh_server_id) {
      setErr('名称和服务器为必填')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await api.createPortMapping(form)
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        className="vos-modal"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="vos-modal-header">
          <span>新建端口映射</span>
          <button type="button" className="vos-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="vos-modal-body">
          <div className="vos-form-row">
            <label>名称</label>
            <input
              className="vos-input"
              placeholder="MySQL 生产"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="vos-form-row">
            <label>SSH 服务器</label>
            <FormSelect
              value={form.ssh_server_id}
              onChange={e => setForm(f => ({ ...f, ssh_server_id: e.target.value }))}
              wrapperClassName="w-full"
            >
              {servers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </FormSelect>
          </div>
          <div className="vos-form-row grid grid-cols-[1fr_90px] gap-2">
            <div>
              <label>远端主机</label>
              <input
                className="vos-input"
                value={form.remote_host}
                onChange={e => setForm(f => ({ ...f, remote_host: e.target.value }))}
              />
            </div>
            <div>
              <label>远端端口</label>
              <input
                className="vos-input"
                type="number"
                value={form.remote_port}
                onChange={e => setForm(f => ({ ...f, remote_port: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="vos-form-row">
            <label>本地端口</label>
            <input
              className="vos-input"
              type="number"
              value={form.local_port}
              onChange={e => setForm(f => ({ ...f, local_port: Number(e.target.value) }))}
            />
          </div>
          {err && <p className="vos-form-error">{err}</p>}
        </div>
        <div className="vos-modal-footer">
          <button type="button" className="vos-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="vos-spin" /> : null} 保存
          </button>
        </div>
      </motion.div>
    </ModalOverlay>
  )
}

/* ═══════════════════════════════════════════════════════════
   Service Exposures Section
═══════════════════════════════════════════════════════════ */
function ExposuresTab({ servers }: { servers: SshServer[] }) {
  const [exposures, setExposures] = useState<ServiceExposure[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getServiceExposures()
      setExposures(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(e: ServiceExposure) {
    setActing(e.id)
    try {
      if (e.status === 'active') await api.stopServiceExposure(e.id)
      else await api.startServiceExposure(e.id)
      load()
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="ssh-section">
      <div className="ssh-toolbar">
        <span className="ssh-count">{exposures.length} 条暴露</span>
        <div className="flex gap-[6px]">
          <button type="button" className="vos-icon-btn" onClick={load}>
            <RefreshCw size={14} className={loading ? 'vos-spin' : ''} />
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={14} /> 新建暴露
          </button>
        </div>
      </div>

      {exposures.length === 0 && !loading && (
        <div className="ssh-empty">
          <Globe size={32} className="opacity-30" />
          <p>还没有服务暴露</p>
        </div>
      )}

      <table className="ssh-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>来源</th>
            <th>公开端口</th>
            <th>鉴权</th>
            <th>状态</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {exposures.map(e => (
            <tr key={e.id}>
              <td>
                <strong>{e.name}</strong>
              </td>
              <td className="text-[12px]">
                {e.source_type === 'local'
                  ? '本地'
                  : `SSH: ${servers.find(s => s.id === e.ssh_server_id)?.name ?? e.ssh_server_id}`}{' '}
                {e.source_host}:{e.source_port}
              </td>
              <td>
                <a
                  href={`http://localhost:${e.public_port}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-[3px] text-[var(--vos-accent-primary)] text-[12px]"
                >
                  :{e.public_port} <ExternalLink size={10} />
                </a>
              </td>
              <td>
                {e.basic_auth_enabled ? (
                  <span className="inline-flex items-center gap-[3px] text-[var(--vos-accent-warning)] text-[11px]">
                    <Shield size={11} /> 已启用
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--vos-text-tertiary)]">无</span>
                )}
              </td>
              <td>
                <StatusBadge status={e.status} />
              </td>
              <td>
                <div className="flex gap-[6px] justify-end">
                  <button
                    type="button"
                    className="vos-icon-btn"
                    onClick={() => toggle(e)}
                    disabled={acting === e.id}
                    title={e.status === 'active' ? '停止' : '启动'}
                  >
                    {acting === e.id ? (
                      <Loader2 size={14} className="vos-spin" />
                    ) : e.status === 'active' ? (
                      <Square size={14} />
                    ) : (
                      <Activity size={14} />
                    )}
                  </button>
                  <DelBtn
                    onConfirm={async () => {
                      await api.deleteServiceExposure(e.id)
                      load()
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <ExposureForm
          servers={servers}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function ExposureForm({
  servers,
  onClose,
  onSaved
}: {
  servers: SshServer[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<CreateServiceExposureReq>({
    name: '',
    source_type: 'local',
    source_host: 'localhost',
    source_port: 5454,
    public_port: 5454,
    basic_auth_enabled: false
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!form.name) {
      setErr('名称为必填')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await api.createServiceExposure(form)
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        className="vos-modal"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="vos-modal-header">
          <span>新建服务暴露</span>
          <button type="button" className="vos-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="vos-modal-body">
          <div className="vos-form-row">
            <label>名称</label>
            <input
              className="vos-input"
              placeholder="我的服务"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="vos-form-row">
            <label>来源类型</label>
            <div className="vos-segmented">
              {(['local', 'ssh'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`vos-segmented-item ${form.source_type === t ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, source_type: t }))}
                >
                  {t === 'local' ? '本地' : 'SSH 跳板'}
                </button>
              ))}
            </div>
          </div>
          {form.source_type === 'ssh' && (
            <div className="vos-form-row">
              <label>SSH 服务器</label>
              <FormSelect
                value={form.ssh_server_id ?? ''}
                onChange={e => setForm(f => ({ ...f, ssh_server_id: e.target.value }))}
                wrapperClassName="w-full"
              >
                <option value="">选择服务器…</option>
                {servers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </FormSelect>
            </div>
          )}
          <div className="vos-form-row grid grid-cols-[1fr_90px] gap-2">
            <div>
              <label>来源主机</label>
              <input
                className="vos-input"
                value={form.source_host}
                onChange={e => setForm(f => ({ ...f, source_host: e.target.value }))}
              />
            </div>
            <div>
              <label>来源端口</label>
              <input
                className="vos-input"
                type="number"
                value={form.source_port}
                onChange={e => setForm(f => ({ ...f, source_port: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="vos-form-row">
            <label>公开端口</label>
            <input
              className="vos-input"
              type="number"
              value={form.public_port}
              onChange={e => setForm(f => ({ ...f, public_port: Number(e.target.value) }))}
            />
          </div>
          <div className="vos-form-row flex-row items-center gap-[10px]">
            <button
              type="button"
              className={`vos-toggle ${form.basic_auth_enabled ? 'on' : ''}`}
              onClick={() => setForm(f => ({ ...f, basic_auth_enabled: !f.basic_auth_enabled }))}
            >
              <span className="vos-toggle-thumb" />
            </button>
            <label className="mb-0">启用 Basic Auth</label>
          </div>
          {form.basic_auth_enabled && (
            <>
              <div className="vos-form-row">
                <label>用户名</label>
                <input
                  className="vos-input"
                  value={form.basic_auth_username ?? ''}
                  onChange={e => setForm(f => ({ ...f, basic_auth_username: e.target.value }))}
                />
              </div>
              <div className="vos-form-row">
                <label>密码</label>
                <input
                  className="vos-input"
                  type="password"
                  onChange={e => setForm(f => ({ ...f, basic_auth_password: e.target.value }))}
                />
              </div>
            </>
          )}
          {err && <p className="vos-form-error">{err}</p>}
        </div>
        <div className="vos-modal-footer">
          <button type="button" className="vos-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="vos-spin" /> : null} 保存
          </button>
        </div>
      </motion.div>
    </ModalOverlay>
  )
}

/* ═══════════════════════════════════════════════════════════
   SSH App Root
═══════════════════════════════════════════════════════════ */
export default function SshApp(_props: AppComponentProps) {
  const [tab, setTab] = useState<TabId>('servers')
  const [servers, setServers] = useState<SshServer[]>([])
  const [monitorPanelServerId, setMonitorPanelServerId] = useState<string | null>(null)
  const [showPreferences, setShowPreferences] = useState(false)
  const [autoOpenMonitor, setAutoOpenMonitor] = useState(true)
  const storage = useAppStorage('ssh')

  // Load preferences
  useEffect(() => {
    storage.getJSON<boolean>('autoOpenMonitor').then(v => {
      if (v !== null && v !== undefined) setAutoOpenMonitor(v)
    })
  }, [storage])

  // Register menus
  useEffect(() => {
    registerAppMenus('ssh', [
      {
        id: 'ssh',
        label: 'SSH 管理',
        items: [
          {
            id: 'preferences',
            label: '偏好设置',
            shortcut: '⌘,',
            action: () => setShowPreferences(true)
          }
        ]
      }
    ])
    return () => unregisterAppMenus('ssh')
  }, [])

  useEffect(() => {
    api
      .getSshServers()
      .then(r => {
        setServers(r.data)
        // Auto-open monitor for first connected server
        if (autoOpenMonitor) {
          const connected = r.data.find(s => s.status === 'connected')
          if (connected) setMonitorPanelServerId(connected.id)
        }
      })
      .catch(() => {})
  }, [autoOpenMonitor])

  const TABS = [
    { id: 'servers' as TabId, label: 'SSH 服务器', icon: <Terminal size={14} /> },
    { id: 'port-mappings' as TabId, label: '端口映射', icon: <Zap size={14} /> },
    { id: 'exposures' as TabId, label: '服务暴露', icon: <Globe size={14} /> }
  ]

  return (
    <div className="ssh-app relative">
      {/* Sidebar */}
      <div className="ssh-sidebar">
        <div className="ssh-sidebar-header">
          <Key size={16} />
          <span>SSH 管理</span>
        </div>
        <nav className="ssh-nav">
          <Tabs
            tabs={TABS}
            activeTabId={tab}
            onActivate={id => setTab(id as TabId)}
            orientation="vertical"
            renderPrefix={t => t.icon}
          />
        </nav>
      </div>

      {/* Content */}
      <div className="ssh-content flex flex-1 min-w-0">
        <div className="flex-1 min-w-0 h-full overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {tab === 'servers' && (
                <ServersTab
                  onToggleMonitor={id => setMonitorPanelServerId(prev => (prev === id ? null : id))}
                  monitorServerId={monitorPanelServerId}
                />
              )}
              {tab === 'port-mappings' && <PortMappingsTab servers={servers} />}
              {tab === 'exposures' && <ExposuresTab servers={servers} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {monitorPanelServerId && (
            <ResourceMonitorPanel
              key={monitorPanelServerId}
              serverId={monitorPanelServerId}
              onClose={() => setMonitorPanelServerId(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {showPreferences && (
        <PreferencesPanel
          title="SSH 偏好设置"
          onClose={() => setShowPreferences(false)}
          groups={
            [
              {
                id: 'general',
                title: '通用',
                items: [
                  {
                    id: 'autoOpenMonitor',
                    label: '连接后自动打开资源监控',
                    type: 'switch',
                    value: autoOpenMonitor,
                    onChange: v => {
                      const val = v as boolean
                      setAutoOpenMonitor(val)
                      storage.setJSON('autoOpenMonitor', val)
                    }
                  }
                ]
              }
            ] satisfies PreferenceGroup[]
          }
        />
      )}
    </div>
  )
}
