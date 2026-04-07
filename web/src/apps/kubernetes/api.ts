/**
 * Kubernetes App — API client & types
 */

import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api'

// ── Types ──────────────────────────────────────────────────────────────────

export interface K8sCluster {
  id: string
  name: string
  context_name: string
  kubeconfig_path?: string
  kubeconfig_inline?: string
  server_url?: string
  namespace?: string
  group?: string
}

export interface CreateK8sClusterReq {
  name: string
  kubeconfig_path?: string
  kubeconfig_inline?: string
  context_name?: string
  default_namespace?: string
  group?: string
}

export interface K8sNamespace {
  name: string
  status: string
}

export type K8sResourceKind =
  | 'pod'
  | 'deployment'
  | 'service'
  | 'configmap'
  | 'secret'
  | 'ingress'
  | 'statefulset'
  | 'daemonset'
  | 'job'
  | 'cronjob'
  | 'replicaset'
  | 'persistentvolumeclaim'
  | 'persistentvolume'
  | 'storageclass'
  | 'namespace'
  | 'serviceaccount'
  | 'networkpolicy'
  | 'node'

export interface K8sResource {
  name: string
  namespace?: string
  kind: string
  status?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  raw?: unknown
}

export interface K8sTestResult {
  success: boolean
  message: string
  server_version?: string
}

export interface KubeconfigContext {
  name: string
  cluster: string
  user: string
  namespace?: string
}

// ── API ─────────────────────────────────────────────────────────────────────

export const k8sApi = {
  getK8sClusters: () => request<ApiResponse<K8sCluster[]>>('GET', '/api/k8s/clusters'),
  createK8sCluster: (body: CreateK8sClusterReq) => request<ApiResponse<K8sCluster>>('POST', '/api/k8s/clusters', body),
  getK8sCluster: (id: string) => request<ApiResponse<K8sCluster>>('GET', `/api/k8s/clusters/${id}`),
  deleteK8sCluster: (id: string) => request<ApiResponse<null>>('DELETE', `/api/k8s/clusters/${id}`),
  testK8sCluster: (id: string) => request<ApiResponse<K8sTestResult>>('POST', `/api/k8s/clusters/${id}/test`),
  getK8sNamespaces: (id: string) => request<ApiResponse<K8sNamespace[]>>('GET', `/api/k8s/clusters/${id}/namespaces`),
  getK8sResources: (id: string, kind: K8sResourceKind, namespace?: string) => {
    const params = new URLSearchParams({ kind })
    if (namespace) params.set('namespace', namespace)
    return request<ApiResponse<K8sResource[]>>('GET', `/api/k8s/clusters/${id}/resources?${params}`)
  },
  parseKubeconfig: (body: { path?: string; content?: string }) =>
    request<ApiResponse<KubeconfigContext[]>>('POST', '/api/k8s/kubeconfig/parse', body)
}
