import { Blocks } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function DepManagerIcon() {
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
    React.createElement(Blocks, { size: 22 })
  )
}

export const dependencyManagerManifest: AppManifest = {
  id: 'dependency-manager',
  name: '依赖管理',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '检测和安装系统依赖',
  icon: React.createElement(DepManagerIcon),
  multiWindow: false,
  defaultSize: { width: 700, height: 500 },
  minSize: { width: 500, height: 400 },
  permissions: ['shell'],
  categories: ['system'],
  hidden: false,
  group: '其它',
  component: () => import('./index')
}
