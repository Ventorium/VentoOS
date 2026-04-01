import { FileText } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function FileViewerIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }
    },
    React.createElement(FileText, { size: 22 })
  )
}

export const fileViewerManifest: AppManifest = {
  id: 'file-viewer',
  name: 'File Viewer',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: 'View files from any VFS mount — text, code, images, PDF, video and more',
  icon: React.createElement(FileViewerIcon),
  multiWindow: true,
  defaultSize: { width: 900, height: 600 },
  minSize: { width: 480, height: 300 },
  permissions: ['storage'],
  hasBackendPlugin: false,
  component: () => import('./index')
}
