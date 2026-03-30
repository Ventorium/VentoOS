/**
 * Local Storage Utilities
 *
 * Type-safe wrappers for localStorage with JSON serialization.
 */

/**
 * Get a value from localStorage.
 * Returns `undefined` if not found or JSON parse fails.
 */
export function storageGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return undefined
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/** Set a value in localStorage (JSON-serialized). */
export function storageSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

/** Remove a key from localStorage. */
export function storageRemove(key: string): void {
  localStorage.removeItem(key)
}

/** Clear all localStorage entries matching a prefix. */
export function storageClearPrefix(prefix: string): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(prefix)) keys.push(k)
  }
  for (const k of keys) localStorage.removeItem(k)
}
