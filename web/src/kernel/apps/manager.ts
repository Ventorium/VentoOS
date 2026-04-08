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
    .filter(
      a =>
        a.fileAssociations?.includes(lower) ||
        a.fileOpenAssociations?.includes(lower) ||
        a.filePreviewAssociations?.includes(lower)
    )
}

/** Get apps that can open/edit files with the given extension */
export function getOpenAppsForFile(ext: string): AppManifest[] {
  const lower = ext.toLowerCase()
  return useAppStore
    .getState()
    .getAllApps()
    .filter(a => a.fileOpenAssociations?.includes(lower) || a.fileAssociations?.includes(lower))
}

/** Get apps that can preview files with the given extension */
export function getPreviewAppsForFile(ext: string): AppManifest[] {
  const lower = ext.toLowerCase()
  return useAppStore
    .getState()
    .getAllApps()
    .filter(a => a.filePreviewAssociations?.includes(lower))
}

/** Get all apps for a file (both open and preview), with type annotation */
export function getAllAppsForFile(ext: string): Array<AppManifest & { associationType: 'open' | 'preview' }> {
  const lower = ext.toLowerCase()
  const result: Array<AppManifest & { associationType: 'open' | 'preview' }> = []
  const seen = new Set<string>()

  for (const app of useAppStore.getState().getAllApps()) {
    const canOpen = app.fileOpenAssociations?.includes(lower) || app.fileAssociations?.includes(lower)
    const canPreview = app.filePreviewAssociations?.includes(lower)
    if (canOpen && !seen.has(app.id)) {
      seen.add(app.id)
      result.push({ ...app, associationType: 'open' })
    }
    if (canPreview && !seen.has(app.id)) {
      seen.add(app.id)
      result.push({ ...app, associationType: 'preview' })
    }
  }
  return result
}

/** Get apps that always appear in the "Open With" menu regardless of extension */
export function getAlwaysOpenWithApps(): AppManifest[] {
  return useAppStore
    .getState()
    .getAllApps()
    .filter(a => a.alwaysShowInOpenWith)
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
