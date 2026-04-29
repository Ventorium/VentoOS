import { Box } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function KubernetesIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #326ce5 0%, #1d4ed8 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Box, { size: 22 })
  )
}

export const kubernetesManifest: AppManifest = {
  id: 'kubernetes',
  name: 'Kubernetes',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: 'Manage Kubernetes clusters, workloads, and resources',
  icon: React.createElement(KubernetesIcon),
  multiWindow: false,
  defaultSize: { width: 1100, height: 720 },
  minSize: { width: 800, height: 480 },
  permissions: ['network', 'connections', 'notifications', 'shell', 'ipc'],
  hasBackendPlugin: true,
  dependencies: ['tsh'],
  emits: [
    { topic: 'open:postgres', description: 'Open PostgreSQL database from K8s service' },
    { topic: 'open:mysql', description: 'Open MySQL database from K8s service' },
    { topic: 'open:redis', description: 'Open Redis from K8s service' },
    { topic: 'open:terminal', description: 'Open terminal to K8s pod/node' },
    { topic: 'open:explorer', description: 'Open file explorer for K8s resource' },
    { topic: 'navigate:resource', description: 'Navigate to a K8s resource' },
  ],
  handles: [
    { topic: 'navigate:resource', autoOpen: true, priority: 0 },
  ],
  component: () => import('./index')
}
