import { AlertCircle, Box, CheckCircle2, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, FormInput, FormSelect, Modal } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useAppStateSync } from '@/kernel'
import type { VfsPickerResult } from '@/shell/FilePicker'
import { VfsPathPickerInput } from '@/shell/FilePicker'
import type { CreateK8sClusterReq, K8sCluster, TeleportKubeCluster, UpdateK8sClusterReq } from './api'
import { k8sApi } from './api'
import { K8sLayout } from './components/layout/K8sLayout'
import { ClusterOverview } from './components/overview/ClusterOverview'
import { ResourceList } from './components/resource-list/ResourceList'
import { useClusterStore } from './stores/cluster-store'
import { useKubernetesStore } from './stores/kubernetes-store'

function KubernetesWorkspaceStateSync({
  windowId,
  state
}: {
  windowId: string
  state: { tabs: ReturnType<typeof useKubernetesStore.getState>['tabs']; activeTabId: string | null }
}) {
  useAppStateSync(windowId, state, [state])
  return null
}

// ─── Add cluster form ──────────────────────────────────────────────────────

type ClusterMode = 'kubeconfig' | 'teleport'
type TeleportStep = 'credentials' | 'otp' | 'clusters' | 'done'

function ClusterForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: K8sCluster) => void }) {
  const [mode, setMode] = useState<ClusterMode>('kubeconfig')

  // ── Kubeconfig mode state ──
  const [name, setName] = useState('')
  const [kubeconfigPath, setKubeconfigPath] = useState('')
  const [kubeconfigInline, setKubeconfigInline] = useState<string | undefined>(undefined)
  const [context, setContext] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Teleport mode state ──
  const [tpProxy, setTpProxy] = useState('')
  const [tpUser, setTpUser] = useState('')
  const [tpPassword, setTpPassword] = useState('')
  const [tpOtp, setTpOtp] = useState('')
  const [tpStep, setTpStep] = useState<TeleportStep>('credentials')
  const [tpLoading, setTpLoading] = useState(false)
  const [tpError, setTpError] = useState('')
  const [tpClusters, setTpClusters] = useState<TeleportKubeCluster[]>([])
  const [tpSelectedCluster, setTpSelectedCluster] = useState('')
  const [tpClusterName, setTpClusterName] = useState('')
  const [tpNeedsOtp, setTpNeedsOtp] = useState<boolean | null>(null) // null = unknown
  const [tshAvailable, setTshAvailable] = useState<boolean | null>(null) // null = checking
  const [tshInstalling, setTshInstalling] = useState(false)
  const [tshInstallLog, setTshInstallLog] = useState('')

  // Check tsh when switching to teleport mode
  const checkTsh = async () => {
    setTshAvailable(null)
    try {
      const res = await k8sApi.teleportCheck()
      setTshAvailable(res.data?.available ?? false)
    } catch {
      setTshAvailable(false)
    }
  }

  const installTsh = async () => {
    setTshInstalling(true)
    setTshInstallLog('')
    try {
      const res = await import('@/apps/dependency-manager/api').then(m => m.depsApi.install('tsh'))
      const result = res.data
      setTshInstallLog(result.output || '')
      setTshAvailable(result.dependency.installed)
    } catch (e: any) {
      setTshInstallLog(e?.message || '安装失败')
    } finally {
      setTshInstalling(false)
    }
  }

  const handleTpProxyBlur = async () => {
    const proxy = tpProxy.trim()
    if (!proxy) {
      setTpNeedsOtp(null)
      return
    }
    try {
      const res = await k8sApi.teleportProbe(proxy)
      if (res.data?.reachable !== undefined) {
        setTpNeedsOtp(res.data.needs_otp)
      }
    } catch {
      setTpNeedsOtp(null)
    }
  }

  const handleKubeconfigChange = async (path: string, result?: VfsPickerResult) => {
    setKubeconfigPath(path)
    if (result?.isRemote && result.content) {
      const text = await result.content.text()
      setKubeconfigInline(text)
    } else {
      setKubeconfigInline(undefined)
    }
  }

  const submitKubeconfig = async () => {
    if (!name) return
    setSaving(true)
    try {
      const body: CreateK8sClusterReq = {
        name,
        kubeconfig_path: kubeconfigInline ? undefined : kubeconfigPath || undefined,
        kubeconfig_inline: kubeconfigInline || undefined,
        context_name: context || undefined
      }
      const res = await k8sApi.createK8sCluster(body)
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const teleportLogin = async () => {
    if (!tpProxy || !tpUser || !tpPassword) return
    setTpLoading(true)
    setTpError('')
    try {
      // If OTP is known to be required and we're on credentials step, include it directly
      const includeOtp = tpStep === 'otp' ? tpOtp || undefined : tpNeedsOtp === true && tpOtp ? tpOtp : undefined
      const res = await k8sApi.teleportLogin({
        proxy: tpProxy,
        user: tpUser,
        password: tpPassword,
        otp: includeOtp
      })
      const result = res.data
      if (result.success) {
        // Login succeeded, fetch available clusters
        setTpStep('clusters')
        const clustersRes = await k8sApi.teleportListClusters(tpProxy)
        setTpClusters(clustersRes.data)
        if (clustersRes.data.length > 0) {
          setTpSelectedCluster(clustersRes.data[0].name)
          setTpClusterName(clustersRes.data[0].name)
        }
      } else if (result.needs_otp) {
        setTpStep('otp')
      } else {
        setTpError(result.message)
      }
    } catch (e: any) {
      setTpError(e?.message || '登录失败')
    } finally {
      setTpLoading(false)
    }
  }

  const teleportAddCluster = async () => {
    if (!tpSelectedCluster) return
    setTpLoading(true)
    setTpError('')
    try {
      const kcRes = await k8sApi.teleportGetKubeconfig(tpProxy, tpSelectedCluster)
      const result = kcRes.data
      if (!result.success || (!result.kubeconfig && !result.kubeconfig_path)) {
        setTpError(result.message)
        return
      }
      const clusterRes = await k8sApi.createK8sCluster({
        name: tpClusterName || tpSelectedCluster,
        // Prefer kubeconfig_path (points to live ~/.kube/config) so tsh credential
        // refreshes are picked up automatically.  Fall back to inline if unavailable.
        kubeconfig_path: result.kubeconfig_path,
        kubeconfig_inline: result.kubeconfig_path ? undefined : result.kubeconfig,
        // Use the actual context name extracted from current-context in kubeconfig,
        // NOT the bare cluster name – tsh may generate e.g. "proxy.corp.com-k8s-aliyun".
        context_name: result.context_name || tpSelectedCluster,
        group: 'teleport'
      })
      onCreated(clusterRes.data)
    } catch (e: any) {
      setTpError(e?.message || '添加集群失败')
    } finally {
      setTpLoading(false)
    }
  }

  const kubeconfigFooter = (
    <>
      <button type="button" className="vos-btn" onClick={onClose}>
        取消
      </button>
      <button type="button" className="vos-btn vos-btn-primary" onClick={submitKubeconfig} disabled={saving}>
        {saving ? '添加中…' : '添加'}
      </button>
    </>
  )

  const teleportFooter = (
    <>
      <button type="button" className="vos-btn" onClick={onClose}>
        取消
      </button>
      {tpStep === 'credentials' && (
        <button
          type="button"
          className="vos-btn vos-btn-primary"
          onClick={teleportLogin}
          disabled={tpLoading || !tpProxy || !tpUser || !tpPassword || (tpNeedsOtp === true && !tpOtp)}
        >
          {tpLoading ? <Loader2 size={12} className="animate-spin" /> : '登录'}
        </button>
      )}
      {tpStep === 'otp' && (
        <button
          type="button"
          className="vos-btn vos-btn-primary"
          onClick={teleportLogin}
          disabled={tpLoading || !tpOtp}
        >
          {tpLoading ? <Loader2 size={12} className="animate-spin" /> : '验证'}
        </button>
      )}
      {tpStep === 'clusters' && (
        <button
          type="button"
          className="vos-btn vos-btn-primary"
          onClick={teleportAddCluster}
          disabled={tpLoading || !tpSelectedCluster}
        >
          {tpLoading ? <Loader2 size={12} className="animate-spin" /> : '添加集群'}
        </button>
      )}
    </>
  )

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="添加 Kubernetes 集群"
      width={420}
      footer={mode === 'kubeconfig' ? kubeconfigFooter : teleportFooter}
    >
      {/* Mode switcher */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-[var(--vos-bg-input)]">
        <button
          type="button"
          className="flex-1 text-xs py-1 rounded-md transition-colors"
          style={{
            background: mode === 'kubeconfig' ? 'var(--vos-accent-primary)' : 'transparent',
            color: mode === 'kubeconfig' ? '#fff' : 'var(--vos-text-secondary)'
          }}
          onClick={() => setMode('kubeconfig')}
        >
          Kubeconfig
        </button>
        <button
          type="button"
          className="flex-1 text-xs py-1 rounded-md transition-colors"
          style={{
            background: mode === 'teleport' ? 'var(--vos-accent-primary)' : 'transparent',
            color: mode === 'teleport' ? '#fff' : 'var(--vos-text-secondary)'
          }}
          onClick={() => {
            setMode('teleport')
            if (tshAvailable === null && mode !== 'teleport') checkTsh()
          }}
        >
          Teleport
        </button>
      </div>

      {mode === 'kubeconfig' ? (
        <>
          <div className="vos-form-row">
            <label>集群名称</label>
            <FormInput placeholder="集群名称" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="vos-form-row">
            <label>Kubeconfig</label>
            <VfsPathPickerInput
              mode="file"
              value={kubeconfigPath}
              onChange={handleKubeconfigChange}
              placeholder="~/.kube/config（留空使用默认，支持 VFS 远程路径）"
              className="vos-input vos-input-sm"
            />
          </div>
        </>
      ) : (
        <>
          {/* tsh availability gate */}
          {tshAvailable === null && (
            <div className="flex items-center gap-2 py-4 text-xs text-[var(--vos-text-secondary)]">
              <Loader2 size={13} className="animate-spin" />
              <span>正在检测 tsh 安装状态…</span>
            </div>
          )}
          {tshAvailable === false && (
            <div className="flex flex-col gap-3 py-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-[rgba(255,149,0,0.12)] text-[var(--vos-accent-warning)]">
                <AlertCircle size={13} className="shrink-0" />
                <span>未检测到 tsh（Teleport 客户端），需要先安装才能使用 Teleport 集成。</span>
              </div>
              {tshInstallLog && (
                <pre className="text-[10px] bg-[var(--vos-bg-code)] rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap">
                  {tshInstallLog}
                </pre>
              )}
              <div className="flex gap-2">
                <button type="button" className="vos-btn vos-btn-sm" onClick={checkTsh} disabled={tshInstalling}>
                  重新检测
                </button>
                <button
                  type="button"
                  className="vos-btn vos-btn-sm vos-btn-primary"
                  onClick={installTsh}
                  disabled={tshInstalling}
                >
                  {tshInstalling ? (
                    <>
                      <Loader2 size={11} className="animate-spin inline mr-1" />
                      安装中…
                    </>
                  ) : (
                    '自动安装 tsh'
                  )}
                </button>
              </div>
            </div>
          )}
          {tshAvailable === true && (
            <>
              {tpError && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs bg-[rgba(255,59,48,0.1)] text-[var(--vos-accent-danger)]">
                  <AlertCircle size={12} className="shrink-0" />
                  <span className="flex-1">{tpError}</span>
                </div>
              )}

              {tpStep === 'credentials' && (
                <>
                  <div className="vos-form-row">
                    <label>Teleport 服务器地址</label>
                    <FormInput
                      placeholder="https://teleport.example.com"
                      value={tpProxy}
                      onChange={e => setTpProxy(e.target.value)}
                      onBlur={handleTpProxyBlur}
                    />
                    {tpNeedsOtp === true && (
                      <div className="text-[10px] text-[var(--vos-accent-success)] mt-1">
                        该服务需要双因素验证（OTP）
                      </div>
                    )}
                    {tpNeedsOtp === false && (
                      <div className="text-[10px] text-[var(--vos-text-tertiary)] mt-1">无需双因素验证</div>
                    )}
                  </div>
                  <div className="vos-form-row">
                    <label>用户名</label>
                    <FormInput placeholder="用户名" value={tpUser} onChange={e => setTpUser(e.target.value)} />
                  </div>
                  <div className="vos-form-row">
                    <label>密码</label>
                    <FormInput
                      type="password"
                      placeholder="密码"
                      value={tpPassword}
                      onChange={e => setTpPassword(e.target.value)}
                    />
                  </div>
                  {tpNeedsOtp === true && (
                    <div className="vos-form-row">
                      <label>验证码 (OTP)</label>
                      <FormInput placeholder="6位验证码" value={tpOtp} onChange={e => setTpOtp(e.target.value)} />
                    </div>
                  )}
                </>
              )}

              {tpStep === 'otp' && (
                <>
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs bg-[rgba(52,199,89,0.1)] text-[var(--vos-accent-success)]">
                    <CheckCircle2 size={12} className="shrink-0" />
                    <span>密码验证通过，请输入双因素验证码</span>
                  </div>
                  <div className="vos-form-row">
                    <label>验证码 (OTP)</label>
                    <FormInput
                      placeholder="6 位验证码"
                      value={tpOtp}
                      onChange={e => setTpOtp(e.target.value)}
                      autoFocus
                    />
                  </div>
                </>
              )}

              {tpStep === 'clusters' && (
                <>
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs bg-[rgba(52,199,89,0.1)] text-[var(--vos-accent-success)]">
                    <CheckCircle2 size={12} className="shrink-0" />
                    <span>登录成功，选择要添加的 Kubernetes 集群</span>
                  </div>
                  <div className="vos-form-row">
                    <label>K8s 集群</label>
                    {tpClusters.length > 0 ? (
                      <FormSelect
                        className="text-xs"
                        wrapperClassName="w-full"
                        value={tpSelectedCluster}
                        onChange={e => {
                          setTpSelectedCluster(e.target.value)
                          setTpClusterName(e.target.value)
                        }}
                      >
                        {tpClusters.map(c => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </FormSelect>
                    ) : (
                      <div className="text-xs text-[var(--vos-text-tertiary)] py-2">未发现可用的 Kubernetes 集群</div>
                    )}
                  </div>
                  <div className="vos-form-row">
                    <label>显示名称</label>
                    <FormInput
                      placeholder="集群显示名称"
                      value={tpClusterName}
                      onChange={e => setTpClusterName(e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── Edit cluster modal ────────────────────────────────────────────────────

function EditClusterModal({ cluster, onClose, onUpdated }: { cluster: K8sCluster; onClose: () => void; onUpdated: (c: K8sCluster) => void }) {
  const isTeleport = cluster.group === 'teleport'
  const [name, setName] = useState(cluster.name)
  const [kubeconfigPath, setKubeconfigPath] = useState(cluster.kubeconfig_path ?? '')
  const [kubeconfigInline, setKubeconfigInline] = useState<string | undefined>(cluster.kubeconfig_inline)
  const [contextName, setContextName] = useState(cluster.context_name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Teleport re-login state
  const [tpProxy, setTpProxy] = useState('')
  const [tpUser, setTpUser] = useState('')
  const [tpPassword, setTpPassword] = useState('')
  const [tpOtp, setTpOtp] = useState('')
  const [tpNeedsOtp, setTpNeedsOtp] = useState(false)
  const [tpReloginLoading, setTpReloginLoading] = useState(false)

  const handleKubeconfigChange = async (path: string, result?: VfsPickerResult) => {
    setKubeconfigPath(path)
    if (result?.isRemote && result.content) {
      const text = await result.content.text()
      setKubeconfigInline(text)
    } else {
      setKubeconfigInline(undefined)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const req: UpdateK8sClusterReq = {
        name: name.trim(),
        context_name: contextName || undefined,
        kubeconfig_path: kubeconfigInline ? undefined : kubeconfigPath || undefined,
        kubeconfig_inline: kubeconfigInline || undefined
      }
      const res = await k8sApi.updateK8sCluster(cluster.id, req)
      onUpdated(res.data)
    } catch (e: any) {
      setError(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTeleportRelogin = async () => {
    if (!tpProxy || !tpUser || !tpPassword) return
    setTpReloginLoading(true)
    setError('')
    try {
      // Step 1: Login
      const loginRes = await k8sApi.teleportLogin({
        proxy: tpProxy,
        user: tpUser,
        password: tpPassword,
        otp: tpNeedsOtp ? tpOtp || undefined : undefined,
      })
      const loginResult = loginRes.data
      if (!loginResult.success) {
        if (loginResult.needs_otp) {
          setTpNeedsOtp(true)
          return
        }
        setError(loginResult.message)
        return
      }

      // Step 2: Extract cluster name from context (format: "proxy-clustername")
      // The cluster name is the part after the first hyphen that matches the original context
      const clusterName = cluster.context_name.split('-').slice(1).join('-') || cluster.context_name

      // Step 3: Refresh kubeconfig
      const kcRes = await k8sApi.teleportGetKubeconfig(tpProxy, clusterName)
      const kcResult = kcRes.data
      if (!kcResult.success) {
        setError(kcResult.message)
        return
      }

      // Step 4: Update the cluster with new kubeconfig
      const updateReq: UpdateK8sClusterReq = {
        name: name.trim(),
        kubeconfig_path: kcResult.kubeconfig_path || undefined,
        kubeconfig_inline: kcResult.kubeconfig_path ? undefined : kcResult.kubeconfig || undefined,
        context_name: kcResult.context_name || cluster.context_name,
      }
      const res = await k8sApi.updateK8sCluster(cluster.id, updateReq)
      onUpdated(res.data)
    } catch (e: any) {
      setError(e?.message || '重新登录失败')
    } finally {
      setTpReloginLoading(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="编辑集群"
      width={400}
      footer={
        <>
          <button type="button" className="vos-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      {error && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs bg-[rgba(255,59,48,0.1)] text-[var(--vos-accent-danger)]">
          <AlertCircle size={12} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="vos-form-row">
        <label>集群名称</label>
        <FormInput value={name} onChange={e => setName(e.target.value)} placeholder="集群名称" />
      </div>
      {isTeleport ? (
        <>
          <div className="vos-form-row">
            <label>Context</label>
            <FormInput value={cluster.context_name} disabled placeholder="Teleport 自动生成" />
          </div>
          <div className="vos-form-row">
            <label>Kubeconfig</label>
            <FormInput value={cluster.kubeconfig_path ?? ''} disabled />
          </div>

          {/* Re-login section */}
          <div className="mt-4 pt-3 border-t border-[var(--vos-border-subtle)]">
            <div className="text-xs font-medium text-[var(--vos-text-secondary)] mb-3">重新登录 Teleport</div>
            <div className="vos-form-row">
              <label>Proxy</label>
              <FormInput value={tpProxy} onChange={e => setTpProxy(e.target.value)} placeholder="https://teleport.example.com" />
            </div>
            <div className="vos-form-row">
              <label>用户名</label>
              <FormInput value={tpUser} onChange={e => setTpUser(e.target.value)} placeholder="Teleport 用户名" />
            </div>
            <div className="vos-form-row">
              <label>密码</label>
              <FormInput value={tpPassword} onChange={e => setTpPassword(e.target.value)} type="password" placeholder="密码" />
            </div>
            {tpNeedsOtp && (
              <div className="vos-form-row">
                <label>OTP</label>
                <FormInput value={tpOtp} onChange={e => setTpOtp(e.target.value)} placeholder="OTP 验证码" />
              </div>
            )}
            <button
              type="button"
              className="vos-btn vos-btn-primary w-full mt-2"
              onClick={handleTeleportRelogin}
              disabled={tpReloginLoading || !tpProxy || !tpUser || !tpPassword}
            >
              {tpReloginLoading ? '登录中…' : tpNeedsOtp ? '验证 OTP 并登录' : '重新登录并刷新凭证'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="vos-form-row">
            <label>Kubeconfig 路径</label>
            <VfsPathPickerInput
              mode="file"
              value={kubeconfigPath}
              onChange={handleKubeconfigChange}
              placeholder="留空使用默认路径"
              className="vos-input vos-input-sm"
            />
          </div>
          <div className="vos-form-row">
            <label>Context 名称</label>
            <FormInput value={contextName} onChange={e => setContextName(e.target.value)} placeholder="kubeconfig 中的 context 名称" />
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function KubernetesApp({ windowId, initialAppState }: AppComponentProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingCluster, setEditingCluster] = useState<K8sCluster | null>(null)
  const [workspaceReady, setWorkspaceReady] = useState(false)

  const loadClusters = useClusterStore(s => s.loadClusters)
  const addCluster = useClusterStore(s => s.addCluster)
  const updateClusterInStore = useClusterStore(s => s.updateCluster)
  const clusters = useClusterStore(s => s.clusters)
  const clustersLoading = useClusterStore(s => s.loading)

  const tabs = useKubernetesStore(s => s.tabs)
  const activeTabId = useKubernetesStore(s => s.activeTabId)
  const hydrateAppState = useKubernetesStore(s => s.hydrateAppState)
  const activeTab = useKubernetesStore(s => s.getActiveTab())
  const openTab = useKubernetesStore(s => s.openTab)

  const persistedAppState = useMemo(
    () => ({
      tabs,
      activeTabId
    }),
    [tabs, activeTabId]
  )

  // Load clusters first, then restore persisted window appState for refresh recovery.
  useEffect(() => {
    let active = true
    const init = async () => {
      await loadClusters()
      if (!active) return

      const latestClusters = useClusterStore.getState().clusters
      const restored = hydrateAppState(
        initialAppState,
        latestClusters.length > 0 ? latestClusters.map(cluster => cluster.id) : undefined
      )

      if (!restored && latestClusters.length > 0) {
        // Auto-open overview for first cluster
        openTab(latestClusters[0].id, '', 'overview')
      }

      if (active) {
        setWorkspaceReady(true)
      }
    }

    init()
    return () => {
      active = false
    }
  }, [hydrateAppState, initialAppState, loadClusters, openTab])

  const handleCreated = useCallback(
    (c: K8sCluster) => {
      addCluster(c)
      setShowForm(false)
      openTab(c.id, '', 'overview')
    },
    [addCluster, openTab]
  )

  const handleEditCluster = useCallback((id: string) => {
    const c = useClusterStore.getState().clusters.find(cl => cl.id === id)
    if (c) setEditingCluster(c)
  }, [])

  const handleUpdated = useCallback(
    (c: K8sCluster) => {
      updateClusterInStore(c.id, {
        name: c.name,
        context_name: c.context_name,
        kubeconfig_path: c.kubeconfig_path,
        kubeconfig_inline: c.kubeconfig_inline
      })
      setEditingCluster(null)
    },
    [updateClusterInStore]
  )

  return (
    <K8sLayout
      onAddCluster={() => setShowForm(true)}
      onEditCluster={handleEditCluster}
      overlay={
        showForm ? (
          <ClusterForm onClose={() => setShowForm(false)} onCreated={handleCreated} />
        ) : editingCluster ? (
          <EditClusterModal
            cluster={editingCluster}
            onClose={() => setEditingCluster(null)}
            onUpdated={handleUpdated}
          />
        ) : undefined
      }
    >
      {workspaceReady && <KubernetesWorkspaceStateSync windowId={windowId} state={persistedAppState} />}
      {activeTab ? (
        activeTab.kind === 'overview' ? (
          <ClusterOverview clusterId={activeTab.clusterId} />
        ) : activeTab.kind === 'application' ||
          activeTab.kind === 'workloads_overview' ||
          activeTab.kind === 'portforward' ? (
          <div className="flex items-center justify-center h-full text-xs text-(--vos-text-tertiary)">
            {activeTab.kind === 'application'
              ? 'Applications'
              : activeTab.kind === 'workloads_overview'
                ? 'Workloads Overview'
                : 'Port Forwarding'}{' '}
            — 开发中
          </div>
        ) : (
          <ResourceList clusterId={activeTab.clusterId} namespace={activeTab.namespace} kind={activeTab.kind} />
        )
      ) : (
        <EmptyState
          icon={<Box size={48} />}
          title="Kubernetes 管理"
          description={clustersLoading ? '正在加载集群…' : '选择左侧集群或添加新集群'}
        />
      )}
    </K8sLayout>
  )
}
