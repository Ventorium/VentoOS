import { useCallback, useMemo, useState } from 'react'
import { toast } from '@/components/Toast'
import { Spinner } from '@/components'
import { k8sApi } from '../../api'
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

  const handleDeleteSelected = useCallback(async () => {
    const targets = resources.filter(resource => selected.has(resource.name))
    if (targets.length === 0) {
      return
    }

    const confirmed = window.confirm(`确认删除这 ${targets.length} 个 ${kind} 资源吗？此操作不可撤销。`)
    if (!confirmed) {
      return
    }

    const results = await Promise.allSettled(
      targets.map(resource =>
        k8sApi.deleteK8sResource(clusterId, kind, resource.name, resource.namespace ?? (namespace || undefined))
      )
    )

    const failed = results.filter(result => result.status === 'rejected')
    const succeededCount = results.length - failed.length

    if (succeededCount > 0) {
      toast.success(`已删除 ${succeededCount} 个${kind}资源`)
      setSelected(new Set())
      await refetch()
    }

    if (failed.length > 0) {
      toast.error(`有 ${failed.length} 个资源删除失败`)
    }
  }, [clusterId, kind, namespace, refetch, resources, selected])

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
        onDeleteSelected={handleDeleteSelected}
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
