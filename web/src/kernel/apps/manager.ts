/**
 * App Manager
 *
 * High-level functions for working with registered applications.
 * These are pure, synchronous operations over the app store.
 */

import { lazy } from 'react'
import type { ComponentType } from 'react'
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
