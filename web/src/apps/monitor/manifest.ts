import { Activity } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function MonitorIcon() {
  return React.createElement(
    'div',
    {
      className: 'dock-icon-monitor',
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      },
    },
    React.createElement(Activity, { size: 22 }),
  )
}

export const monitorManifest: AppManifest = {
  id: 'monitor',
  name: '监控面板',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '系统资源监控',
  icon: React.createElement(MonitorIcon),
  multiWindow: false,
  defaultSize: { width: 900, height: 650 },
  minSize: { width: 700, height: 500 },
  permissions: ['storage'],
  component: () => import('./index'),
}
