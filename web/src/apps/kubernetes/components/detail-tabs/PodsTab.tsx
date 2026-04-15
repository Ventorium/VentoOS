import { useEffect, useState } from 'react'
import { Spinner } from '@/components'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import { k8sApi } from '../../api'
import type { K8sResource } from '../../types'

interface Props {
  resource: K8sResource
}

export function PodsTab({ resource }: Props) {
  const [pods, setPods] = useState<K8sResource[]>([])
  const [loading, setLoading] = useState(false)
  const activeTab = useKubernetesStore(s => s.getActiveTab())

  useEffect(() => {
    if (!activeTab) return
    setLoading(true)

    const isNode = resource.kind.toLowerCase() === 'node'
    const raw = resource.raw as Record<string, unknown> | undefined
    const spec = (raw?.spec as Record<string, unknown> | undefined) ?? {}
    const selector = (spec.selector as Record<string, unknown> | undefined) ?? {}
    const matchLabels = (selector.matchLabels as Record<string, string> | undefined) ?? {}

    const namespace = isNode ? undefined : resource.namespace

    let labelSelector: string | undefined
    if (!isNode && Object.keys(matchLabels).length > 0) {
      labelSelector = Object.entries(matchLabels).map(([k, v]) => `${k}=${v}`).join(',')
    }

    k8sApi
      .getK8sResources(activeTab.clusterId, 'pod', namespace, labelSelector)
      .then(r => {
        let list = (r.data as K8sResource[]) ?? []
        if (isNode) {
          list = list.filter(p => {
            const podRaw = p.raw as Record<string, unknown> | undefined
            return (podRaw?.spec as Record<string, string> | undefined)?.nodeName === resource.name
          })
        }
        setPods(list)
      })
      .catch(() => setPods([]))
      .finally(() => setLoading(false))
  }, [resource, activeTab])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={20} />
      </div>
    )
  }

  if (pods.length === 0) {
    return (
      <div className="text-xs text-[var(--vos-text-tertiary)] py-8 text-center">
        No pods found
      </div>
    )
  }

  return (
    <div className="overflow-auto text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-[var(--vos-bg-surface)] border-b-[0.5px] border-b-[var(--vos-border-subtle)]">
            <th className="px-2 py-1.5 text-left font-medium text-[var(--vos-text-tertiary)]">Name</th>
            <th className="px-2 py-1.5 text-left font-medium text-[var(--vos-text-tertiary)]">Namespace</th>
            <th className="px-2 py-1.5 text-left font-medium text-[var(--vos-text-tertiary)]">Status</th>
            <th className="px-2 py-1.5 text-left font-medium text-[var(--vos-text-tertiary)]">Age</th>
          </tr>
        </thead>
        <tbody>
          {pods.map(p => (
            <tr key={p.name} className="border-b-[0.5px] border-b-[var(--vos-border-subtle)] hover:bg-[var(--vos-bg-item-hover)]">
              <td className="px-2 py-1.5 font-mono text-[var(--vos-accent-primary)]">{p.name}</td>
              <td className="px-2 py-1.5 text-[var(--vos-text-secondary)]">{p.namespace ?? '—'}</td>
              <td className="px-2 py-1.5">{p.status ?? '—'}</td>
              <td className="px-2 py-1.5 text-[var(--vos-text-tertiary)]">{p.age ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
