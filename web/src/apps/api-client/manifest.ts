import { Send } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function ApiClientIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
        borderRadius: '22%',
        color: '#fff',
      },
    },
    React.createElement(Send, { size: 22 }),
  )
}

export const apiClientManifest: AppManifest = {
  id: 'api-client',
  name: 'API Client',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: 'HTTP API testing and debugging workbench',
  icon: React.createElement(ApiClientIcon),
  multiWindow: false,
  defaultSize: { width: 1200, height: 800 },
  minSize: { width: 900, height: 600 },
  permissions: ['network', 'storage'],
  hasBackendPlugin: true,
  component: () => import('./index'),
}
