import { Box } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function KubernetesIcon() {
  return React.createElement(
    'div',
    {
      className: 'dock-icon-kubernetes',
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
  multiWindow: true,
  defaultSize: { width: 1100, height: 720 },
  minSize: { width: 800, height: 480 },
  permissions: ['network', 'connections', 'notifications', 'shell'],
  hasBackendPlugin: true,
  component: () => import('./index')
}
