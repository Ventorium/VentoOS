import { ImageIcon } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function ImageEditorIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(ImageIcon, { size: 22 })
  )
}

export const imageEditorManifest: AppManifest = {
  id: 'image-editor',
  name: '图片编辑器',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '打开和编辑图片 — 旋转、裁剪、绘画、导出',
  icon: React.createElement(ImageEditorIcon),
  fileOpenAssociations: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
  multiWindow: true,
  defaultSize: { width: 960, height: 700 },
  minSize: { width: 640, height: 480 },
  permissions: ['storage'],
  hasBackendPlugin: false,
  hidden: true,
  component: () => import('./index')
}
