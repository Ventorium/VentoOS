import type { ReactNode } from 'react'
import { create } from 'zustand'

export interface AppDefinition {
  id: string
  name: string
  icon: ReactNode
  description: string
  /** Whether the app supports multiple windows */
  multiWindow: boolean
  /** Minimum window dimensions */
  minWidth?: number
  minHeight?: number
  /** Default window dimensions */
  defaultWidth?: number
  defaultHeight?: number
}

interface AppStore {
  /** Registered application definitions */
  apps: Map<string, AppDefinition>
  /** Register an application */
  registerApp: (app: AppDefinition) => void
  /** Get an app by ID */
  getApp: (id: string) => AppDefinition | undefined
  /** Get all registered apps */
  getAllApps: () => AppDefinition[]
}

export const useAppStore = create<AppStore>((set, get) => ({
  apps: new Map(),

  registerApp(app) {
    set(state => {
      const newApps = new Map(state.apps)
      newApps.set(app.id, app)
      return { apps: newApps }
    })
  },

  getApp(id) {
    return get().apps.get(id)
  },

  getAllApps() {
    return Array.from(get().apps.values())
  }
}))
