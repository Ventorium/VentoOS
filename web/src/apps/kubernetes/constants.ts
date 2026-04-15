/**
 * Kubernetes App — Constants and Sidebar Tree Config
 */

import {
  Box,
  Clock,
  FileCode,
  HardDrive,
  Home,
  Layers,
  Network,
  Package,
  Server,
  Settings,
  Shield,
  Smartphone,
} from 'lucide-react'

import type { SidebarNode } from './types'

export const SIDEBAR_TREE: SidebarNode[] = [
  {
    type: 'leaf',
    id: 'overview',
    label: 'Overview',
    icon: Home,
    kind: 'overview',
  },
  {
    type: 'leaf',
    id: 'applications',
    label: 'Applications',
    icon: Smartphone,
    kind: 'application',
  },
  {
    type: 'leaf',
    id: 'nodes',
    label: 'Nodes',
    icon: Server,
    kind: 'node',
  },
  {
    type: 'group',
    id: 'workloads',
    label: 'Workloads',
    icon: Box,
    children: [
      { type: 'leaf', id: 'workloads-overview', label: 'Overview', kind: 'workloads_overview' },
      { type: 'leaf', id: 'pods', label: 'Pods', kind: 'pod' },
      { type: 'leaf', id: 'deployments', label: 'Deployments', kind: 'deployment' },
      { type: 'leaf', id: 'daemonsets', label: 'Daemon Sets', kind: 'daemonset' },
      { type: 'leaf', id: 'statefulsets', label: 'Stateful Sets', kind: 'statefulset' },
      { type: 'leaf', id: 'replicasets', label: 'Replica Sets', kind: 'replicaset' },
      { type: 'leaf', id: 'jobs', label: 'Jobs', kind: 'job' },
      { type: 'leaf', id: 'cronjobs', label: 'CronJobs', kind: 'cronjob' },
    ],
  },
  {
    type: 'group',
    id: 'config',
    label: 'Config',
    icon: Settings,
    children: [
      { type: 'leaf', id: 'configmaps', label: 'ConfigMaps', kind: 'configmap' },
      { type: 'leaf', id: 'secrets', label: 'Secrets', kind: 'secret' },
      { type: 'leaf', id: 'resourcequotas', label: 'Resource Quotas', kind: 'resourcequota' },
      { type: 'leaf', id: 'limitranges', label: 'Limit Ranges', kind: 'limitrange' },
      { type: 'leaf', id: 'hpa', label: 'Horizontal Pod Autoscalers', kind: 'horizontalpodautoscaler' },
      { type: 'leaf', id: 'pdb', label: 'Pod Disruption Budgets', kind: 'poddisruptionbudget' },
      { type: 'leaf', id: 'priorityclasses', label: 'Priority Classes', kind: 'priorityclass' },
      { type: 'leaf', id: 'runtimeclasses', label: 'Runtime Classes', kind: 'runtimeclass' },
      { type: 'leaf', id: 'leases', label: 'Leases', kind: 'lease' },
      { type: 'leaf', id: 'mutatingwebhooks', label: 'Mutating Webhook Configurations', kind: 'mutatingwebhookconfiguration' },
      { type: 'leaf', id: 'validatingwebhooks', label: 'Validating Webhook Configurations', kind: 'validatingwebhookconfiguration' },
    ],
  },
  {
    type: 'group',
    id: 'network',
    label: 'Network',
    icon: Network,
    children: [
      { type: 'leaf', id: 'services', label: 'Services', kind: 'service' },
      { type: 'leaf', id: 'endpointslices', label: 'Endpoint Slices', kind: 'endpointslice' },
      { type: 'leaf', id: 'endpoints', label: 'Endpoints', kind: 'endpoints' },
      { type: 'leaf', id: 'ingresses', label: 'Ingresses', kind: 'ingress' },
      { type: 'leaf', id: 'ingressclasses', label: 'Ingress Classes', kind: 'ingressclass' },
      { type: 'leaf', id: 'networkpolicies', label: 'Network Policies', kind: 'networkpolicy' },
      { type: 'leaf', id: 'portforwarding', label: 'Port Forwarding', kind: 'portforward' },
    ],
  },
  {
    type: 'group',
    id: 'storage',
    label: 'Storage',
    icon: HardDrive,
    children: [
      { type: 'leaf', id: 'pvcs', label: 'Persistent Volume Claims', kind: 'persistentvolumeclaim' },
      { type: 'leaf', id: 'pvs', label: 'Persistent Volumes', kind: 'persistentvolume' },
      { type: 'leaf', id: 'storageclasses', label: 'Storage Classes', kind: 'storageclass' },
    ],
  },
  {
    type: 'leaf',
    id: 'namespaces',
    label: 'Namespaces',
    icon: Layers,
    kind: 'namespace',
  },
  {
    type: 'leaf',
    id: 'events',
    label: 'Events',
    icon: Clock,
    kind: 'event',
  },
  {
    type: 'group',
    id: 'helm',
    label: 'Helm',
    icon: Package,
    children: [
      { type: 'leaf', id: 'releases', label: 'Releases', kind: 'helmrelease' },
    ],
  },
  {
    type: 'group',
    id: 'access',
    label: 'Access Control',
    icon: Shield,
    children: [
      { type: 'leaf', id: 'serviceaccounts', label: 'Service Accounts', kind: 'serviceaccount' },
      { type: 'leaf', id: 'clusterroles', label: 'Cluster Roles', kind: 'clusterrole' },
      { type: 'leaf', id: 'roles', label: 'Roles', kind: 'role' },
      { type: 'leaf', id: 'clusterrolebindings', label: 'Cluster Role Bindings', kind: 'clusterrolebinding' },
      { type: 'leaf', id: 'rolebindings', label: 'Role Bindings', kind: 'rolebinding' },
    ],
  },
  {
    type: 'group',
    id: 'custom',
    label: 'Custom Resources',
    icon: FileCode,
    children: [
      { type: 'leaf', id: 'crd', label: 'Definitions', kind: 'customresource' },
    ],
  },
]

export const DEFAULT_DRAWER_WIDTH = 0.45 // 45%
export const MIN_DRAWER_WIDTH = 480
export const MAX_DRAWER_WIDTH_PCT = 0.7
export const DEFAULT_BOTTOM_HEIGHT = 0.5 // 50%
export const MIN_BOTTOM_HEIGHT = 200
export const TAB_BAR_HEIGHT = 35
export const TOOLBAR_HEIGHT = 38
export const TABLE_ROW_HEIGHT = 32
