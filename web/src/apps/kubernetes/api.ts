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

// ── Teleport Types ─────────────────────────────────────────────────────────

export interface TeleportLoginReq {
  proxy: string
  user: string
  password: string
  otp?: string
}

export interface TeleportLoginResult {
  success: boolean
  message: string
  needs_otp: boolean
}

export interface TeleportKubeCluster {
  name: string
  labels: Record<string, string>
  selected: boolean
}

export interface TeleportKubeConfigResult {
  success: boolean
  message: string
  kubeconfig?: string
}

// ── API ─────────────────────────────────────────────────────────────────────

export const k8sApi = {
  getK8sClusters: () => request<ApiResponse<K8sCluster[]>>('GET', '/api/k8s/clusters'),
  createK8sCluster: (body: CreateK8sClusterReq) => request<ApiResponse<K8sCluster>>('POST', '/api/k8s/clusters', body),
  getK8sCluster: (id: string) => request<ApiResponse<K8sCluster>>('GET', `/api/k8s/clusters/${id}`),
  deleteK8sCluster: (id: string) => request<ApiResponse<null>>('DELETE', `/api/k8s/clusters/${id}`),
  testK8sCluster: (id: string) => request<ApiResponse<K8sTestResult>>('POST', `/api/k8s/clusters/${id}/test`),
  getK8sNamespaces: (id: string) => request<ApiResponse<K8sNamespace[]>>('GET', `/api/k8s/clusters/${id}/namespaces`),
  getK8sResources: (id: string, kind: K8sResourceKind, namespace?: string, labelSelector?: string) => {
    const params = new URLSearchParams({ kind })
    if (namespace) params.set('namespace', namespace)
    if (labelSelector) params.set('label_selector', labelSelector)
    return request<ApiResponse<K8sResource[]>>('GET', `/api/k8s/clusters/${id}/resources?${params}`)
  },
  getK8sResourceYaml: (id: string, kind: K8sResourceKind, name: string, namespace?: string) => {
    const params = new URLSearchParams()
    if (namespace) params.set('ns', namespace)
    return request<ApiResponse<string>>('GET', `/api/k8s/clusters/${id}/resources/${kind}/${name}/yaml?${params}`)
  },
  updateK8sResourceYaml: (id: string, kind: K8sResourceKind, name: string, namespace: string, yaml: string) => {
    const params = new URLSearchParams()
    if (namespace) params.set('ns', namespace)
    return request<ApiResponse<null>>('PUT', `/api/k8s/clusters/${id}/resources/${kind}/${name}/yaml?${params}`, yaml)
  },
  getK8sResourceEvents: (id: string, kind: K8sResourceKind, name: string, namespace?: string) => {
    const params = new URLSearchParams()
    if (namespace) params.set('ns', namespace)
    return request<ApiResponse<unknown[]>>('GET', `/api/k8s/clusters/${id}/resources/${kind}/${name}/events?${params}`)
  },
  scaleDeployment: (id: string, kind: K8sResourceKind, name: string, namespace: string, replicas: number) => {
    const params = new URLSearchParams()
    if (namespace) params.set('ns', namespace)
    return request<ApiResponse<unknown>>('POST', `/api/k8s/clusters/${id}/resources/${kind}/${name}/scale?${params}`, { replicas })
  },
  restartDeployment: (id: string, kind: K8sResourceKind, name: string, namespace: string) => {
    const params = new URLSearchParams()
    if (namespace) params.set('ns', namespace)
    return request<ApiResponse<unknown>>('POST', `/api/k8s/clusters/${id}/resources/${kind}/${name}/restart?${params}`)
  },
  cordonNode: (id: string, name: string, cordon: boolean) =>
    request<ApiResponse<unknown>>('POST', `/api/k8s/clusters/${id}/nodes/${name}/cordon`, { cordon }),
  drainNode: (id: string, name: string, force?: boolean, ignoreDaemonSets?: boolean) =>
    request<ApiResponse<unknown>>('POST', `/api/k8s/clusters/${id}/nodes/${name}/drain`, { force: force ?? false, ignore_daemonsets: ignoreDaemonSets ?? false }),
  parseKubeconfig: (body: { path?: string; content?: string }) =>
    request<ApiResponse<KubeconfigContext[]>>('POST', '/api/k8s/kubeconfig/parse', body),

  // ── Teleport ──────────────────────────────────────────────────────────────
  teleportCheck: () =>
    request<ApiResponse<{ available: boolean }>>('GET', '/api/k8s/teleport/check'),
  teleportProbe: (proxy: string) =>
    request<ApiResponse<{ reachable: boolean; needs_otp: boolean; second_factor: string; message: string }>>('GET', `/api/k8s/teleport/probe?proxy=${encodeURIComponent(proxy)}`),
  teleportLogin: (body: TeleportLoginReq) =>
    request<ApiResponse<TeleportLoginResult>>('POST', '/api/k8s/teleport/login', body),
  teleportListClusters: (proxy: string) =>
    request<ApiResponse<TeleportKubeCluster[]>>('GET', `/api/k8s/teleport/clusters?proxy=${encodeURIComponent(proxy)}`),
  teleportGetKubeconfig: (proxy: string, clusterName: string) =>
    request<ApiResponse<TeleportKubeConfigResult>>('POST', `/api/k8s/teleport/clusters/${encodeURIComponent(clusterName)}/kubeconfig?proxy=${encodeURIComponent(proxy)}`),
  teleportLogout: (proxy: string) =>
    request<ApiResponse<{ success: boolean }>>('POST', `/api/k8s/teleport/logout?proxy=${encodeURIComponent(proxy)}`),
}
