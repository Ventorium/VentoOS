import { Check, Database, Monitor, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { FormInput, FormSelect, FormTextarea, Modal, Spinner, Tabs } from '@/components/ui'
import { PathPickerInput } from '@/shell/FilePicker'
import { dbApi } from '../api'
import { useDatabaseStore } from '../stores'
import type { CreateDbConnectionReq, DbEngine, SshTunnelConfig, SslConfig } from '../types'

type TabKey = 'general' | 'advanced' | 'ssl' | 'ssh' | 'notes'

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'general', label: '常规' },
  { key: 'advanced', label: '高级' },
  { key: 'ssl', label: 'SSL' },
  { key: 'ssh', label: 'SSH' },
  { key: 'notes', label: '备注' }
]

const ENGINE_LABELS: Record<DbEngine, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite'
}

const DEFAULT_PORTS: Record<DbEngine, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlite: 0
}

interface TestStatus {
  testing: boolean
  result: 'success' | 'fail' | null
  message: string
}

function buildInitialForm(engine: DbEngine): CreateDbConnectionReq {
  return {
    name: '',
    engine,
    host: engine === 'sqlite' ? undefined : 'localhost',
    port: engine === 'sqlite' ? undefined : DEFAULT_PORTS[engine],
    username: engine === 'postgresql' ? 'postgres' : engine === 'mysql' ? 'root' : undefined,
    password: '',
    database: engine === 'postgresql' ? 'postgres' : '',
    ssl_enabled: false,
    sqlite_path: engine === 'sqlite' ? '' : undefined,
    notes: '',
    connectTimeout: 30,
    readTimeout: 60,
    encoding: 'utf8',
    keepAliveInterval: 0
  }
}

function buildInitialSsl(): SslConfig {
  return {
    enabled: false,
    mode: 'require',
    useVerify: false,
    clientKeyPath: '',
    clientCertPath: '',
    rootCertPath: '',
    crlPath: ''
  }
}

function buildInitialSsh(): SshTunnelConfig {
  return {
    enabled: false,
    host: '',
    port: 22,
    username: '',
    authMethod: 'password',
    password: '',
    identityFilePath: '',
    passphrase: '',
    savePassword: false
  }
}

