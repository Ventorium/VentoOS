/**
 * Kubernetes App — Resource Type Registry
 *
 * Central registry mapping each K8sResourceKind to its UI metadata.
 */

import {
  Box,
  Boxes,
  Briefcase,
  Calendar,
  Clock,
  Database,
  FileCode,
  FileKey,
  FileText,
  Globe,
  HardDrive,
  Home,
  Layers,
  type LucideIcon,
  Network,
  Package,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Users
} from 'lucide-react'
import { getColumnsForKind } from '../components/resource-list/table-columns'
import type { K8sResource, K8sResourceKind, ResourceColumn, ResourceTypeDef } from '../types'

const kindToIcon: Record<string, LucideIcon> = {
  overview: Home,
  application: Smartphone,
  workloads_overview: Settings,
  portforward: Shuffle,
  pod: Box,
  deployment: Boxes,
  service: Network,
  configmap: FileText,
  secret: FileKey,
  ingress: Globe,
  statefulset: Database,
  daemonset: Server,
  job: Briefcase,
  cronjob: Calendar,
  replicaset: Layers,
  persistentvolumeclaim: HardDrive,
  persistentvolume: HardDrive,
  storageclass: HardDrive,
  namespace: Layers,
  serviceaccount: Users,
  networkpolicy: Shield,
  node: Server,
  role: ShieldCheck,
  clusterrole: ShieldCheck,
  rolebinding: ShieldCheck,
  clusterrolebinding: ShieldCheck,
  resourcequota: ScrollText,
  limitrange: ScrollText,
  horizontalpodautoscaler: ScrollText,
  poddisruptionbudget: ScrollText,
  priorityclass: ScrollText,
  runtimeclass: ScrollText,
  lease: ScrollText,
  mutatingwebhookconfiguration: ScrollText,
  validatingwebhookconfiguration: ScrollText,
  endpoints: Network,
  endpointslice: Network,
  ingressclass: Globe,
  event: Clock,
  helmrelease: Package,
  customresource: FileCode
}

function getIcon(kind: K8sResourceKind): LucideIcon {
  return kindToIcon[kind] ?? Box
}

function getLabel(kind: K8sResourceKind): string {
  const map: Record<string, string> = {
    overview: 'Overview',
    application: 'Application',
    workloads_overview: 'Workloads',
    portforward: 'Port Forwarding',
    pod: 'Pod',
    deployment: 'Deployment',
    service: 'Service',
    configmap: 'ConfigMap',
    secret: 'Secret',
    ingress: 'Ingress',
    statefulset: 'StatefulSet',
    daemonset: 'DaemonSet',
    job: 'Job',
    cronjob: 'CronJob',
    replicaset: 'ReplicaSet',
    persistentvolumeclaim: 'PVC',
    persistentvolume: 'PV',
    storageclass: 'StorageClass',
    namespace: 'Namespace',
    serviceaccount: 'ServiceAccount',
    networkpolicy: 'NetworkPolicy',
    node: 'Node',
    role: 'Role',
    clusterrole: 'ClusterRole',
    rolebinding: 'RoleBinding',
    clusterrolebinding: 'ClusterRoleBinding',
    resourcequota: 'ResourceQuota',
    limitrange: 'LimitRange',
    horizontalpodautoscaler: 'HPA',
    poddisruptionbudget: 'PDB',
    priorityclass: 'PriorityClass',
    runtimeclass: 'RuntimeClass',
    lease: 'Lease',
    mutatingwebhookconfiguration: 'MutatingWebhook',
    validatingwebhookconfiguration: 'ValidatingWebhook',
    endpoints: 'Endpoints',
    endpointslice: 'EndpointSlice',
    ingressclass: 'IngressClass',
    event: 'Event',
    helmrelease: 'Release',
    customresource: 'Custom Resource'
  }
  return map[kind] ?? kind
}

function getPluralLabel(kind: K8sResourceKind): string {
  const special: Record<string, string> = {
    overview: 'Overview',
    application: 'Applications',
    workloads_overview: 'Workloads',
    portforward: 'Port Forwarding',
    persistentvolumeclaim: 'PVCs',
    persistentvolume: 'PVs',
    horizontalpodautoscaler: 'HPAs',
    poddisruptionbudget: 'PDBs',
    event: 'Events',
    helmrelease: 'Releases',
    customresource: 'Custom Resources'
  }
  if (special[kind]) return special[kind]
  const label = getLabel(kind)
  if (label.endsWith('s') || label.endsWith('x') || label.endsWith('ch')) return `${label}es`
  return `${label}s`
}

