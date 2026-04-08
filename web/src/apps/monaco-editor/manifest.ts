import { Code2 } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function MonacoEditorIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0078d4 0%, #005a9e 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Code2, { size: 22 })
  )
}

export const monacoEditorManifest: AppManifest = {
  id: 'monaco-editor',
  name: '代码编辑器',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: '功能完整的代码编辑器，支持打开任意文件和目录',
  icon: React.createElement(MonacoEditorIcon),
  fileOpenAssociations: [
    'js', 'jsx', 'ts', 'tsx', 'json', 'jsonc', 'yaml', 'yml', 'toml',
    'rs', 'go', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
    'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg',
    'md', 'markdown', 'txt', 'log', 'conf', 'cfg', 'ini', 'env',
    'sql', 'graphql', 'proto', 'dockerfile', 'makefile',
    'gitignore', 'gitattributes', 'editorconfig',
    'vue', 'svelte', 'astro'
  ],
  alwaysShowInOpenWith: true,
  multiWindow: true,
  defaultSize: { width: 1100, height: 720 },
  minSize: { width: 600, height: 400 },
  permissions: ['storage'],
  hidden: false,
  component: () => import('./index')
}
