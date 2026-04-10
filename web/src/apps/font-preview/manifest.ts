import { Type } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function FontPreviewIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #ec4899 0%, #f59e0b 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Type, { size: 22 })
  )
}

export const fontPreviewManifest: AppManifest = {
  id: 'font-preview',
  name: '字体预览',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '预览字体文件 — 各尺寸预览、字符表、自定义文本',
  icon: React.createElement(FontPreviewIcon),
  fileOpenAssociations: ['ttf', 'otf', 'woff', 'woff2'],
  filePreviewAssociations: ['ttf', 'otf', 'woff', 'woff2'],
  multiWindow: true,
  defaultSize: { width: 640, height: 500 },
  permissions: ['storage'],
  hasBackendPlugin: false,
  hidden: true,
  group: '其它',
  component: () => import('./index')
}
