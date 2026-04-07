import { Archive } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function ArchiveEditorIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Archive, { size: 22 })
  )
}

export const archiveEditorManifest: AppManifest = {
  id: 'archive-editor',
  name: '压缩文件管理',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '查看、解压和创建压缩文件',
  icon: React.createElement(ArchiveEditorIcon),
  fileOpenAssociations: [
    'zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz', 'zst',
    'tgz', 'tbz2', 'txz', 'tzst', 'tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst'
  ],
  multiWindow: true,
  defaultSize: { width: 800, height: 550 },
  minSize: { width: 600, height: 400 },
  permissions: ['storage'],
  hasBackendPlugin: true,
  hidden: true,
  component: () => import('./index')
}
