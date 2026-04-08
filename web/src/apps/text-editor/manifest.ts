import { FileText } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function TextEditorIcon() {
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
    React.createElement(FileText, { size: 22 })
  )
}

export const textEditorManifest: AppManifest = {
  id: 'text-editor',
  name: '文本编辑器',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '编辑文本文件 — 支持任意纯文本格式',
  icon: React.createElement(TextEditorIcon),
  fileOpenAssociations: [
    'txt', 'md', 'markdown', 'log', 'ini', 'env', 'conf', 'cfg',
    'toml', 'yaml', 'yml', 'xml', 'html', 'htm', 'css', 'less', 'scss',
    'js', 'jsx', 'ts', 'tsx', 'json', 'jsonc', 'rs', 'py', 'go', 'java',
    'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'sh', 'bash', 'zsh',
    'fish', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'proto', 'diff',
    'patch', 'gitignore', 'dockerfile', 'makefile'
  ],
  alwaysShowInOpenWith: true,
  multiWindow: true,
  defaultSize: { width: 800, height: 600 },
  minSize: { width: 480, height: 300 },
  permissions: ['storage'],
  hasBackendPlugin: false,
  hidden: true,
  component: () => import('./index')
}
