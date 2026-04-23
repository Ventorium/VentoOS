import { Crosshair } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function ProcessKillerIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Crosshair, { size: 22 })
  )
}

export const processKillerManifest: AppManifest = {
  id: 'process-killer',
  name: '进程查杀',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '根据 CPU/内存占用或端口占用查杀系统进程',
  icon: React.createElement(ProcessKillerIcon),
  multiWindow: false,
  defaultSize: { width: 900, height: 650 },
  minSize: { width: 700, height: 450 },
  permissions: ['shell', 'notifications'],
  component: () => import('./index')
}
