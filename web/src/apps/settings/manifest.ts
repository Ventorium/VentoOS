import { Settings } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function SettingsIcon() {
  return React.createElement(
    'div',
    {
      className: 'dock-icon-settings',
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      },
    },
    React.createElement(Settings, { size: 22 })
  )
}

export const settingsManifest: AppManifest = {
  id: 'settings',
  name: '系统设置',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '外观、Dock、通知等系统偏好设置',
  icon: React.createElement(SettingsIcon),
  multiWindow: false,
  defaultSize: { width: 700, height: 500 },
  minSize: { width: 600, height: 400 },
  permissions: ['storage'],
  component: () => import('./index'),
}
