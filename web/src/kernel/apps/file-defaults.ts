/**
 * File Defaults Store
 *
 * Manages default "open with" app for each file extension.
 * Persists to system storage so preferences survive restarts.
 */

import { create } from 'zustand'
import { createAppStorage } from '../storage'

const STORAGE_KEY = 'file-defaults'
const systemStorage = createAppStorage('system')

interface FileDefaultsStore {
  /** Map of extension (lowercase) → appId */
  defaults: Record<string, string>
  /** Whether initial load from storage is complete */
  loaded: boolean
  /** Set default app for an extension */
  setDefault: (ext: string, appId: string) => void
  /** Remove default for an extension */
  removeDefault: (ext: string) => void
  /** Get default app ID for an extension (undefined if not set) */
  getDefault: (ext: string) => string | undefined
  /** Load from persistent storage */
  load: () => Promise<void>
}

export const useFileDefaultsStore = create<FileDefaultsStore>((set, get) => ({
  defaults: {},
  loaded: false,

  setDefault(ext: string, appId: string) {
    const lower = ext.toLowerCase()
    set(state => {
      const next = { ...state.defaults, [lower]: appId }
      // Persist async — fire and forget
      systemStorage.setJSON(STORAGE_KEY, next).catch(() => {})
      return { defaults: next }
    })
  },

  removeDefault(ext: string) {
    const lower = ext.toLowerCase()
    set(state => {
      const next = { ...state.defaults }
      delete next[lower]
      systemStorage.setJSON(STORAGE_KEY, next).catch(() => {})
      return { defaults: next }
    })
  },

  getDefault(ext: string) {
    return get().defaults[ext.toLowerCase()]
  },

  async load() {
    try {
      const data = await systemStorage.getJSON<Record<string, string>>(STORAGE_KEY)
      if (data) {
        set({ defaults: data, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  }
}))
