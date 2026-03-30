/**
 * Window Store
 *
 * Kernel-level Zustand store for window UI state.
 *
 * KEY DESIGN: This store manages ONLY UI state (position, size, focus, z-index).
 * Process lifecycle (spawn/terminate/suspend) is handled by kernel/window/manager.ts,
 * which calls the backend process API. There is NO direct dependency on
 * a frontend process store — the backend owns process truth.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WindowInstance } from './types'

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

  // ── Queries ────────────────────────────────────────────────────────────

  getWindow: (id: string) => WindowInstance | undefined
  getWindowsByApp: (appId: string) => WindowInstance[]
  getFocusedWindow: () => WindowInstance | undefined
}

export const useWindowStore = create<WindowStore>()(
  persist(
    (set, get) => ({
      windows: [],
      nextZIndex: 1,

      _addWindow(win) {
        set(state => ({
          windows: [...state.windows.map(w => ({ ...w, isFocused: false })), win],
          nextZIndex: state.nextZIndex + 1,
        }))
      },

      _removeWindow(id) {
        set(state => {
          const remaining = state.windows.filter(w => w.id !== id)
          if (remaining.length > 0) {
            // Auto-focus the topmost remaining window
            const top = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
            return {
              windows: remaining.map(w => ({ ...w, isFocused: w.id === top.id })),
            }
          }
          return { windows: remaining }
        })
      },

      _focusWindow(id, nextZ) {
        set(state => ({
          windows: state.windows.map(w =>
            w.id === id
              ? { ...w, isFocused: true, zIndex: nextZ, isMinimized: false }
              : { ...w, isFocused: false },
          ),
          nextZIndex: nextZ + 1,
        }))
      },

      _minimizeWindow(id) {
        set(state => ({
          windows: state.windows.map(w =>
            w.id === id ? { ...w, isMinimized: true, isFocused: false } : w,
          ),
        }))
      },

      _restoreWindowState(id) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, isMinimized: false } : w)),
        }))
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
                restoreBounds: undefined,
              }
            }
            return {
              ...w,
              isMaximized: true,
              restoreBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
            }
          }),
        }))
      },

      _setProcessId(windowId, pid) {
        set(state => ({
          windows: state.windows.map(w => (w.id === windowId ? { ...w, processId: pid } : w)),
        }))
      },

      moveWindow(id, x, y) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, x, y } : w)),
        }))
      },

      resizeWindow(id, width, height) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, width, height } : w)),
        }))
      },

      updateTitle(id, title) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, title } : w)),
        }))
      },

      updateAppState(id, appState) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, appState } : w)),
        }))
      },

      getWindow(id) {
        return get().windows.find(w => w.id === id)
      },

      getWindowsByApp(appId) {
        return get().windows.filter(w => w.appId === appId)
      },

      getFocusedWindow() {
        return get().windows.find(w => w.isFocused)
      },
    }),
    {
      name: 'ventoos-windows',
      partialize: state => ({
        windows: state.windows,
        nextZIndex: state.nextZIndex,
      }),
    },
  ),
)
