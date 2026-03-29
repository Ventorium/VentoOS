import { Box, Database, FolderOpen, Key, Settings, Sparkles, Terminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAppStore } from '@/store/app'

/** Wrap an icon with a colored gradient background for Dock display */
function AppIcon({ iconId, children }: { iconId: string; children: ReactNode }) {
  return (
    <div
      className={`dock-icon-${iconId}`}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}
    >
      {children}
    </div>
  )
}

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
    icon: <AppIcon iconId="kubernetes"><Box size={22} /></AppIcon>,
    description: 'Manage Kubernetes clusters, workloads, and resources',
    multiWindow: true,
    defaultWidth: 1100,
    defaultHeight: 720
  },
  {
    id: 'database',
    name: 'Database',
    icon: <AppIcon iconId="database"><Database size={22} /></AppIcon>,
    description: 'Connect and manage PostgreSQL, MySQL, and SQLite databases',
    multiWindow: true,
    defaultWidth: 1060,
    defaultHeight: 700
  },
  {
    id: 'redis',
    name: 'Redis',
    icon: <AppIcon iconId="redis"><Key size={22} /></AppIcon>,
    description: 'Browse and manage Redis key-value stores',
    multiWindow: true,
    defaultWidth: 960,
    defaultHeight: 640
  },
  {
    id: 'explorer',
    name: 'Explorer',
    icon: <AppIcon iconId="explorer"><FolderOpen size={22} /></AppIcon>,
    description: 'Browse remote filesystems via SSH, SFTP, FTP, SMB, and S3',
    multiWindow: true,
    defaultWidth: 1000,
    defaultHeight: 680
  },
  {
    id: 'ssh',
    name: 'SSH 管理',
    icon: <AppIcon iconId="ssh"><Terminal size={22} /></AppIcon>,
    description: '管理 SSH 服务器、端口映射与服务暴露',
    multiWindow: true,
    defaultWidth: 1000,
    defaultHeight: 680
  },
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    icon: <AppIcon iconId="ai-assistant"><Sparkles size={22} /></AppIcon>,
    description: 'AI-powered assistant for infrastructure operations',
    multiWindow: false,
    defaultWidth: 480,
    defaultHeight: 640
  },
  {
    id: 'settings',
    name: '系统设置',
    icon: <AppIcon iconId="settings"><Settings size={22} /></AppIcon>,
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
