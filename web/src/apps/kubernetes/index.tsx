import { Box } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Modal, FormInput } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useAppStorage } from '@/kernel'
import type { VfsPickerResult } from '@/shell/FilePicker'
import { VfsPathPickerInput } from '@/shell/FilePicker'
import type { CreateK8sClusterReq, K8sCluster } from './api'
import { k8sApi } from './api'
import { ClusterOverview } from './components/overview/ClusterOverview'
import { K8sLayout } from './components/layout/K8sLayout'
import { ResourceList } from './components/resource-list/ResourceList'
import { useClusterStore } from './stores/cluster-store'
import { useKubernetesStore } from './stores/kubernetes-store'

// ─── Add cluster form ──────────────────────────────────────────────────────

function ClusterForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: K8sCluster) => void }) {
  const [name, setName] = useState('')
  const [kubeconfigPath, setKubeconfigPath] = useState('')
  const [kubeconfigInline, setKubeconfigInline] = useState<string | undefined>(undefined)
  const [context, setContext] = useState('')
  const [saving, setSaving] = useState(false)

  const handleKubeconfigChange = async (path: string, result?: VfsPickerResult) => {
    setKubeconfigPath(path)
    if (result?.isRemote && result.content) {
      const text = await result.content.text()
      setKubeconfigInline(text)
    } else {
      setKubeconfigInline(undefined)
    }
  }

  const submit = async () => {
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

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="添加 Kubernetes 集群"
      width={380}
      footer={
        <>
          <button type="button" className="vos-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '添加中…' : '添加'}
          </button>
        </>
      }
    >
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
      <div className="vos-form-row">
        <label>Context（可选）</label>
        <FormInput placeholder="Context（可选）" value={context} onChange={e => setContext(e.target.value)} />
      </div>
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
