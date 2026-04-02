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
    },
  }
}

/** React hook — returns a stable reference for the given app. */
export function useAppStorage(appId: string): AppStorageAPI {
  // Intentionally no state: the storage object is a stable wrapper.
  // Consumers call getJSON/setJSON imperatively (already wrapped in
  // useEffect / event handlers), so no re-render trigger is needed.
  return createAppStorage(appId)
}
