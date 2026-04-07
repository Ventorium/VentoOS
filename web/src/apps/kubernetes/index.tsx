import {
  Box,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Layers,
  Network,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppLayout, AppSidebar, EmptyState, FormInput, Modal, SectionHeader, Spinner } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useAppStorage } from '@/kernel'
import type { VfsPickerResult } from '@/shell/FilePicker'
import { VfsPathPickerInput } from '@/shell/FilePicker'
import type { CreateK8sClusterReq, K8sCluster, K8sNamespace, K8sResource, K8sResourceKind } from './api'
import { k8sApi } from './api'

const RESOURCE_GROUPS: { label: string; icon: React.ReactNode; kinds: { kind: K8sResourceKind; label: string }[] }[] = [
  {
    label: '工作负载',
    icon: <Server size={12} />,
    kinds: [
      { kind: 'pod', label: 'Pods' },
      { kind: 'deployment', label: 'Deployments' },
      { kind: 'statefulset', label: 'StatefulSets' },
      { kind: 'daemonset', label: 'DaemonSets' },
      { kind: 'job', label: 'Jobs' },
      { kind: 'cronjob', label: 'CronJobs' },
      { kind: 'replicaset', label: 'ReplicaSets' }
    ]
  },
  {
    label: '网络',
    icon: <Network size={12} />,
    kinds: [
      { kind: 'service', label: 'Services' },
      { kind: 'ingress', label: 'Ingresses' },
      { kind: 'networkpolicy', label: 'NetworkPolicies' }
    ]
  },
  {
    label: '存储',
    icon: <HardDrive size={12} />,
    kinds: [
      { kind: 'persistentvolumeclaim', label: 'PVCs' },
      { kind: 'persistentvolume', label: 'PVs' },
      { kind: 'storageclass', label: 'StorageClasses' }
    ]
  },
  {
    label: '配置',
    icon: <Settings size={12} />,
    kinds: [
      { kind: 'configmap', label: 'ConfigMaps' },
      { kind: 'secret', label: 'Secrets' },
      { kind: 'namespace', label: 'Namespaces' },
      { kind: 'serviceaccount', label: 'ServiceAccounts' }
    ]
  }
]

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
      // Read remote file content as text for kubeconfig_inline
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

