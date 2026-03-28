import { Box, Database, FolderOpen, Key, Settings, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAppStore } from '@/store/app'

const APPS: Array<{
  id: string
  name: string
  icon: ReactNode
  description: string
  multiWindow: boolean
  defaultWidth?: number
  defaultHeight?: number
}> = [
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    icon: <Box size={22} />,
    description: 'Manage Kubernetes clusters, workloads, and resources',
    multiWindow: true,
    defaultWidth: 1100,
    defaultHeight: 720
  },
  {
    id: 'database',
    name: 'Database',
    icon: <Database size={22} />,
    description: 'Connect and manage PostgreSQL, MySQL, and SQLite databases',
    multiWindow: true,
    defaultWidth: 1060,
    defaultHeight: 700
  },
  {
    id: 'redis',
    name: 'Redis',
    icon: <Key size={22} />,
    description: 'Browse and manage Redis key-value stores',
    multiWindow: true,
    defaultWidth: 960,
    defaultHeight: 640
  },
  {
    id: 'explorer',
    name: 'Explorer',
    icon: <FolderOpen size={22} />,
    description: 'Browse remote filesystems via SSH, SFTP, FTP, SMB, and S3',
    multiWindow: true,
    defaultWidth: 1000,
    defaultHeight: 680
  },
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    icon: <Sparkles size={22} />,
    description: 'AI-powered assistant for infrastructure operations',
    multiWindow: false,
    defaultWidth: 480,
    defaultHeight: 640
  },
  {
    id: 'settings',
    name: '系统设置',
    icon: <Settings size={22} />,
    description: '外观、Dock、通知等系统偏好设置',
    multiWindow: false,
    defaultWidth: 700,
    defaultHeight: 500
  }
]

/** Register all built-in applications. Call once at startup. */
export function registerBuiltinApps() {
  const { registerApp } = useAppStore.getState()
  for (const app of APPS) {
    registerApp(app)
  }
}