export function ConnectionConfigDialog() {
  const {
    showConnectionConfigDialog,
    editingConnectionEngine,
    editingConnectionId,
    closeConnectionConfig,
    addConnection
  } = useDatabaseStore()

  const engine = editingConnectionEngine ?? 'postgresql'
  const isEdit = !!editingConnectionId

  const [activeTab, setActiveTab] = useState<TabKey>('general')
  const [form, setForm] = useState<CreateDbConnectionReq>(() => buildInitialForm(engine))
  const [ssl, setSsl] = useState<SslConfig>(() => buildInitialSsl())
  const [ssh, setSsh] = useState<SshTunnelConfig>(() => buildInitialSsh())
  const [savePassword, setSavePassword] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>({ testing: false, result: null, message: '' })
  const [saving, setSaving] = useState(false)

  const isSqlite = engine === 'sqlite'

  // Reset form when engine changes
  useMemo(() => {
    setForm(buildInitialForm(engine))
    setSsl(buildInitialSsl())
    setSsh(buildInitialSsh())
    setActiveTab('general')
    setTestStatus({ testing: false, result: null, message: '' })
  }, [engine])

  const updateForm = useCallback(<K extends keyof CreateDbConnectionReq>(key: K, value: CreateDbConnectionReq[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const updateSsl = useCallback(<K extends keyof SslConfig>(key: K, value: SslConfig[K]) => {
    setSsl(prev => ({ ...prev, [key]: value }))
  }, [])

  const updateSsh = useCallback(<K extends keyof SshTunnelConfig>(key: K, value: SshTunnelConfig[K]) => {
    setSsh(prev => ({ ...prev, [key]: value }))
  }, [])

  const buildReq = useCallback((): CreateDbConnectionReq => {
    return {
      ...form,
      ssl_enabled: ssl.enabled,
      ssl: ssl.enabled ? ssl : undefined,
      ssh: ssh.enabled ? ssh : undefined
    }
  }, [form, ssl, ssh])

  const handleTest = useCallback(async () => {
    setTestStatus({ testing: true, result: null, message: '' })
    try {
      const res = await dbApi.testDbConnectionInline(buildReq())
      if (res.data?.success) {
        setTestStatus({ testing: false, result: 'success', message: res.data.message || '连接成功' })
      } else {
        setTestStatus({ testing: false, result: 'fail', message: res.data?.message || '连接失败' })
      }
    } catch (err) {
      setTestStatus({ testing: false, result: 'fail', message: err instanceof Error ? err.message : '测试失败' })
    }
  }, [buildReq])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await dbApi.createDbConnection(buildReq())
      if (res.data) {
        addConnection(res.data)
        closeConnectionConfig()
      }
    } catch {
      // error handled by api layer
    } finally {
      setSaving(false)
    }
  }, [form.name, buildReq, addConnection, closeConnectionConfig])

  const title = isEdit ? form.name || '编辑连接' : `新建连接 (${ENGINE_LABELS[engine]})`

  return (
    <Modal
      open={showConnectionConfigDialog}
      onClose={closeConnectionConfig}
      title={title}
      icon={<Database size={16} style={{ color: 'var(--vos-accent-primary)' }} />}
      width={560}
      footer={
        <div className="flex items-center justify-between w-full px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="vos-btn vos-btn-default"
              onClick={handleTest}
              disabled={testStatus.testing}
            >
              {testStatus.testing ? <Spinner size={14} /> : '测试连接'}
            </button>
            {testStatus.result === 'success' && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--vos-success)' }}>
                <Check size={14} /> {testStatus.message}
              </span>
            )}
            {testStatus.result === 'fail' && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--vos-error)' }}>
                <X size={14} /> {testStatus.message}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="vos-btn vos-btn-default" onClick={closeConnectionConfig}>
              取消
            </button>
            <button
              type="button"
              className="vos-btn vos-btn-primary"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
            >
              {saving ? <Spinner size={14} /> : '保存'}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Connection diagram */}
        <div className="flex items-center justify-center gap-4 py-3" style={{ color: 'var(--vos-text-secondary)' }}>
          <div className="flex flex-col items-center gap-1">
            <Monitor size={28} style={{ color: 'var(--vos-accent-primary)' }} />
            <span className="text-xs">VentoOS</span>
          </div>
          <div className="flex-1 max-w-24 border-t border-dashed" style={{ borderColor: 'var(--vos-border-subtle)' }} />
          <div className="flex flex-col items-center gap-1">
            <Database size={28} style={{ color: 'var(--vos-accent-primary)' }} />
            <span className="text-xs">{ENGINE_LABELS[engine]}</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          tabs={TAB_ITEMS.map(t => ({ id: t.key, label: t.label }))}
          activeTabId={activeTab}
          onActivate={id => setActiveTab(id as TabKey)}
          variant="underline"
          block
          renderContent={(tab, isActive) => (
            <span style={{ color: isActive ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)' }}>{tab.label}</span>
          )}
        />

        {/* Tab content */}
        <div className="min-h-48 px-1">
          {activeTab === 'general' && (
            <GeneralTab
              form={form}
              updateForm={updateForm}
              isSqlite={isSqlite}
              savePassword={savePassword}
              onSavePasswordChange={setSavePassword}
            />
          )}
          {activeTab === 'advanced' && <AdvancedTab form={form} updateForm={updateForm} />}
          {activeTab === 'ssl' && <SslTab ssl={ssl} updateSsl={updateSsl} />}
          {activeTab === 'ssh' && <SshTab ssh={ssh} updateSsh={updateSsh} />}
          {activeTab === 'notes' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
                备注
              </label>
              <FormTextarea
                rows={6}
                value={form.notes ?? ''}
                onChange={e => updateForm('notes', e.target.value)}
                placeholder="输入连接备注..."
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── General Tab ────────────────────────────────────────────────────────────

function GeneralTab({
  form,
  updateForm,
  isSqlite,
  savePassword,
  onSavePasswordChange
}: {
  form: CreateDbConnectionReq
  updateForm: <K extends keyof CreateDbConnectionReq>(key: K, value: CreateDbConnectionReq[K]) => void
  isSqlite: boolean
  savePassword: boolean
  onSavePasswordChange: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <FormField label="连接名称" required>
        <FormInput value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="输入连接名称" />
      </FormField>

      {isSqlite ? (
        <FormField label="数据库文件">
          <PathPickerInput
            value={form.sqlite_path ?? ''}
            onChange={path => updateForm('sqlite_path', path)}
            placeholder="选择 SQLite 文件路径"
          />
        </FormField>
      ) : (
        <>
          <div className="flex gap-3">
            <div className="flex-1">
              <FormField label="主机">
                <FormInput
                  value={form.host ?? ''}
                  onChange={e => updateForm('host', e.target.value)}
                  placeholder="localhost"
                />
              </FormField>
            </div>
            <div className="w-24">
              <FormField label="端口">
                <FormInput
                  type="number"
                  value={form.port ?? ''}
                  onChange={e => updateForm('port', e.target.value ? Number(e.target.value) : undefined)}
                />
              </FormField>
            </div>
          </div>

          <FormField label="初始数据库">
            <FormInput
              value={form.database ?? ''}
              onChange={e => updateForm('database', e.target.value)}
              placeholder={form.engine === 'postgresql' ? 'postgres' : ''}
            />
          </FormField>

          <FormField label="用户名">
            <FormInput
              value={form.username ?? ''}
              onChange={e => updateForm('username', e.target.value)}
              placeholder={form.engine === 'postgresql' ? 'postgres' : 'root'}
            />
          </FormField>

          <div className="flex flex-col gap-1">
            <FormField label="密码">
              <FormInput
                type="password"
                value={form.password ?? ''}
                onChange={e => updateForm('password', e.target.value)}
                placeholder="输入密码"
              />
            </FormField>
            <label
              className="flex items-center gap-1.5 text-xs cursor-pointer"
              style={{ color: 'var(--vos-text-secondary)' }}
            >
              <input type="checkbox" checked={savePassword} onChange={e => onSavePasswordChange(e.target.checked)} />
              保存密码
            </label>
          </div>
        </>
      )}
    </div>
  )
}

// ── Advanced Tab ───────────────────────────────────────────────────────────

function AdvancedTab({
  form,
  updateForm
}: {
  form: CreateDbConnectionReq
  updateForm: <K extends keyof CreateDbConnectionReq>(key: K, value: CreateDbConnectionReq[K]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <FormField label="连接超时（秒）">
        <FormInput
          type="number"
          value={form.connectTimeout ?? 30}
          onChange={e => updateForm('connectTimeout', Number(e.target.value))}
        />
      </FormField>
      <FormField label="读取超时（秒）">
        <FormInput
          type="number"
          value={form.readTimeout ?? 60}
          onChange={e => updateForm('readTimeout', Number(e.target.value))}
        />
      </FormField>
      <FormField label="编码">
        <FormSelect value={form.encoding ?? 'utf8'} onChange={e => updateForm('encoding', e.target.value)}>
          <option value="utf8">UTF-8</option>
          <option value="latin1">Latin1</option>
          <option value="gbk">GBK</option>
          <option value="ascii">ASCII</option>
        </FormSelect>
      </FormField>
      <FormField label="保持连接间隔（秒）">
        <FormInput
          type="number"
          value={form.keepAliveInterval ?? 0}
          onChange={e => updateForm('keepAliveInterval', Number(e.target.value))}
        />
      </FormField>
    </div>
  )
}

// ── SSL Tab ────────────────────────────────────────────────────────────────

function SslTab({
  ssl,
  updateSsl
}: {
  ssl: SslConfig
  updateSsl: <K extends keyof SslConfig>(key: K, value: SslConfig[K]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--vos-text-primary)' }}>
        <input type="checkbox" checked={ssl.enabled} onChange={e => updateSsl('enabled', e.target.checked)} />
        使用 SSL
      </label>

      <div style={{ opacity: ssl.enabled ? 1 : 0.4, pointerEvents: ssl.enabled ? 'auto' : 'none' }}>
        <div className="flex flex-col gap-3">
          <FormField label="SSL 模式">
            <FormSelect value={ssl.mode} onChange={e => updateSsl('mode', e.target.value as SslConfig['mode'])}>
              <option value="require">Require</option>
              <option value="verify-ca">Verify CA</option>
              <option value="verify-full">Verify Full</option>
              <option value="disable">Disable</option>
            </FormSelect>
          </FormField>

          <label
            className="flex items-center gap-1.5 text-xs cursor-pointer"
            style={{ color: 'var(--vos-text-primary)' }}
          >
            <input type="checkbox" checked={ssl.useVerify} onChange={e => updateSsl('useVerify', e.target.checked)} />
            使用验证
          </label>

          <FormField label="客户端密钥">
            <FormInput
              value={ssl.clientKeyPath ?? ''}
              onChange={e => updateSsl('clientKeyPath', e.target.value)}
              placeholder="客户端密钥文件路径"
            />
          </FormField>

          <FormField label="客户端证书">
            <FormInput
              value={ssl.clientCertPath ?? ''}
              onChange={e => updateSsl('clientCertPath', e.target.value)}
              placeholder="客户端证书文件路径"
            />
          </FormField>

          <FormField label="根证书">
            <FormInput
              value={ssl.rootCertPath ?? ''}
              onChange={e => updateSsl('rootCertPath', e.target.value)}
              placeholder="根证书文件路径"
            />
          </FormField>

          <FormField label="撤销列表">
            <FormInput
              value={ssl.crlPath ?? ''}
              onChange={e => updateSsl('crlPath', e.target.value)}
              placeholder="CRL 文件路径"
            />
          </FormField>
        </div>
      </div>
    </div>
  )
}

// ── SSH Tab ────────────────────────────────────────────────────────────────

function SshTab({
  ssh,
  updateSsh
}: {
  ssh: SshTunnelConfig
  updateSsh: <K extends keyof SshTunnelConfig>(key: K, value: SshTunnelConfig[K]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--vos-text-primary)' }}>
        <input type="checkbox" checked={ssh.enabled} onChange={e => updateSsh('enabled', e.target.checked)} />
        使用 SSH 隧道
      </label>

      <div style={{ opacity: ssh.enabled ? 1 : 0.4, pointerEvents: ssh.enabled ? 'auto' : 'none' }}>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <FormField label="主机">
                <FormInput
                  value={ssh.host}
                  onChange={e => updateSsh('host', e.target.value)}
                  placeholder="SSH 主机地址"
                />
              </FormField>
            </div>
            <div className="w-24">
              <FormField label="端口">
                <FormInput type="number" value={ssh.port} onChange={e => updateSsh('port', Number(e.target.value))} />
              </FormField>
            </div>
          </div>

          <FormField label="用户名">
            <FormInput
              value={ssh.username}
              onChange={e => updateSsh('username', e.target.value)}
              placeholder="SSH 用户名"
            />
          </FormField>

          <FormField label="验证方法">
            <FormSelect
              value={ssh.authMethod}
              onChange={e => updateSsh('authMethod', e.target.value as SshTunnelConfig['authMethod'])}
            >
              <option value="password">密码</option>
              <option value="publickey">公钥</option>
            </FormSelect>
          </FormField>

          {ssh.authMethod === 'password' ? (
            <FormField label="密码">
              <FormInput
                type="password"
                value={ssh.password ?? ''}
                onChange={e => updateSsh('password', e.target.value)}
                placeholder="SSH 密码"
              />
            </FormField>
          ) : (
            <>
              <FormField label="私钥文件">
                <FormInput
                  value={ssh.identityFilePath ?? ''}
                  onChange={e => updateSsh('identityFilePath', e.target.value)}
                  placeholder="私钥文件路径"
                />
              </FormField>
              <FormField label="口令">
                <FormInput
                  type="password"
                  value={ssh.passphrase ?? ''}
                  onChange={e => updateSsh('passphrase', e.target.value)}
                  placeholder="私钥口令（如有）"
                />
              </FormField>
            </>
          )}

          <label
            className="flex items-center gap-1.5 text-xs cursor-pointer"
            style={{ color: 'var(--vos-text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={ssh.savePassword}
              onChange={e => updateSsh('savePassword', e.target.checked)}
            />
            保存密码
          </label>
        </div>
      </div>
    </div>
  )
}

// ── Shared form field layout ───────────────────────────────────────────────

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
        {label}
        {required && <span style={{ color: 'var(--vos-error)' }}> *</span>}
      </label>
      {children}
    </div>
  )
}
