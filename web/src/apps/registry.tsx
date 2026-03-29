import { type ComponentType, lazy } from 'react'

export interface AppComponentProps {
  windowId: string
}

// Lazy-load app modules
const KubernetesApp = lazy(() => import('./kubernetes'))
const DatabaseApp = lazy(() => import('./database'))
const RedisApp = lazy(() => import('./redis'))
const ExplorerApp = lazy(() => import('./explorer'))
const SshApp = lazy(() => import('./ssh'))
const AIAssistantApp = lazy(() => import('./ai-assistant'))
const SettingsApp = lazy(() => import('./settings'))

const registry: Record<string, ComponentType<AppComponentProps>> = {
  kubernetes: KubernetesApp,
  database: DatabaseApp,
  redis: RedisApp,
  explorer: ExplorerApp,
  ssh: SshApp,
  'ai-assistant': AIAssistantApp,
  settings: SettingsApp
}

export function getAppComponent(appId: string): ComponentType<AppComponentProps> | undefined {
  return registry[appId]
}
