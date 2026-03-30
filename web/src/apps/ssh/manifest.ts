import { Terminal } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function SshIcon() {
  return React.createElement(
    'div',
    {
      className: 'dock-icon-ssh',
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }
    },
    React.createElement(Terminal, { size: 22 })
  )
}

export const sshManifest: AppManifest = {
  id: 'ssh',
  name: 'SSH 管理',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '管理 SSH 服务器、端口映射与服务暴露',
  icon: React.createElement(SshIcon),
  multiWindow: true,
  defaultSize: { width: 1000, height: 680 },
  minSize: { width: 700, height: 440 },
  permissions: ['network', 'connections', 'shell', 'notifications'],
  hasBackendPlugin: true,
  component: () => import('./index')
}
