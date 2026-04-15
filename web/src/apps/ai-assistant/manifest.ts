import { Sparkles } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function AIAssistantIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Sparkles, { size: 22 })
  )
}

export const aiAssistantManifest: AppManifest = {
  id: 'ai-assistant',
  name: 'AI Assistant',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: 'AI-powered assistant for infrastructure operations',
  icon: React.createElement(AIAssistantIcon),
  multiWindow: false,
  defaultSize: { width: 680, height: 640 },
  minSize: { width: 480, height: 480 },
  permissions: ['network', 'notifications', 'ipc'],
  component: () => import('./index')
}
