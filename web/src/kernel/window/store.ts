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
 * PERSISTENCE: Window state is persisted to the backend SQLite database
 * using INCREMENTAL per-window CRUD operations:
 *   - Add window → POST /api/settings/windows
 *   - Update window → PUT /api/settings/windows/{id} (debounced per-window)
 *   - Remove window → DELETE /api/settings/windows/{id}
 */

import { create } from 'zustand'
import { apiClient } from '@/infra/api'
import type { WindowStateDTO } from '@/infra/api/types'
import { createLogger } from '@/infra/logger'
import type { WindowInstance } from './types'

const logger = createLogger('kernel/window/store')

/** Debounce interval for per-window sync. */
const SYNC_DEBOUNCE_MS = 500

/** Per-window debounce timers for incremental sync. */
const _syncTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Convert a single frontend WindowInstance to backend WindowStateDTO */
function toBackendState(w: WindowInstance): WindowStateDTO {
  return {
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
  }
}

/** Debounced sync of a single window's state to backend. */
function syncWindowToBackend(win: WindowInstance) {
  const existing = _syncTimers.get(win.id)
  if (existing) clearTimeout(existing)

  _syncTimers.set(
    win.id,
    setTimeout(() => {
      _syncTimers.delete(win.id)
      apiClient.updateWindowState(win.id, toBackendState(win)).catch(err => {
        logger.warn(`Failed to sync window ${win.id} to backend`, err)
      })
    }, SYNC_DEBOUNCE_MS)
  )
}

function getWindowStatus(win: WindowInstance): WindowStateDTO['status'] {
  return win.isMinimized ? 'minimized' : win.isFocused ? 'active' : 'blurred'
}

function didPersistenceRelevantStateChange(prev: WindowInstance, next: WindowInstance): boolean {
  return (
    prev.zIndex !== next.zIndex ||
    prev.isFocused !== next.isFocused ||
    prev.isMinimized !== next.isMinimized ||
    getWindowStatus(prev) !== getWindowStatus(next)
  )
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
    set(state => ({
      windows: [...state.windows.map(w => ({ ...w, isFocused: false })), win],
      nextZIndex: state.nextZIndex + 1
    }))
    // Immediate POST for new window
    apiClient.createWindowState(toBackendState(win)).catch(err => {
      logger.warn(`Failed to create window state ${win.id}`, err)
    })
  },

  _removeWindow(id) {
    // Cancel any pending sync for this window
    const timer = _syncTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      _syncTimers.delete(id)
    }

    set(state => {
      const remaining = state.windows.filter(w => w.id !== id)
      let windows: WindowInstance[]
      if (remaining.length > 0) {
        const top = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
        windows = remaining.map(w => ({ ...w, isFocused: w.id === top.id }))
      } else {
        windows = remaining
      }
      return { windows }
    })
    // Immediate DELETE
    apiClient.deleteWindowState(id).catch(err => {
      logger.warn(`Failed to delete window state ${id}`, err)
    })
  },

  _focusWindow(id, nextZ) {
    const prevWindows = get().windows
    let nextWindows: WindowInstance[] = prevWindows

    set(state => {
      nextWindows = state.windows.map(w =>
        w.id === id ? { ...w, isFocused: true, zIndex: nextZ, isMinimized: false } : { ...w, isFocused: false }
      )
      return { windows: nextWindows, nextZIndex: nextZ + 1 }
    })

    for (const nextWindow of nextWindows) {
      const prevWindow = prevWindows.find(window => window.id === nextWindow.id)
      if (prevWindow && didPersistenceRelevantStateChange(prevWindow, nextWindow)) {
        syncWindowToBackend(nextWindow)
      }
    }
  },

  _minimizeWindow(id) {
    set(state => ({
      windows: state.windows.map(w => (w.id === id ? { ...w, isMinimized: true, isFocused: false } : w))
    }))
    const win = get().windows.find(w => w.id === id)
    if (win) syncWindowToBackend(win)
  },

  _restoreWindowState(id) {
    set(state => ({
      windows: state.windows.map(w => (w.id === id ? { ...w, isMinimized: false } : w))
    }))
    const win = get().windows.find(w => w.id === id)
    if (win) syncWindowToBackend(win)
  },

  _toggleMaximize(id) {
    set(state => ({
      windows: state.windows.map(w => {
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
    }))
    const win = get().windows.find(w => w.id === id)
    if (win) syncWindowToBackend(win)
  },

  _setProcessId(windowId, pid) {
    set(state => ({
      windows: state.windows.map(w => (w.id === windowId ? { ...w, processId: pid } : w))
    }))
  },

  moveWindow(id, x, y) {
    set(state => ({
      windows: state.windows.map(w => (w.id === id ? { ...w, x, y } : w))
    }))
    const win = get().windows.find(w => w.id === id)
    if (win) syncWindowToBackend(win)
  },

  resizeWindow(id, width, height) {
    set(state => ({
      windows: state.windows.map(w => (w.id === id ? { ...w, width, height } : w))
    }))
    const win = get().windows.find(w => w.id === id)
    if (win) syncWindowToBackend(win)
  },

  updateTitle(id, title) {
    set(state => ({
      windows: state.windows.map(w => (w.id === id ? { ...w, title } : w))
    }))
    const win = get().windows.find(w => w.id === id)
    if (win) syncWindowToBackend(win)
  },

  updateAppState(id, appState) {
    set(state => ({
      windows: state.windows.map(w => (w.id === id ? { ...w, appState } : w))
    }))
    const win = get().windows.find(w => w.id === id)
    if (win) syncWindowToBackend(win)
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
