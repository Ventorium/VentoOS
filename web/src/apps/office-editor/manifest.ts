import { FileSpreadsheet } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function OfficeEditorIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(FileSpreadsheet, { size: 22 })
  )
}

export const officeEditorManifest: AppManifest = {
  id: 'office-editor',
  name: 'Office 编辑器',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '查看和编辑 Office 文档 — Word, Excel, PowerPoint',
  icon: React.createElement(OfficeEditorIcon),
  fileOpenAssociations: ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'csv'],
  multiWindow: true,
  defaultSize: { width: 1100, height: 750 },
  minSize: { width: 800, height: 600 },
  permissions: ['storage'],
  hasBackendPlugin: false,
  hidden: true,
  component: () => import('./index')
}