function getDetailTabs(kind: K8sResourceKind): string[] {
  const common = ['summary', 'yaml', 'events']
  switch (kind) {
    case 'application':
    case 'workloads_overview':
    case 'portforward':
      return []
    case 'pod':
      return ['summary', 'logs', 'shell', 'yaml', 'events']
    case 'deployment':
    case 'statefulset':
    case 'daemonset':
    case 'replicaset':
    case 'job':
      return ['summary', 'pods', 'yaml', 'events']
    case 'service':
      return ['summary', 'endpoints', 'yaml', 'events']
    case 'node':
      return ['summary', 'pods', 'yaml', 'events']
    case 'secret':
      return ['summary', 'data', 'yaml', 'events']
    case 'configmap':
      return ['summary', 'data', 'yaml', 'events']
    default:
      return common
  }
}

function isNamespaced(kind: K8sResourceKind): boolean {
  const clusterScoped: K8sResourceKind[] = [
    'overview',
    'application',
    'workloads_overview',
    'portforward',
    'node',
    'persistentvolume',
    'storageclass',
    'namespace',
    'clusterrole',
    'clusterrolebinding',
    'event',
    'customresource',
    'helmrelease'
  ]
  return !clusterScoped.includes(kind)
}

function getCategory(kind: K8sResourceKind): ResourceTypeDef['category'] {
  switch (kind) {
    case 'overview':
    case 'application':
    case 'workloads_overview':
    case 'portforward':
      return 'cluster'
    case 'pod':
    case 'deployment':
    case 'statefulset':
    case 'daemonset':
    case 'job':
    case 'cronjob':
    case 'replicaset':
      return 'workloads'
    case 'configmap':
    case 'secret':
    case 'resourcequota':
    case 'limitrange':
    case 'horizontalpodautoscaler':
    case 'poddisruptionbudget':
    case 'priorityclass':
    case 'runtimeclass':
    case 'lease':
    case 'mutatingwebhookconfiguration':
    case 'validatingwebhookconfiguration':
      return 'config'
    case 'service':
    case 'ingress':
    case 'networkpolicy':
    case 'endpoints':
    case 'endpointslice':
    case 'ingressclass':
      return 'network'
    case 'persistentvolumeclaim':
    case 'persistentvolume':
    case 'storageclass':
      return 'storage'
    case 'serviceaccount':
    case 'role':
    case 'clusterrole':
    case 'rolebinding':
    case 'clusterrolebinding':
      return 'access'
    case 'helmrelease':
      return 'helm'
    case 'customresource':
    case 'namespace':
    case 'event':
    case 'node':
    default:
      return 'custom'
  }
}

export function getResourceColumns(kind: K8sResourceKind, onNameClick?: (r: K8sResource) => void): ResourceColumn[] {
  return getColumnsForKind(kind, onNameClick)
}

function buildRegistry(): Record<K8sResourceKind, ResourceTypeDef> {
  const kinds: K8sResourceKind[] = [
    'overview',
    'application',
    'workloads_overview',
    'portforward',
    'pod',
    'deployment',
    'service',
    'configmap',
    'secret',
    'ingress',
    'statefulset',
    'daemonset',
    'job',
    'cronjob',
    'replicaset',
    'persistentvolumeclaim',
    'persistentvolume',
    'storageclass',
    'namespace',
    'serviceaccount',
    'networkpolicy',
    'node',
    'role',
    'clusterrole',
    'rolebinding',
    'clusterrolebinding',
    'resourcequota',
    'limitrange',
    'horizontalpodautoscaler',
    'poddisruptionbudget',
    'priorityclass',
    'runtimeclass',
    'lease',
    'mutatingwebhookconfiguration',
    'validatingwebhookconfiguration',
    'endpoints',
    'endpointslice',
    'ingressclass',
    'event',
    'helmrelease',
    'customresource'
  ]

  const registry = {} as Record<K8sResourceKind, ResourceTypeDef>
  for (const kind of kinds) {
    registry[kind] = {
      kind,
      label: getLabel(kind),
      pluralLabel: getPluralLabel(kind),
      icon: getIcon(kind),
      category: getCategory(kind),
      namespaced: isNamespaced(kind),
      detailTabs: getDetailTabs(kind),
      columns: getColumnsForKind(kind)
    }
  }
  return registry
}

export const resourceRegistry = buildRegistry()

export function getResourceDef(kind: K8sResourceKind): ResourceTypeDef {
  return resourceRegistry[kind] ?? resourceRegistry.pod
}
