import { useMemo } from 'react'

/**
 * App Storage — per-app namespaced localStorage wrapper.
 *
 * Each app gets its own prefix so keys never collide:
 *   ventoos.<appId>.<key>
 */

export interface AppStorageAPI {
  getJSON<T = unknown>(key: string): Promise<T | null>
  setJSON(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

function prefix(appId: string, key: string) {
  return `ventoos.${appId}.${key}`
}

/** Low-level factory (no React). */
export function createAppStorage(appId: string): AppStorageAPI {
  return {
    async getJSON<T = unknown>(key: string): Promise<T | null> {
      try {
        const raw = localStorage.getItem(prefix(appId, key))
        return raw ? (JSON.parse(raw) as T) : null
      } catch {
        return null
      }
    },
    async setJSON(key: string, value: unknown): Promise<void> {
      localStorage.setItem(prefix(appId, key), JSON.stringify(value))
    },
    async remove(key: string): Promise<void> {
      localStorage.removeItem(prefix(appId, key))
    }
  }
}

/** React hook — returns a stable reference for the given app. */
export function useAppStorage(appId: string): AppStorageAPI {
  // Memoize to keep the same reference across renders so consumers can safely
  // include it in useEffect dependency arrays without triggering infinite loops.
  return useMemo(() => createAppStorage(appId), [appId])
}
