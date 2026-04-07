/**
 * Window Store
 *
 * Kernel-level Zustand store for window UI state.
 *
 * KEY DESIGN: This store manages ONLY UI state (position, size, focus, z-index).
 * Process lifecycle (spawn/terminate/suspend) is handled by kernel/window/manager.ts,
 * which calls the backend process API. There is NO direct dependency on
 * a frontend process store — the backend owns process truth.
 *
 * PERSISTENCE: Window state is persisted to the backend SQLite database.
 * On boot, state is loaded from backend; on changes, state is debounced-synced back.
 */

import { create } from 'zustand'
import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'
import type { WindowInstance } from './types'

const logger = createLogger('kernel/window/store')

/** Debounce timer for syncing window states to backend. */
let _syncTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_DEBOUNCE_MS = 500

/** Convert frontend WindowInstance[] to backend WindowStateDTO[] */
function toBackendStates(windows: WindowInstance[]) {
  return windows.map(w => ({
    id: w.id,
    app_id: w.appId,
    title: w.title,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    z_index: w.zIndex,
    status: w.isMinimized ? 'minimized' : w.isFocused ? 'active' : 'blurred',
    is_maximized: w.isMaximized,
    tab_states: w.restoreBounds ? w.restoreBounds : undefined,
    app_state: w.appState
  }))
}

/** Debounced sync of window states to backend. */
function scheduleSyncToBackend(windows: WindowInstance[]) {
  if (_syncTimer) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => {
    apiClient.saveWindowSettings(toBackendStates(windows)).catch(err => {
      logger.warn('Failed to sync window states to backend', err)
    })
  }, SYNC_DEBOUNCE_MS)
}

interface WindowStore {
  windows: WindowInstance[]
  nextZIndex: number

  // ── Internal mutations (called by manager.ts) ──────────────────────────

  /** Add a new window to the store */
  _addWindow: (win: WindowInstance) => void
  /** Remove a window from the store */
  _removeWindow: (id: string) => void
  /** Update a window's focus state and z-index */
  _focusWindow: (id: string, nextZ: number) => void
  /** Mark a window as minimized */
  _minimizeWindow: (id: string) => void
  /** Restore a minimized window (without focusing) */
  _restoreWindowState: (id: string) => void
  /** Toggle maximize/restore */
  _toggleMaximize: (id: string) => void
  /** Update process ID after backend creates the process */
  _setProcessId: (windowId: string, pid: number) => void

  // ── Direct mutations (safe to call from components) ────────────────────

  moveWindow: (id: string, x: number, y: number) => void
  resizeWindow: (id: string, width: number, height: number) => void
  updateTitle: (id: string, title: string) => void
  updateAppState: (id: string, appState: Record<string, unknown>) => void

  // ── Backend sync ───────────────────────────────────────────────────────

  /** Load window states from backend (called once at boot) */
  loadFromBackend: () => Promise<void>

  // ── Queries ────────────────────────────────────────────────────────────

  getWindow: (id: string) => WindowInstance | undefined
  getWindowsByApp: (appId: string) => WindowInstance[]
  getFocusedWindow: () => WindowInstance | undefined
}

export const useWindowStore = create<WindowStore>()((set, get) => ({
  windows: [],
  nextZIndex: 1,

  _addWindow(win) {
    set(state => {
      const windows = [...state.windows.map(w => ({ ...w, isFocused: false })), win]
      scheduleSyncToBackend(windows)
      return { windows, nextZIndex: state.nextZIndex + 1 }
    })
  },

  _removeWindow(id) {
    set(state => {
      const remaining = state.windows.filter(w => w.id !== id)
      let windows: WindowInstance[]
      if (remaining.length > 0) {
        const top = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
        windows = remaining.map(w => ({ ...w, isFocused: w.id === top.id }))
      } else {
        windows = remaining
      }
      scheduleSyncToBackend(windows)
      return { windows }
    })
  },

  _focusWindow(id, nextZ) {
    set(state => {
      const windows = state.windows.map(w =>
        w.id === id ? { ...w, isFocused: true, zIndex: nextZ, isMinimized: false } : { ...w, isFocused: false }
      )
      scheduleSyncToBackend(windows)
      return { windows, nextZIndex: nextZ + 1 }
    })
  },

  _minimizeWindow(id) {
    set(state => {
      const windows = state.windows.map(w => (w.id === id ? { ...w, isMinimized: true, isFocused: false } : w))
      scheduleSyncToBackend(windows)
      return { windows }
    })
  },

  _restoreWindowState(id) {
    set(state => {
      const windows = state.windows.map(w => (w.id === id ? { ...w, isMinimized: false } : w))
      scheduleSyncToBackend(windows)
      return { windows }
    })
  },

  _toggleMaximize(id) {
    set(state => {
      const windows = state.windows.map(w => {
        if (w.id !== id) return w
        if (w.isMaximized) {
          return {
            ...w,
            isMaximized: false,
            ...(w.restoreBounds ?? {}),
            restoreBounds: undefined
          }
        }
        return {
          ...w,
          isMaximized: true,
          restoreBounds: { x: w.x, y: w.y, width: w.width, height: w.height }
        }
      })
      scheduleSyncToBackend(windows)
      return { windows }
    })
  },

  _setProcessId(windowId, pid) {
    set(state => ({
      windows: state.windows.map(w => (w.id === windowId ? { ...w, processId: pid } : w))
    }))
  },

  moveWindow(id, x, y) {
    set(state => {
      const windows = state.windows.map(w => (w.id === id ? { ...w, x, y } : w))
      scheduleSyncToBackend(windows)
      return { windows }
    })
  },

  resizeWindow(id, width, height) {
    set(state => {
      const windows = state.windows.map(w => (w.id === id ? { ...w, width, height } : w))
      scheduleSyncToBackend(windows)
      return { windows }
    })
  },

  updateTitle(id, title) {
    set(state => ({
      windows: state.windows.map(w => (w.id === id ? { ...w, title } : w))
    }))
  },

  updateAppState(id, appState) {
    set(state => {
      const windows = state.windows.map(w => (w.id === id ? { ...w, appState } : w))
      scheduleSyncToBackend(windows)
      return { windows }
    })
  },

  async loadFromBackend() {
    try {
      const res = await apiClient.getWindowSettings()
      const states = res.data ?? []
      if (states.length === 0) return

      const windows: WindowInstance[] = states.map(s => ({
        id: s.id,
        appId: s.app_id,
        title: s.title,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        zIndex: s.z_index,
        isMaximized: s.is_maximized,
        isMinimized: s.status === 'minimized',
        isFocused: s.status === 'active',
        restoreBounds: s.tab_states as WindowInstance['restoreBounds'],
        appState: s.app_state as Record<string, unknown> | undefined
      }))

      const maxZ = windows.reduce((max, w) => Math.max(max, w.zIndex), 0)
      set({ windows, nextZIndex: maxZ + 1 })
      logger.info(`Loaded ${windows.length} window states from backend`)
    } catch (err) {
      logger.warn('Failed to load window states from backend', err)
    }
  },

  getWindow(id) {
    return get().windows.find(w => w.id === id)
  },

  getWindowsByApp(appId) {
    return get().windows.filter(w => w.appId === appId)
  },

  getFocusedWindow() {
    return get().windows.find(w => w.isFocused)
  }
}))
