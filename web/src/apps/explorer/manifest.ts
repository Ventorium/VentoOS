import { FolderOpen } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function ExplorerIcon() {
  return React.createElement(
    'div',
    {
      className: 'dock-icon-explorer',
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }
    },
    React.createElement(FolderOpen, { size: 22 })
  )
}

export const explorerManifest: AppManifest = {
  id: 'explorer',
  name: 'Explorer',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: 'Browse remote filesystems via SSH, SFTP, FTP, SMB, WebDAV and S3',
  icon: React.createElement(ExplorerIcon),
  multiWindow: true,
  defaultSize: { width: 1000, height: 680 },
  minSize: { width: 700, height: 440 },
  permissions: ['network', 'connections', 'storage', 'notifications'],
  hasBackendPlugin: true,
  component: () => import('./index')
}
