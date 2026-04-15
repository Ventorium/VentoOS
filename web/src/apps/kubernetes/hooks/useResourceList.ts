import { useCallback, useEffect, useState } from 'react'
import { k8sApi } from '../api'
import type { K8sResource, K8sResourceKind } from '../types'

export function useResourceList(clusterId: string | null, namespace: string, kind: K8sResourceKind) {
  const [resources, setResources] = useState<K8sResource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!clusterId) {
      setResources([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await k8sApi.getK8sResources(clusterId, kind, namespace || undefined)
      setResources(res.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载资源失败')
      setResources([])
    } finally {
      setLoading(false)
    }
  }, [clusterId, namespace, kind])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { resources, loading, error, refetch: fetch }
}
