import { TerminalSquare } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function TerminalIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(TerminalSquare, { size: 22 })
  )
}

export const terminalManifest: AppManifest = {
  id: 'terminal',
  name: '终端',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '本地终端模拟器',
  icon: React.createElement(TerminalIcon),
  multiWindow: true,
  defaultSize: { width: 720, height: 480 },
  minSize: { width: 480, height: 280 },
  permissions: ['shell'],
  component: () => import('./index')
}
