import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sResource } from '../../types'
import { K8sLogStream } from '../bottom-panel/K8sLogStream'

interface Props {
  resource: K8sResource
}

export function LogsTab({ resource }: Props) {
  const activeTab = useKubernetesStore(s => s.getActiveTab())

  if (!activeTab || !resource.namespace) {
    return (
      <div className="text-xs text-[var(--vos-text-tertiary)] py-8 text-center">
        No context available
      </div>
    )
  }

  return (
    <div className="h-full rounded border-[0.5px] border-[var(--vos-border-subtle)] overflow-hidden">
      <K8sLogStream
        clusterId={activeTab.clusterId}
        namespace={resource.namespace}
        podName={resource.name}
      />
    </div>
  )
}
