import {
  Box,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Layers,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CreateK8sClusterReq, K8sCluster, K8sNamespace, K8sResource, K8sResourceKind } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { PathPickerInput } from '@/shell/FilePicker'

const RESOURCE_GROUPS: { label: string; icon: React.ReactNode; kinds: { kind: K8sResourceKind; label: string }[] }[] = [
  {
    label: '工作负载',
    icon: <Server size={12} />,
    kinds: [
      { kind: 'Pod', label: 'Pods' },
      { kind: 'Deployment', label: 'Deployments' },
      { kind: 'StatefulSet', label: 'StatefulSets' },
      { kind: 'DaemonSet', label: 'DaemonSets' },
      { kind: 'Job', label: 'Jobs' },
      { kind: 'CronJob', label: 'CronJobs' },
      { kind: 'ReplicaSet', label: 'ReplicaSets' }
    ]
  },
  {
    label: '网络',
    icon: <Network size={12} />,
    kinds: [
      { kind: 'Service', label: 'Services' },
      { kind: 'Ingress', label: 'Ingresses' },
      { kind: 'NetworkPolicy', label: 'NetworkPolicies' }
    ]
  },
  {
    label: '存储',
    icon: <HardDrive size={12} />,
    kinds: [
      { kind: 'PersistentVolumeClaim', label: 'PVCs' },
      { kind: 'PersistentVolume', label: 'PVs' },
      { kind: 'StorageClass', label: 'StorageClasses' }
    ]
  },
  {
    label: '配置',
    icon: <Settings size={12} />,
    kinds: [
      { kind: 'ConfigMap', label: 'ConfigMaps' },
      { kind: 'Secret', label: 'Secrets' },
      { kind: 'Namespace', label: 'Namespaces' },
      { kind: 'ServiceAccount', label: 'ServiceAccounts' }
    ]
  }
]

// ─── Add cluster form ──────────────────────────────────────────────────────

function ClusterForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: K8sCluster) => void }) {
  const [name, setName] = useState('')
  const [kubeconfigPath, setKubeconfigPath] = useState('')
  const [context, setContext] = useState('')
  const [saving, setSaving] = useState(false)
  const fc = 'w-full text-xs px-2 py-1.5 rounded border-none outline-none'
  const fs = {
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '0.5px solid var(--vos-border-subtle)'
  }

  const submit = async () => {
    if (!name) return
    setSaving(true)
    try {
      const body: CreateK8sClusterReq = {
        name,
        kubeconfig_path: kubeconfigPath || undefined,
        context_name: context || undefined
      }
      const res = await apiClient.createK8sCluster(body)
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="rounded-lg p-4 flex flex-col gap-3"
        style={{ width: 380, background: 'var(--vos-bg-surface)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
      >
        <div className="text-sm font-medium">添加 Kubernetes 集群</div>
        <input className={fc} style={fs} placeholder="集群名称" value={name} onChange={e => setName(e.target.value)} />
        <PathPickerInput
          mode="file"
          value={kubeconfigPath}
          onChange={setKubeconfigPath}
          placeholder="~/.kube/config（留空使用默认）"
          className={fc}
          style={fs}
        />
        <input
          className={fc}
          style={fs}
          placeholder="Context（可选）"
          value={context}
          onChange={e => setContext(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-text-primary)' }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
            onClick={submit}
            disabled={saving}
          >
            {saving ? '添加中…' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function KubernetesApp(_props: AppComponentProps) {
  const [clusters, setClusters] = useState<K8sCluster[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([])
  const [selectedNs, setSelectedNs] = useState<string>('default')
  const [selectedKind, setSelectedKind] = useState<K8sResourceKind>('Pod')
  const [resources, setResources] = useState<K8sResource[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['工作负载']))
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    try {
      const r = await apiClient.getK8sClusters()
      setClusters(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const selectCluster = async (id: string) => {
    setSelectedCluster(id)
    setExpandedClusters(s => new Set(s).add(id))
    try {
      const r = await apiClient.getK8sNamespaces(id)
      setNamespaces(r.data)
      const firstNs = r.data[0]?.name ?? 'default'
      setSelectedNs(firstNs)
      fetchResources(id, firstNs, selectedKind)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchResources = async (clusterId: string, ns: string, kind: K8sResourceKind) => {
    setLoading(true)
    try {
      const r = await apiClient.getK8sResources(clusterId, kind, ns)
      setResources(r.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const pickKind = (kind: K8sResourceKind) => {
    setSelectedKind(kind)
    if (selectedCluster) fetchResources(selectedCluster, selectedNs, kind)
  }

  const pickNs = (ns: string) => {
    setSelectedNs(ns)
    if (selectedCluster) fetchResources(selectedCluster, ns, selectedKind)
  }

  const toggleGroup = (label: string) =>
    setExpandedGroups(s => {
      const n = new Set(s)
      n.has(label) ? n.delete(label) : n.add(label)
      return n
    })

  const toggleCluster = (id: string) =>
    setExpandedClusters(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const deleteCluster = async (id: string) => {
    await apiClient.deleteK8sCluster(id)
    reload()
  }

  return (
    <div className="flex h-full relative">
      {showForm && (
        <ClusterForm
          onClose={() => setShowForm(false)}
          onCreated={c => {
            setClusters(p => [...p, c])
            setShowForm(false)
          }}
        />
      )}

      {/* Sidebar */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{ width: 210, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        {/* Clusters section */}
        <div className="px-3 pt-3 pb-1 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--vos-text-tertiary)' }}>
            集群
          </span>
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0"
            style={{ color: 'var(--vos-accent-primary)' }}
            onClick={() => setShowForm(true)}
          >
            <Plus size={14} />
          </button>
        </div>
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
                  style={{ color: isActive ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)', flexShrink: 0 }}
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
              {isExpanded &&
                isActive &&
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
              {isExpanded && isActive && namespaces.length === 0 && (
                <div className="text-[10px] pl-8 py-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                  加载命名空间中…
                </div>
              )}
            </div>
          )
        })}
        {clusters.length === 0 && (
          <div className="text-xs px-3 py-2" style={{ color: 'var(--vos-text-tertiary)' }}>
            无集群
          </div>
        )}

        {/* Divider */}
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
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
              <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                {selectedNs}
              </span>
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
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
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
                                r.status === 'Running' || r.status === 'Active'
                                  ? '#22c55e'
                                  : 'var(--vos-text-secondary)'
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
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Box size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                Kubernetes 管理
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                选择左侧集群或添加新集群
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
