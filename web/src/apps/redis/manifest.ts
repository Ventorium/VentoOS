import { Key } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function RedisIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Key, { size: 22 })
  )
}

export const redisManifest: AppManifest = {
  id: 'redis',
  name: 'Redis',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: 'Browse and manage Redis key-value stores',
  icon: React.createElement(RedisIcon),
  multiWindow: false,
  defaultSize: { width: 960, height: 640 },
  minSize: { width: 700, height: 440 },
  permissions: ['network', 'connections', 'notifications', 'ipc'],
  hasBackendPlugin: true,
  handles: [
    { topic: 'open:redis', autoOpen: true, priority: 0 },
  ],
  component: () => import('./index')
}
