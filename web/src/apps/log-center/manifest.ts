import { ScrollText } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function LogCenterIcon() {
  return React.createElement(
    'div',
    {
      className: 'dock-icon-log-center',
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      },
    },
    React.createElement(ScrollText, { size: 22 }),
  )
}

export const logCenterManifest: AppManifest = {
  id: 'log-center',
  name: '日志中心',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '查看系统和应用日志',
  icon: React.createElement(LogCenterIcon),
  multiWindow: false,
  hidden: true,
  defaultSize: { width: 900, height: 600 },
  minSize: { width: 600, height: 400 },
  permissions: [],
  component: () => import('./index'),
}
