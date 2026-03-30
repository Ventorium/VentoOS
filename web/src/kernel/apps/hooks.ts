/**
 * App Hooks
 *
 * React hooks for accessing app registry state.
 */

import { useCallback } from 'react'
import { getAppComponent } from './manager'
import type { AppManifest } from './manifest'
import { useAppStore } from './store'

/** Get a single app manifest by ID */
export function useApp(appId: string): AppManifest | undefined {
  return useAppStore(state => state.apps.get(appId))
}

/** Get all registered app manifests */
export function useAppList(): AppManifest[] {
  return useAppStore(state => [...state.apps.values()])
}

/** Get the lazy-loaded component for an app */
export function useAppComponent(appId: string) {
  return useCallback(() => getAppComponent(appId), [appId])
}
