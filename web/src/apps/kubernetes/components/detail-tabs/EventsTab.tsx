import { useEffect, useState } from 'react'
import { Spinner } from '@/components'
import { k8sApi } from '../../api'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sResource } from '../../types'

interface K8sEvent {
  type: string
  reason: string
  message: string
  count: number
  lastTimestamp: string
}

interface Props {
  resource: K8sResource
}

export function EventsTab({ resource }: Props) {
  const [events, setEvents] = useState<K8sEvent[]>([])
  const [loading, setLoading] = useState(false)
  const activeTab = useKubernetesStore(s => s.getActiveTab())

  useEffect(() => {
    if (!activeTab) return
    setLoading(true)
    k8sApi
      .getK8sResourceEvents(activeTab.clusterId, resource.kind, resource.name, resource.namespace)
      .then(r => setEvents((r.data as K8sEvent[]) ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [resource, activeTab])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={20} />
      </div>
    )
  }

  if (events.length === 0) {
    return <div className="text-xs text-[var(--vos-text-tertiary)] py-8 text-center">No events found</div>
  }

  return (
    <div className="space-y-2">
      {events.map((ev, i) => (
        <div
          key={i}
          className="p-2 rounded border-[0.5px] border-[var(--vos-border-subtle)] bg-[var(--vos-bg-item-hover)]"
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] px-1 rounded"
              style={{
                background:
                  ev.type === 'Warning'
                    ? 'rgba(var(--vos-accent-warning-rgb, 204 169 0), 0.15)'
                    : 'rgba(var(--vos-accent-success-rgb, 34 197 94), 0.15)',
                color: ev.type === 'Warning' ? 'var(--vos-accent-warning)' : 'var(--vos-accent-success)'
              }}
            >
              {ev.type}
            </span>
            <span className="text-xs font-medium">{ev.reason}</span>
            <span className="text-[10px] text-[var(--vos-text-tertiary)] ml-auto">{ev.count}×</span>
          </div>
          <div className="text-[11px] text-[var(--vos-text-secondary)] mt-1">{ev.message}</div>
        </div>
      ))}
    </div>
  )
}
