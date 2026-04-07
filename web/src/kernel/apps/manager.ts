/**
 * App Manager
 *
 * High-level functions for working with registered applications.
 * These are pure, synchronous operations over the app store.
 */

import type { ComponentType } from 'react'
import { lazy } from 'react'
import type { AppComponentProps, AppManifest } from './manifest'
import { useAppStore } from './store'

/** Register a single app manifest */
export function registerApp(manifest: AppManifest): void {
  useAppStore.getState().registerApp(manifest)
}

/** Register multiple app manifests at once */
export function registerApps(manifests: AppManifest[]): void {
  for (const m of manifests) registerApp(m)
}

/** Get an app manifest by ID */
export function getApp(appId: string): AppManifest | undefined {
  return useAppStore.getState().getApp(appId)
}

/** Get all registered app manifests */
export function getAllApps(): AppManifest[] {
  return useAppStore.getState().getAllApps()
}

/** Get all apps that declare a file association for a given extension */
export function getAppsForFile(ext: string): AppManifest[] {
  const lower = ext.toLowerCase()
  return useAppStore
    .getState()
    .getAllApps()
    .filter(a => a.fileAssociations?.includes(lower))
}

// ─── Lazy component cache ──────────────────────────────────────────────────

const componentCache = new Map<string, ComponentType<AppComponentProps>>()

/**
 * Get the lazy-loaded React component for an app.
 * Components are cached after the first call.
 */
export function getAppComponent(appId: string): ComponentType<AppComponentProps> | undefined {
  if (componentCache.has(appId)) return componentCache.get(appId)

  const manifest = getApp(appId)
  if (!manifest) return undefined

  const LazyComponent = lazy(manifest.component)
  componentCache.set(appId, LazyComponent)
  return LazyComponent
}
