import { Box, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Modal, FormInput } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useAppStorage } from '@/kernel'
import type { VfsPickerResult } from '@/shell/FilePicker'
import { VfsPathPickerInput } from '@/shell/FilePicker'
import type { CreateK8sClusterReq, K8sCluster, TeleportKubeCluster } from './api'
import { k8sApi } from './api'
import { ClusterOverview } from './components/overview/ClusterOverview'
import { K8sLayout } from './components/layout/K8sLayout'
import { ResourceList } from './components/resource-list/ResourceList'
import { useClusterStore } from './stores/cluster-store'
import { useKubernetesStore } from './stores/kubernetes-store'

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

  const handleTpProxyBlur = async () => {
    const proxy = tpProxy.trim()
    if (!proxy) { setTpNeedsOtp(null); return }
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
        context_name: context || undefined,
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
      const includeOtp = tpStep === 'otp' ? tpOtp || undefined
        : (tpNeedsOtp === true && tpOtp) ? tpOtp
        : undefined
      const res = await k8sApi.teleportLogin({
        proxy: tpProxy,
        user: tpUser,
        password: tpPassword,
        otp: includeOtp,
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
      if (!result.success || !result.kubeconfig) {
        setTpError(result.message)
        return
      }
      const clusterRes = await k8sApi.createK8sCluster({
        name: tpClusterName || tpSelectedCluster,
        kubeconfig_inline: result.kubeconfig,
        context_name: tpSelectedCluster,
        group: 'teleport',
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
      <button type="button" className="vos-btn" onClick={onClose}>取消</button>
      <button type="button" className="vos-btn vos-btn-primary" onClick={submitKubeconfig} disabled={saving}>
        {saving ? '添加中…' : '添加'}
      </button>
    </>
  )

  const teleportFooter = (
    <>
      <button type="button" className="vos-btn" onClick={onClose}>取消</button>
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
            color: mode === 'kubeconfig' ? '#fff' : 'var(--vos-text-secondary)',
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
            color: mode === 'teleport' ? '#fff' : 'var(--vos-text-secondary)',
          }}
          onClick={() => setMode('teleport')}
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
                  <div className="text-[10px] text-[var(--vos-accent-success)] mt-1">该服务需要双因素验证（OTP）</div>
                )}
                {tpNeedsOtp === false && (
                  <div className="text-[10px] text-[var(--vos-text-tertiary)] mt-1">无需双因素验证</div>
                )}
              </div>
              <div className="vos-form-row">
                <label>用户名</label>
                <FormInput
                  placeholder="用户名"
                  value={tpUser}
                  onChange={e => setTpUser(e.target.value)}
                />
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
                  <FormInput
                    placeholder="6位验证码"
                    value={tpOtp}
                    onChange={e => setTpOtp(e.target.value)}
                  />
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
                  <select
                    className="vos-input text-xs"
                    value={tpSelectedCluster}
                    onChange={e => {
                      setTpSelectedCluster(e.target.value)
                      setTpClusterName(e.target.value)
                    }}
                  >
                    {tpClusters.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-[var(--vos-text-tertiary)] py-2">
                    未发现可用的 Kubernetes 集群
                  </div>
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
    </Modal>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function KubernetesApp({ initialAppState }: AppComponentProps) {
  const storage = useAppStorage('kubernetes')
  const [showForm, setShowForm] = useState(false)

  const loadClusters = useClusterStore(s => s.loadClusters)
  const addCluster = useClusterStore(s => s.addCluster)
  const clustersLoading = useClusterStore(s => s.loading)
  const clusters = useClusterStore(s => s.clusters)

  const activeTab = useKubernetesStore(s => s.getActiveTab())
  const openTab = useKubernetesStore(s => s.openTab)

  // Load persisted preferences and clusters on mount
  useEffect(() => {
    let active = true
    const init = async () => {
      if (!active) return
      await loadClusters()
      if (!active) return

      const prefs = await storage.getJSON<{ cluster?: string; ns?: string; kind?: string }>('preferences')
      // Read clusters from store directly after loading, not from closure
      const latestClusters = useClusterStore.getState().clusters
      if (prefs?.cluster) {
        const cluster = latestClusters.find(c => c.id === prefs.cluster)
        if (cluster) {
          openTab(cluster.id, prefs.ns ?? '', (prefs.kind as any) ?? 'overview')
        }
      } else if (latestClusters.length > 0) {
        // Auto-open overview for first cluster
        openTab(latestClusters[0].id, '', 'overview')
      }
    }
    init()
    return () => {
      active = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  const handleCreated = useCallback(
    (c: K8sCluster) => {
      addCluster(c)
      setShowForm(false)
      openTab(c.id, '', 'overview')
    },
    [addCluster, openTab]
  )

  return (
    <K8sLayout
      onAddCluster={() => setShowForm(true)}
      overlay={
        showForm ? (
          <ClusterForm onClose={() => setShowForm(false)} onCreated={handleCreated} />
        ) : undefined
      }
    >
      {activeTab ? (
        activeTab.kind === 'overview' ? (
          <ClusterOverview clusterId={activeTab.clusterId} />
        ) : activeTab.kind === 'application' || activeTab.kind === 'workloads_overview' || activeTab.kind === 'portforward' ? (
          <div className="flex items-center justify-center h-full text-xs text-(--vos-text-tertiary)">
            {activeTab.kind === 'application' ? 'Applications' : activeTab.kind === 'workloads_overview' ? 'Workloads Overview' : 'Port Forwarding'} — 开发中
          </div>
        ) : (
          <ResourceList
            clusterId={activeTab.clusterId}
            namespace={activeTab.namespace}
            kind={activeTab.kind}
          />
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
