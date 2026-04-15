import {
  Box,
  ChevronDown,
  ChevronRight,
  Home,
  Layers,
  Plus,
  Star,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { SectionHeader, Spinner } from '@/components'
import { useContextMenu } from '@/shell/ContextMenu/store'
import { SIDEBAR_TREE } from '../../constants'
import { useClusterStore } from '../../stores/cluster-store'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sCluster, K8sResourceKind, SidebarNode } from '../../types'
import { getResourceDef } from '../../utils/resource-registry'

export function K8sSidebar() {
  const clusters = useClusterStore(s => s.clusters)
  const loading = useClusterStore(s => s.loading)
  const connections = useClusterStore(s => s.connections)
  const removeCluster = useClusterStore(s => s.removeCluster)
  const fetchNamespaces = useClusterStore(s => s.fetchNamespaces)
  const toggleSidebarCluster = useKubernetesStore(s => s.toggleSidebarCluster)
  const expandSidebarCluster = useKubernetesStore(s => s.expandSidebarCluster)
  const expandedClusters = useKubernetesStore(s => s.sidebarExpandedClusters)
  const openTab = useKubernetesStore(s => s.openTab)
  const activeTabId = useKubernetesStore(s => s.activeTabId)
  const activeTab = useKubernetesStore(s => s.getActiveTab())

  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set>(
    () => new Set(['workloads', 'config', 'network', 'storage'])
  ))

  useEffect(() => {
    // Auto-expand cluster of active tab
    if (activeTab) {
      expandSidebarCluster(activeTab.clusterId)
    }
  }, [activeTab, expandSidebarCluster])

  const onClusterContextMenu = useContextMenu((e, cluster: K8sCluster) => {
    e.preventDefault()
    return [
      {
        id: 'favorite',
        label: favorites.has(cluster.id) ? '从 Hotbar 移除' : '添加到 Hotbar',
        action: () =>
          setFavorites(s => {
            const n = new Set(s)
            if (n.has(cluster.id)) n.delete(cluster.id)
            else n.add(cluster.id)
            return n
          }),
      },
      { type: 'separator' },
      {
        id: 'refresh',
        label: '刷新命名空间',
        action: () => fetchNamespaces(cluster.id),
      },
      {
        id: 'remove',
        label: '删除',
        danger: true,
        action: () => removeCluster(cluster.id),
      },
    ]
  })

  const toggleGroup = (id: string) => {
    setExpandedGroups(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleLeafClick = (clusterId: string, kind: K8sResourceKind) => {
    const conn = connections[clusterId]
    const ns = conn?.namespaces[0]?.name ?? 'default'
    const targetNs = kind === 'overview' || kind === 'namespace' || kind === 'node' || kind === 'event'
      ? ''
      : ns
    openTab(clusterId, targetNs, kind)
  }

  const groupedClusters = {
    local: clusters.filter(c => !c.source || c.source === 'local'),
    teleport: clusters.filter(c => c.source === 'teleport'),
    custom: clusters.filter(c => c.source === 'custom'),
  }

  const renderTreeNode = (node: SidebarNode, clusterId: string, depth = 0) => {
    if (node.type === 'leaf') {
      const isActive =
        activeTab?.clusterId === clusterId && activeTab?.kind === node.kind
      const Icon = node.icon ?? Box
      return (
        <div
          key={node.id}
          className="flex items-center gap-1 cursor-pointer text-xs rounded mx-1 pl-[22px] pr-2 py-[2px]"
          style={{
            background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
            color: isActive ? '#fff' : 'var(--vos-text-primary)',
            paddingLeft: `${depth * 8 + 22}px`,
          }}
          onClick={() => handleLeafClick(clusterId, node.kind)}
        >
          <Icon size={11} className="shrink-0" />
          <span className="truncate">{node.label}</span>
        </div>
      )
    }

    const isExpanded = expandedGroups.has(`${clusterId}::${node.id}`)
    const Icon = node.icon ?? Box
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs text-[var(--vos-text-secondary)] hover:bg-[var(--vos-bg-item-hover)] rounded mx-1"
          onClick={() => toggleGroup(`${clusterId}::${node.id}`)}
        >
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <Icon size={11} />
          <span>{node.label}</span>
        </div>
        {isExpanded &&
          node.children.map(child => renderTreeNode(child, clusterId, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full text-xs overflow-y-auto">
      {/* Hotbar */}
      {favorites.size > 0 && (
        <div className="px-2 pt-2 pb-1">
          <div className="text-[10px] font-semibold tracking-wider text-[var(--vos-text-tertiary)] mb-1">
            HOTBAR
          </div>
          <div className="flex gap-1 flex-wrap">
            {clusters
              .filter(c => favorites.has(c.id))
              .map(c => {
                const isActive = activeTab?.clusterId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="w-7 h-7 rounded flex items-center justify-center border-[0.5px] border-[var(--vos-border-subtle)]"
                    style={{
                      background: isActive
                        ? 'color-mix(in srgb, var(--vos-accent-primary) 15%, transparent)'
                        : 'var(--vos-bg-item-hover)',
                    }}
                    onClick={() => handleLeafClick(c.id, 'overview')}
                    title={c.name}
                  >
                    <Layers size={14} />
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Clusters header */}
      <SectionHeader
        title="KUBERNETES CLUSTERS"
        actions={
          <button
            type="button"
            className="bg-transparent border-none cursor-pointer p-0 text-[var(--vos-accent-primary)]"
            onClick={() => {
              /* TODO: open add cluster modal */
            }}
          >
            <Plus size={14} />
          </button>
        }
      />

      {loading && clusters.length === 0 && (
        <div className="flex items-center justify-center py-4">
          <Spinner size={16} />
        </div>
      )}

      {/* Cluster groups */}
      {Object.entries(groupedClusters).map(([source, list]) =>
        list.length === 0 ? null : (
          <div key={source} className="mb-1">
            <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-[var(--vos-text-tertiary)] uppercase">
              {source === 'local' && 'Local Kubeconfigs'}
              {source === 'teleport' && 'Teleport'}
              {source === 'custom' && 'Custom'}
            </div>
            {list.map(cluster => {
              const isExpanded = expandedClusters.has(cluster.id)
              const isActive = activeTab?.clusterId === cluster.id
              const conn = connections[cluster.id]
              const nsLoading = conn?.namespaceLoading

              return (
                <div key={cluster.id}>
                  {/* Cluster row */}
                  <div
                    className="flex items-center gap-1 px-2 py-1 cursor-pointer group"
                    style={{
                      background: isActive
                        ? 'color-mix(in srgb, var(--vos-accent-primary) 10%, transparent)'
                        : 'transparent',
                      borderLeft: isActive
                        ? '3px solid var(--vos-accent-primary)'
                        : '3px solid transparent',
                    }}
                    onContextMenu={e => onClusterContextMenu(e as unknown as React.MouseEvent, cluster)}
                  >
                    <button
                      type="button"
                      className="bg-transparent border-none p-0 cursor-pointer"
                      onClick={() => toggleSidebarCluster(cluster.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown size={10} className="text-[var(--vos-text-tertiary)]" />
                      ) : (
                        <ChevronRight size={10} className="text-[var(--vos-text-tertiary)]" />
                      )}
                    </button>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background:
                          conn?.connected
                            ? 'var(--vos-accent-success)'
                            : conn?.namespaceError
                              ? 'var(--vos-accent-danger)'
                              : 'var(--vos-text-tertiary)',
                      }}
                    />
                    <span
                      className="flex-1 truncate font-medium"
                      style={{
                        color: isActive
                          ? 'var(--vos-accent-primary)'
                          : 'var(--vos-text-primary)',
                      }}
                      onClick={() => handleLeafClick(cluster.id, 'overview')}
                    >
                      {cluster.name}
                    </span>
                    {nsLoading && <Spinner size={10} />}
                    <button
                      type="button"
                      className="hidden group-hover:block bg-transparent border-none p-0 cursor-pointer text-[var(--vos-text-tertiary)]"
                      onClick={() => removeCluster(cluster.id)}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>

                  {/* Expanded cluster resources */}
                  {isExpanded && (
                    <div className="pb-1">
                      {conn?.namespaceError && (
                        <div className="pl-6 pr-2 py-1">
                          <div className="text-[10px] text-[var(--vos-accent-danger)]">
                            {conn.namespaceError}
                          </div>
                          <button
                            type="button"
                            className="text-[10px] bg-transparent border-none cursor-pointer p-0 text-[var(--vos-accent-primary)]"
                            onClick={() => fetchNamespaces(cluster.id)}
                          >
                            重试
                          </button>
                        </div>
                      )}
                      {SIDEBAR_TREE.map(node => renderTreeNode(node, cluster.id))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {clusters.length === 0 && !loading && (
        <div className="px-3 py-2 text-[var(--vos-text-tertiary)]">
          无集群，点击 + 添加
        </div>
      )}
    </div>
  )
}
