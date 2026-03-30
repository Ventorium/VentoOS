/**
 * App Registry Store
 *
 * Kernel-level store that holds all installed/registered application manifests.
 * No UI state — pure metadata about available apps.
 */

import { create } from 'zustand'
import type { AppManifest } from './manifest'

interface AppStore {
  /** Map of appId → AppManifest */
  apps: Map<string, AppManifest>

  /** Register an application (idempotent — re-registers silently) */
  registerApp: (manifest: AppManifest) => void

  /** Unregister an application */
  unregisterApp: (appId: string) => void

  /** Look up a single app by ID */
  getApp: (appId: string) => AppManifest | undefined

  /** Get all registered apps as an array */
  getAllApps: () => AppManifest[]
}

export const useAppStore = create<AppStore>(() => ({
  apps: new Map(),

  registerApp(manifest) {
    useAppStore.setState(state => {
      const next = new Map(state.apps)
      next.set(manifest.id, manifest)
      return { apps: next }
    })
  },

  unregisterApp(appId) {
    useAppStore.setState(state => {
      const next = new Map(state.apps)
      next.delete(appId)
      return { apps: next }
    })
  },

  getApp(appId) {
    return useAppStore.getState().apps.get(appId)
  },

  getAllApps() {
    return [...useAppStore.getState().apps.values()]
  },
}))
