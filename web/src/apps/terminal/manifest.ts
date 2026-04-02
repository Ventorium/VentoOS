import React from 'react'
import { TerminalSquare } from 'lucide-react'
import type { AppManifest } from '@/kernel'

export const terminalManifest: AppManifest = {
  id: 'terminal',
  name: '终端',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '本地终端模拟器',
  icon: React.createElement(TerminalSquare),
  multiWindow: true,
  defaultSize: { width: 720, height: 480 },
  minSize: { width: 480, height: 280 },
  permissions: ['shell'],
  component: () => import('./index')
}
