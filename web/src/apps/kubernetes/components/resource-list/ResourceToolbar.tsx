import { RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { FormSelect } from '@/components/ui'
import { useClusterStore } from '../../stores/cluster-store'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sResourceKind } from '../../types'
import { getResourceDef } from '../../utils/resource-registry'

interface Props {
  clusterId: string
  namespace: string
  kind: K8sResourceKind
  search: string
  onSearchChange: (v: string) => void
  onRefresh: () => void
  selectedCount: number
  onDeleteSelected?: () => void
}

export function ResourceToolbar({
  clusterId,
  namespace,
  kind,
  search,
  onSearchChange,
  onRefresh,
  selectedCount,
  onDeleteSelected
}: Props) {
  const namespaces = useClusterStore(s => s.getClusterNamespaces(clusterId))
  const setLastNamespace = useClusterStore(s => s.setLastNamespace)
  const openTab = useKubernetesStore(s => s.openTab)
  const def = getResourceDef(kind)

  return (
    <div className="flex flex-col flex-shrink-0">
      <div className="flex items-center gap-2 h-[38px] px-3 border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
        {/* Namespace selector */}
        {def.namespaced && (
          <FormSelect
            variant="toolbar"
            className="text-xs"
            wrapperClassName="w-[180px] shrink-0"
            value={namespace}
            onChange={e => {
              const ns = e.target.value
              setLastNamespace(clusterId, ns)
              openTab(clusterId, ns, kind)
            }}
          >
            {namespaces.map(ns => (
              <option key={ns.name} value={ns.name}>
                {ns.name}
              </option>
            ))}
          </FormSelect>
        )}

        <span className="text-xs text-[var(--vos-text-tertiary)]">{def.pluralLabel}</span>

        <span className="flex-1" />

        {/* Search */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--vos-bg-input)] border-[0.5px] border-[var(--vos-border-subtle)]">
          <Search size={12} className="text-[var(--vos-text-tertiary)]" />
          <input
            type="text"
            className="bg-transparent border-none outline-none text-xs w-[180px] text-[var(--vos-text-primary)]"
            placeholder={`Search ${def.pluralLabel}...`}
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="p-1 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-tertiary)]"
          onClick={onRefresh}
          title="刷新"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 h-8 px-3 bg-[rgba(var(--vos-accent-warning-rgb,204,169,0),0.12)] text-xs">
          <span className="flex-1">{selectedCount} items selected</span>
          <button
            type="button"
            className="px-2 py-0.5 rounded text-[10px] bg-[var(--vos-accent-danger)] text-white"
            onClick={onDeleteSelected}
          >
            Delete selected
          </button>
        </div>
      )}
    </div>
  )
}
