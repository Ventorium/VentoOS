import { MonitorCog } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function SuperTerminalIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(MonitorCog, { size: 22 })
  )
}

export const superTerminalManifest: AppManifest = {
  id: 'super-terminal',
  name: '超级终端',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '集成本地终端、SSH 服务器管理、端口映射与外网访问',
  icon: React.createElement(SuperTerminalIcon),
  multiWindow: true,
  defaultSize: { width: 1200, height: 720 },
  minSize: { width: 800, height: 500 },
  permissions: ['network', 'connections', 'shell', 'notifications', 'ipc'],
  hasBackendPlugin: true,
  handles: [
    { topic: 'open:terminal', autoOpen: true, priority: 0 },
  ],
  component: () => import('./index')
}
