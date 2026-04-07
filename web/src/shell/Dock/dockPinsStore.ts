/**
 * Dock Pins Store
 *
 * Manages which apps are pinned to the Dock.
 * Pinned apps always appear in the Dock.
 * Unpinned apps only appear when they have running windows.
 * Terminal is always pinned and cannot be unpinned.
 */
import { create } from 'zustand'
import { createAppStorage } from '@/kernel'

const STORAGE_KEY = 'dock-pins'
const ALWAYS_PINNED = ['terminal'] // Cannot be unpinned

interface DockPinsState {
  /** Set of pinned app IDs. null = not yet loaded (show all non-hidden by default) */
  pinnedApps: Set<string> | null
  /** Initialize pins from storage, defaulting to all visible apps */
  load: (defaultAppIds: string[]) => Promise<void>
  /** Pin an app to the Dock */
  pin: (appId: string) => void
  /** Unpin an app from the Dock */
  unpin: (appId: string) => void
  /** Check if an app is pinned */
  isPinned: (appId: string) => boolean
}

const storage = createAppStorage('system')

export const useDockPinsStore = create<DockPinsState>((set, get) => ({
  pinnedApps: null,

  load: async (defaultAppIds: string[]) => {
    const saved = await storage.getJSON<string[]>(STORAGE_KEY)
    if (saved && Array.isArray(saved)) {
      // Ensure always-pinned apps are included
      const pins = new Set(saved)
      for (const id of ALWAYS_PINNED) pins.add(id)
      set({ pinnedApps: pins })
    } else {
      // First run: pin all non-hidden apps
      set({ pinnedApps: new Set(defaultAppIds) })
    }
  },

  pin: (appId: string) => {
    const { pinnedApps } = get()
    const next = new Set(pinnedApps ?? [])
    next.add(appId)
    set({ pinnedApps: next })
    storage.setJSON(STORAGE_KEY, [...next])
  },

  unpin: (appId: string) => {
    if (ALWAYS_PINNED.includes(appId)) return
    const { pinnedApps } = get()
    const next = new Set(pinnedApps ?? [])
    next.delete(appId)
    set({ pinnedApps: next })
    storage.setJSON(STORAGE_KEY, [...next])
  },

  isPinned: (appId: string) => {
    const { pinnedApps } = get()
    if (!pinnedApps) return true // Not loaded yet, show all
    return pinnedApps.has(appId)
  }
}))
