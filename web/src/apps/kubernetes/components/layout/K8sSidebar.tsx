import {
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  Plus,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { SectionHeader, Spinner } from '@/components'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { SIDEBAR_TREE } from '../../constants'
import { useClusterStore } from '../../stores/cluster-store'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sResourceKind, SidebarNode } from '../../types'
import { getResourceDef } from '../../utils/resource-registry'

interface SidebarProps {
  onAddCluster?: () => void
  onEditCluster?: (id: string) => void
}

export function K8sSidebar({ onAddCluster, onEditCluster }: SidebarProps) {
  const clusters = useClusterStore(s => s.clusters)
  const loading = useClusterStore(s => s.loading)
  const connections = useClusterStore(s => s.connections)
  const removeCluster = useClusterStore(s => s.removeCluster)
  const connectCluster = useClusterStore(s => s.connectCluster)
  const disconnectCluster = useClusterStore(s => s.disconnectCluster)
  const fetchNamespaces = useClusterStore(s => s.fetchNamespaces)
  const getLastNamespace = useClusterStore(s => s.getLastNamespace)
  const toggleSidebarCluster = useKubernetesStore(s => s.toggleSidebarCluster)
  const expandSidebarCluster = useKubernetesStore(s => s.expandSidebarCluster)
  const expandedClusters = useKubernetesStore(s => s.sidebarExpandedClusters)
  const openTab = useKubernetesStore(s => s.openTab)
  const activeTab = useKubernetesStore(s => s.getActiveTab())
  const showCtxMenu = useContextMenuStore(s => s.show)

  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(['workloads', 'config', 'network', 'storage'])
  )

  useEffect(() => {
    if (activeTab) {
      expandSidebarCluster(activeTab.clusterId)
    }
  }, [activeTab, expandSidebarCluster])

  const toggleGroup = (id: string) => {
    setExpandedGroups(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleLeafClick = (clusterId: string, kind: K8sResourceKind) => {
    const def = getResourceDef(kind)
    const conn = connections[clusterId]
    const defaultNs = conn?.namespaces[0]?.name ?? 'default'
    const lastNs = getLastNamespace(clusterId) || defaultNs
    const targetNs = def.namespaced ? lastNs : ''
    openTab(clusterId, targetNs, kind, { isPreview: true })
  }

  const handleLeafDoubleClick = (clusterId: string, kind: K8sResourceKind) => {
    const def = getResourceDef(kind)
    const conn = connections[clusterId]
    const defaultNs = conn?.namespaces[0]?.name ?? 'default'
    const lastNs = getLastNamespace(clusterId) || defaultNs
    const targetNs = def.namespaced ? lastNs : ''
    openTab(clusterId, targetNs, kind, { isPreview: false })
  }

  const groupedClusters = {
    local: clusters.filter(c => !c.source || c.source === 'local'),
    teleport: clusters.filter(c => c.source === 'teleport'),
    custom: clusters.filter(c => c.source === 'custom')
  }

  const renderTreeNode = (node: SidebarNode, clusterId: string, depth = 0) => {
    const conn = connections[clusterId]
    const isConnected = conn?.connected ?? false
    if (node.type === 'leaf') {
      const isActive = activeTab?.clusterId === clusterId && activeTab?.kind === node.kind
      const Icon = node.icon ?? Box
      return (
        <div
          key={node.id}
          className="flex items-center gap-1 cursor-pointer text-xs rounded mx-1 pl-[22px] pr-2 py-[2px]"
          style={{
            background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
            color: isActive ? '#fff' : isConnected ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
            paddingLeft: `${depth * 8 + 22}px`,
            pointerEvents: isConnected ? 'auto' : 'none',
            opacity: isConnected ? 1 : 0.45
          }}
          onClick={() => handleLeafClick(clusterId, node.kind)}
          onDoubleClick={() => handleLeafDoubleClick(clusterId, node.kind)}
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
        {isExpanded && node.children.map(child => renderTreeNode(child, clusterId, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full text-xs overflow-y-auto">
      {/* Hotbar */}
      {favorites.size > 0 && (
        <div className="px-2 pt-2 pb-1">
          <div className="text-[10px] font-semibold tracking-wider text-[var(--vos-text-tertiary)] mb-1">HOTBAR</div>
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
                        : 'var(--vos-bg-item-hover)'
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
            onClick={onAddCluster}
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
                      borderLeft: isActive ? '3px solid var(--vos-accent-primary)' : '3px solid transparent'
                    }}
                    onContextMenu={e => {
                      e.preventDefault()
                      const isFav = favorites.has(cluster.id)
                      const isConn = conn?.connected
                      showCtxMenu(e.clientX, e.clientY, [
                        {
                          id: 'connect',
                          label: isConn ? '断开连接' : conn?.connecting ? '连接中…' : '连接',
                          disabled: conn?.connecting,
                          action: () => (isConn ? disconnectCluster(cluster.id) : connectCluster(cluster.id))
                        },
                        { type: 'separator' },
                        {
                          id: 'edit',
                          label: '编辑',
                          action: () => onEditCluster?.(cluster.id)
                        },
                        {
                          id: 'favorite',
                          label: isFav ? '从 Hotbar 移除' : '添加到 Hotbar',
                          action: () =>
                            setFavorites(s => {
                              const n = new Set(s)
                              if (n.has(cluster.id)) n.delete(cluster.id)
                              else n.add(cluster.id)
                              return n
                            })
                        },
                        ...(isConn
                          ? [
                              {
                                id: 'refresh' as const,
                                label: '刷新命名空间',
                                action: () => fetchNamespaces(cluster.id)
                              }
                            ]
                          : []),
                        { type: 'separator' as const },
                        {
                          id: 'remove',
                          label: '删除',
                          danger: true,
                          action: () => removeCluster(cluster.id)
                        }
                      ])
                    }}
                  >
                    <button
                      type="button"
                      className="bg-transparent border-none p-0 cursor-pointer"
                      onClick={() => {
                        toggleSidebarCluster(cluster.id)
                        if (!isExpanded && !conn?.connected && !conn?.connecting) {
                          connectCluster(cluster.id)
                        }
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown size={10} className="text-[var(--vos-text-tertiary)]" />
                      ) : (
                        <ChevronRight size={10} className="text-[var(--vos-text-tertiary)]" />
                      )}
                    </button>
                    <span
                      className="w-2 h-2 rounded-full shrink-0 transition-colors"
                      style={{
                        background: conn?.connecting
                          ? 'var(--vos-accent-warning, #f59e0b)'
                          : conn?.connected
                            ? 'var(--vos-accent-success)'
                            : conn?.namespaceError
                              ? 'var(--vos-accent-danger)'
                              : 'var(--vos-text-tertiary)'
                      }}
                    />
                    <span
                      className="flex-1 truncate font-medium select-none"
                      style={{
                        color: isActive ? 'var(--vos-accent-primary)' : 'var(--vos-text-primary)'
                      }}
                      onClick={() => handleLeafClick(cluster.id, 'overview')}
                      onDoubleClick={() => {
                        if (!conn?.connected) {
                          connectCluster(cluster.id)
                        } else {
                          handleLeafDoubleClick(cluster.id, 'overview')
                        }
                      }}
                      title={conn?.connected ? cluster.name : '双击以连接'}
                    >
                      {cluster.name}
                    </span>
                    {(nsLoading || conn?.connecting) && <Spinner size={10} />}
                  </div>

                  {/* Expanded cluster resources */}
                  {isExpanded && (
                    <div className="pb-1">
                      {conn?.namespaceError && (
                        <div className="pl-6 pr-2 py-1">
                          <div className="text-[10px] text-[var(--vos-accent-danger)]">{conn.namespaceError}</div>
                          <button
                            type="button"
                            className="text-[10px] bg-transparent border-none cursor-pointer p-0 text-[var(--vos-accent-primary)]"
                            onClick={() => fetchNamespaces(cluster.id)}
                          >
                            重试
                          </button>
                        </div>
                      )}
                      {!conn?.connected && !conn?.namespaceError && (
                        <div className="flex items-center justify-center py-3 gap-1">
                          <Spinner size={12} />
                          <span className="text-[10px] text-[var(--vos-text-tertiary)]">连接中...</span>
                        </div>
                      )}
                      {conn?.connected && SIDEBAR_TREE.map(node => renderTreeNode(node, cluster.id))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {clusters.length === 0 && !loading && (
        <div className="px-3 py-2 text-[var(--vos-text-tertiary)]">无集群，点击 + 添加</div>
      )}
    </div>
  )
}
