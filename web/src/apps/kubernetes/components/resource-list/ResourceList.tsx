import { useMemo, useState } from 'react'
import { Spinner } from '@/components'
import { useResourceList } from '../../hooks/useResourceList'
import type { K8sResourceKind } from '../../types'
import { ResourceTable } from './ResourceTable'
import { ResourceToolbar } from './ResourceToolbar'

interface Props {
  clusterId: string
  namespace: string
  kind: K8sResourceKind
}

export function ResourceList({ clusterId, namespace, kind }: Props) {
  const { resources, loading, refetch } = useResourceList(clusterId, namespace, kind)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!search.trim()) return resources
    const term = search.toLowerCase()
    return resources.filter(r => r.name.toLowerCase().includes(term))
  }, [resources, search])

  return (
    <div className="flex flex-col h-full">
      <ResourceToolbar
        clusterId={clusterId}
        namespace={namespace}
        kind={kind}
        search={search}
        onSearchChange={setSearch}
        onRefresh={refetch}
        selectedCount={selected.size}
        onDeleteSelected={() => {
          // TODO: batch delete
        }}
      />
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <ResourceTable resources={filtered} kind={kind} selected={selected} onSelectChange={setSelected} />
      )}
    </div>
  )
}
