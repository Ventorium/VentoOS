/**
 * Kubernetes App — Shared Types
 */

import type { LucideIcon } from 'lucide-react'

export type K8sClusterSource = 'local' | 'teleport' | 'custom'

export interface K8sCluster {
  id: string
  name: string
  context_name: string
  kubeconfig_path?: string
  kubeconfig_inline?: string
  server_url?: string
  namespace?: string
  group?: string
  source?: K8sClusterSource
  status?: 'connected' | 'connecting' | 'error' | 'disconnected'
}

export interface K8sNamespace {
  name: string
  status: string
}

export type K8sResourceKind =
  | 'overview'
  | 'application'
  | 'workloads_overview'
  | 'portforward'
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
  | 'role'
  | 'clusterrole'
  | 'rolebinding'
  | 'clusterrolebinding'
  | 'resourcequota'
  | 'limitrange'
  | 'horizontalpodautoscaler'
  | 'poddisruptionbudget'
  | 'priorityclass'
  | 'runtimeclass'
  | 'lease'
  | 'mutatingwebhookconfiguration'
  | 'validatingwebhookconfiguration'
  | 'endpoints'
  | 'endpointslice'
  | 'ingressclass'
  | 'event'
  | 'helmrelease'
  | 'customresource'

export interface K8sResource {
  name: string
  namespace?: string
  kind: K8sResourceKind
  status?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  raw?: unknown
}

export interface K8sTab {
  id: string
  clusterId: string
  namespace: string
  kind: K8sResourceKind
  title: string
  isPreview?: boolean
}

export interface BottomPanelTab {
  id: string
  type: 'yaml' | 'logs' | 'shell' | 'apply'
  title: string
  clusterId: string
  namespace?: string
  kind?: K8sResourceKind
  name?: string
  container?: string
}

export interface ResourceAction {
  id: string
  label: string
  icon?: LucideIcon
  danger?: boolean
  action: (resource: K8sResource, clusterId: string) => void
}

export interface ResourceColumn {
  key: string
  header: string
  width?: number | string
  render: (resource: K8sResource) => React.ReactNode
}

export interface ResourceTypeDef {
  kind: K8sResourceKind
  label: string
  pluralLabel: string
  icon: LucideIcon
  category: 'cluster' | 'workloads' | 'config' | 'network' | 'storage' | 'access' | 'custom' | 'helm'
  namespaced: boolean
  detailTabs: string[]
  columns: ResourceColumn[]
}

export type SidebarNodeType = 'leaf' | 'group'

export interface SidebarLeafNode {
  type: 'leaf'
  id: string
  label: string
  icon?: LucideIcon
  kind: K8sResourceKind
}

export interface SidebarGroupNode {
  type: 'group'
  id: string
  label: string
  icon?: LucideIcon
  children: SidebarNode[]
}

export type SidebarNode = SidebarLeafNode | SidebarGroupNode
