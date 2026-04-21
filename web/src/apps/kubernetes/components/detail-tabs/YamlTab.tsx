import { useEffect, useState } from 'react'
import { Spinner } from '@/components'
import { k8sApi } from '../../api'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sResource } from '../../types'

interface Props {
  resource: K8sResource
}

export function YamlTab({ resource }: Props) {
  const [yaml, setYaml] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const activeTab = useKubernetesStore(s => s.getActiveTab())

  useEffect(() => {
    if (!activeTab) return
    setLoading(true)
    k8sApi
      .getK8sResourceYaml(activeTab.clusterId, resource.kind, resource.name, resource.namespace)
      .then(r => setYaml(typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2)))
      .catch(() => setYaml('# Failed to load YAML'))
      .finally(() => setLoading(false))
  }, [resource, activeTab])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={20} />
      </div>
    )
  }

  return (
    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-[var(--vos-text-primary)]">{yaml}</pre>
  )
}