export default function KubernetesApp(_props: AppComponentProps) {
  const storage = useAppStorage('kubernetes')
  const [clusters, setClusters] = useState<K8sCluster[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([])
  const [nsLoading, setNsLoading] = useState(false)
  const [nsError, setNsError] = useState<string | null>(null)
  const [selectedNs, setSelectedNs] = useState<string>('default')
  const [selectedKind, setSelectedKind] = useState<K8sResourceKind>('pod')
  const [resources, setResources] = useState<K8sResource[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['工作负载']))
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const fetchResources = useCallback(async (clusterId: string, ns: string, kind: K8sResourceKind) => {
    setLoading(true)
    try {
      const r = await k8sApi.getK8sResources(clusterId, kind, ns)
      setResources(r.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  const fetchNamespaces = useCallback(async (clusterId: string) => {
    setNsLoading(true)
    setNsError(null)
    try {
      const r = await k8sApi.getK8sNamespaces(clusterId)
      const data = r.data ?? []
      setNamespaces(data)
      return data
    } catch (e) {
      setNsError(e instanceof Error ? e.message : '加载命名空间失败')
      setNamespaces([])
      return []
    } finally {
      setNsLoading(false)
    }
  }, [])

  const selectCluster = useCallback(
    async (id: string, ns?: string, kind?: K8sResourceKind) => {
      setSelectedCluster(id)
      setExpandedClusters(s => new Set(s).add(id))
      setSelectedKind(kind ?? 'pod')
      const nss = await fetchNamespaces(id)
      const targetNs = ns ?? nss[0]?.name ?? 'default'
      setSelectedNs(targetNs)
      fetchResources(id, targetNs, kind ?? 'pod')
    },
    [fetchResources, fetchNamespaces]
  )

  const pickKind = (kind: K8sResourceKind) => {
    setSelectedKind(kind)
    if (selectedCluster) fetchResources(selectedCluster, selectedNs, kind)
    storage.setJSON('preferences', {
      cluster: selectedCluster,
      ns: selectedNs,
      kind,
      groups: Array.from(expandedGroups)
    })
  }

  const pickNs = (ns: string) => {
    setSelectedNs(ns)
    if (selectedCluster) fetchResources(selectedCluster, ns, selectedKind)
    storage.setJSON('preferences', {
      cluster: selectedCluster,
      ns,
      kind: selectedKind,
      groups: Array.from(expandedGroups)
    })
  }

  const toggleGroup = (label: string) =>
    setExpandedGroups(s => {
      const n = new Set(s)
      n.has(label) ? n.delete(label) : n.add(label)
      storage.setJSON('preferences', {
        cluster: selectedCluster,
        ns: selectedNs,
        kind: selectedKind,
        groups: Array.from(n)
      })
      return n
    })

  const toggleCluster = (id: string) =>
    setExpandedClusters(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const reload = useCallback(async () => {
    try {
      const r = await k8sApi.getK8sClusters()
      setClusters(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  const deleteCluster = useCallback(
    async (id: string) => {
      try {
        await k8sApi.deleteK8sCluster(id)
        setClusters(p => p.filter(c => c.id !== id))
        if (selectedCluster === id) {
          setSelectedCluster(null)
          setResources([])
        }
      } catch (e) {
        console.error(e)
      }
    },
    [selectedCluster]
  )

  // Load persisted view preferences
  useEffect(() => {
    let active = true
    const init = async () => {
      const prefs = await storage.getJSON<{ cluster?: string; ns?: string; kind?: K8sResourceKind; groups?: string[] }>(
        'preferences'
      )
      if (!active) return

      if (prefs) {
        if (prefs.groups) setExpandedGroups(new Set(prefs.groups))
        if (prefs.kind) setSelectedKind(prefs.kind)
      }

      try {
        const r = await k8sApi.getK8sClusters()
        if (!active) return
        setClusters(r.data)

        if (prefs?.cluster && r.data.some(c => c.id === prefs.cluster)) {
          // Pass the kind from prefs if available
          await selectCluster(prefs.cluster, prefs.ns, prefs.kind)
        }
      } catch (e) {
        console.error('Failed to init k8s app', e)
        // reload()  <-- Remove this to avoid infinite retry loop on network failure
      }
    }

    init()
    return () => {
      active = false
    }
  }, [storage, reload, selectCluster])

  return (
    <AppLayout
      sidebar={
        <AppSidebar width={210}>
          <SectionHeader
            title="集群"
            actions={
              <button
                type="button"
                className="bg-transparent border-none cursor-pointer p-0"
                style={{ color: 'var(--vos-accent-primary)' }}
                onClick={() => setShowForm(true)}
              >
                <Plus size={14} />
              </button>
            }
          />
          {clusters.map(c => {
            const isActive = selectedCluster === c.id
            const isExpanded = expandedClusters.has(c.id)
            return (
              <div key={c.id}>
                {/* Cluster row */}
                <div
                  className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs group"
                  style={{
                    background: isActive
                      ? 'color-mix(in srgb, var(--vos-accent-primary) 12%, transparent)'
                      : 'transparent'
                  }}
                >
                  <button
                    type="button"
                    className="bg-transparent border-none p-0 cursor-pointer"
                    onClick={() => toggleCluster(c.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown size={10} style={{ color: 'var(--vos-text-tertiary)' }} />
                    ) : (
                      <ChevronRight size={10} style={{ color: 'var(--vos-text-tertiary)' }} />
                    )}
                  </button>
                  <Layers
                    size={12}
                    style={{
                      color: isActive ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)',
                      flexShrink: 0
                    }}
                  />
                  <span
                    className="flex-1 truncate font-medium"
                    style={{ color: isActive ? 'var(--vos-accent-primary)' : 'var(--vos-text-primary)' }}
                    onClick={() => (isActive ? toggleCluster(c.id) : selectCluster(c.id))}
                    onKeyDown={() => {}}
                  >
                    {c.name}
                  </span>
                  <button
                    type="button"
                    className="hidden group-hover:block bg-transparent border-none p-0 cursor-pointer"
                    style={{ color: 'var(--vos-text-tertiary)' }}
                    onClick={() => deleteCluster(c.id)}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
                {/* Namespace sub-items */}
                {isExpanded && isActive && nsLoading && (
                  <div className="text-[10px] pl-8 py-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                    加载命名空间中…
                  </div>
                )}
                {isExpanded && isActive && !nsLoading && nsError && (
                  <div className="pl-8 py-1">
                    <div className="text-[10px]" style={{ color: '#ef4444' }}>
                      {nsError}
                    </div>
                    <button
                      type="button"
                      className="text-[10px] bg-transparent border-none cursor-pointer p-0"
                      style={{ color: 'var(--vos-accent-primary)' }}
                      onClick={() => selectedCluster && fetchNamespaces(selectedCluster)}
                    >
                      重试
                    </button>
                  </div>
                )}
                {isExpanded &&
                  isActive &&
                  !nsLoading &&
                  !nsError &&
                  namespaces.map(ns => (
                    <div
                      key={ns.name}
                      className="flex items-center gap-1 cursor-pointer text-xs"
                      style={{
                        paddingLeft: 24,
                        paddingRight: 8,
                        paddingTop: 2,
                        paddingBottom: 2,
                        background: selectedNs === ns.name ? 'var(--vos-accent-primary)' : 'transparent',
                        color: selectedNs === ns.name ? '#fff' : 'var(--vos-text-secondary)',
                        borderRadius: 3,
                        margin: '0 4px'
                      }}
                      onClick={() => pickNs(ns.name)}
                      onKeyDown={() => {}}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          background: selectedNs === ns.name ? 'rgba(255,255,255,0.6)' : 'var(--vos-text-tertiary)',
                          minWidth: 8,
                          minHeight: 8
                        }}
                      />
                      <span className="truncate">{ns.name}</span>
                    </div>
                  ))}
              </div>
            )
          })}
          {clusters.length === 0 && (
            <div className="text-xs px-3 py-2" style={{ color: 'var(--vos-text-tertiary)' }}>
              无集群
            </div>
          )}

          {/* Divider + Resource types — only visible when a cluster is selected */}
          {selectedCluster && (
            <>
              <div style={{ borderTop: '0.5px solid var(--vos-border-subtle)', margin: '8px 0 0' }} />
              {/* Resource types nav */}
              <div
                className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider"
                style={{ color: 'var(--vos-text-tertiary)' }}
              >
                资源类型
              </div>
              {RESOURCE_GROUPS.map(group => (
                <div key={group.label}>
                  <div
                    className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs"
                    style={{ color: 'var(--vos-text-secondary)' }}
                    onClick={() => toggleGroup(group.label)}
                    onKeyDown={() => {}}
                  >
                    {expandedGroups.has(group.label) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    {group.icon}
                    <span>{group.label}</span>
                  </div>
                  {expandedGroups.has(group.label) &&
                    group.kinds.map(k => (
                      <div
                        key={k.kind}
                        className="flex items-center gap-1 cursor-pointer text-xs rounded"
                        style={{
                          paddingLeft: 22,
                          paddingRight: 8,
                          paddingTop: 2,
                          paddingBottom: 2,
                          margin: '0 4px',
                          background: selectedKind === k.kind ? 'var(--vos-accent-primary)' : 'transparent',
                          color: selectedKind === k.kind ? '#fff' : 'var(--vos-text-primary)'
                        }}
                        onClick={() => pickKind(k.kind)}
                        onKeyDown={() => {}}
                      >
                        {k.label}
                      </div>
                    ))}
                </div>
              ))}
            </>
          )}
        </AppSidebar>
      }
      overlay={
        showForm ? (
          <ClusterForm
            onClose={() => setShowForm(false)}
            onCreated={c => {
              setClusters(p => [...p, c])
              setShowForm(false)
            }}
          />
        ) : undefined
      }
    >
      {/* Main content */}
      {selectedCluster ? (
        <>
          {/* Toolbar — shows cluster/ns + kind breadcrumb */}
          <div
            className="flex items-center gap-2 h-9 px-3 flex-shrink-0"
            style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
          >
            <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
              {clusters.find(c => c.id === selectedCluster)?.name}
            </span>
            <ChevronRight size={10} style={{ color: 'var(--vos-text-tertiary)' }} />
            <select
              className="text-xs border-none outline-none cursor-pointer rounded px-1 py-0.5"
              style={{
                background: 'var(--vos-bg-input)',
                color: 'var(--vos-text-primary)',
                border: '0.5px solid var(--vos-border-subtle)'
              }}
              value={selectedNs}
              onChange={e => pickNs(e.target.value)}
            >
              {namespaces.map(ns => (
                <option key={ns.name} value={ns.name}>
                  {ns.name}
                </option>
              ))}
            </select>
            <ChevronRight size={10} style={{ color: 'var(--vos-text-tertiary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--vos-text-primary)' }}>
              {selectedKind}s
            </span>
            <span className="flex-1" />
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-accent-primary)' }}
              onClick={() => selectedCluster && fetchResources(selectedCluster, selectedNs, selectedKind)}
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="flex-1 overflow-auto text-xs">
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Namespace', 'Status', 'Age'].map(h => (
                      <th
                        key={h}
                        className="px-3 py-1.5 text-left font-medium sticky top-0"
                        style={{
                          background: 'var(--vos-bg-surface)',
                          borderBottom: '1px solid var(--vos-border-subtle)'
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resources.map(r => (
                    <tr key={r.name} style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                      <td className="px-3 py-1.5 font-mono">{r.name}</td>
                      <td className="px-3 py-1.5">{r.namespace ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{
                            background:
                              r.status === 'Running' || r.status === 'Active'
                                ? 'rgba(34,197,94,0.15)'
                                : 'var(--vos-bg-item-hover)',
                            color:
                              r.status === 'Running' || r.status === 'Active' ? '#22c55e' : 'var(--vos-text-secondary)'
                          }}
                        >
                          {r.status ?? 'Unknown'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5" style={{ color: 'var(--vos-text-tertiary)' }}>
                        {r.age ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resources.length === 0 && (
                <div className="flex items-center justify-center py-8" style={{ color: 'var(--vos-text-tertiary)' }}>
                  无资源
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={<Box size={48} />} title="Kubernetes 管理" description="选择左侧集群或添加新集群" />
      )}
    </AppLayout>
  )
}
