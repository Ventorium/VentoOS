import { Sparkles } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function AIAssistantIcon() {
  return React.createElement(
    'div',
    {
      className: 'dock-icon-ai-assistant',
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      },
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
  defaultSize: { width: 480, height: 640 },
  minSize: { width: 360, height: 480 },
  permissions: ['network', 'notifications', 'ipc'],
  component: () => import('./index'),
}
