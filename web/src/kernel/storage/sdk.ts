/**
 * App Storage SDK
 *
 * Provides per-app key-value storage backed by the backend.
 * Each app gets isolated storage in its own SQLite database.
 *
 * Usage:
 *   const storage = useAppStorage('explorer')
 *   await storage.set('viewMode', 'grid')
 *   const mode = await storage.get('viewMode')
 */

import { useCallback, useMemo } from 'react'
import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'

const logger = createLogger('kernel/storage')

export interface AppStorageAPI {
  /** Get a value by key. Returns null if not found. */
  get: (key: string) => Promise<string | null>
  /** Set a value by key. */
  set: (key: string, value: string) => Promise<void>
  /** Delete a value by key. Returns true if deleted. */
  remove: (key: string) => Promise<boolean>
  /** List all keys in this app's storage. */
  keys: () => Promise<string[]>
  /** Get a JSON-parsed value by key. Returns null if not found or parse fails. */
  getJSON: <T = unknown>(key: string) => Promise<T | null>
  /** Set a JSON-serialized value by key. */
  setJSON: (key: string, value: unknown) => Promise<void>
}

/**
 * Create a storage API for a specific app.
 * This is a plain function (not a hook) for use outside React components.
 */
export function createAppStorage(appId: string): AppStorageAPI {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const res = await apiClient.getStorageValue(appId, key)
        return res.data?.value ?? null
      } catch {
        logger.warn(`Failed to get storage key '${key}' for app '${appId}'`)
        return null
      }
    },

    async set(key: string, value: string): Promise<void> {
      try {
        await apiClient.setStorageValue(appId, key, value)
      } catch (err) {
        logger.error(`Failed to set storage key '${key}' for app '${appId}'`, err)
        throw err
      }
    },

    async remove(key: string): Promise<boolean> {
      try {
        const res = await apiClient.deleteStorageValue(appId, key)
        return (res.data as { deleted?: boolean })?.deleted ?? false
      } catch {
        logger.warn(`Failed to delete storage key '${key}' for app '${appId}'`)
        return false
      }
    },

    async keys(): Promise<string[]> {
      try {
        const res = await apiClient.listStorageKeys(appId)
        return res.data ?? []
      } catch {
        logger.warn(`Failed to list storage keys for app '${appId}'`)
        return []
      }
    },

    async getJSON<T = unknown>(key: string): Promise<T | null> {
      const raw = await this.get(key)
      if (raw == null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        logger.warn(`Failed to parse JSON for storage key '${key}' in app '${appId}'`)
        return null
      }
    },

    async setJSON(key: string, value: unknown): Promise<void> {
      await this.set(key, JSON.stringify(value))
    }
  }
}

/**
 * React hook that returns a memoized storage API for the given app.
 */
export function useAppStorage(appId: string): AppStorageAPI {
  const get = useCallback((key: string) => createAppStorage(appId).get(key), [appId])
  const set = useCallback((key: string, value: string) => createAppStorage(appId).set(key, value), [appId])
  const remove = useCallback((key: string) => createAppStorage(appId).remove(key), [appId])
  const keys = useCallback(() => createAppStorage(appId).keys(), [appId])
  const getJSON = useCallback(<T = unknown>(key: string) => createAppStorage(appId).getJSON<T>(key), [appId])
  const setJSON = useCallback((key: string, value: unknown) => createAppStorage(appId).setJSON(key, value), [appId])

  return useMemo(() => ({ get, set, remove, keys, getJSON, setJSON }), [get, set, remove, keys, getJSON, setJSON])
}
