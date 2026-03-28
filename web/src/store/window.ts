import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useProcessStore } from './process'

export interface WindowInstance {
  id: string
  appId: string
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  isMaximized: boolean
  isMinimized: boolean
  isFocused: boolean
  /** Restore position/size before maximize */
  restoreBounds?: { x: number; y: number; width: number; height: number }
  /** Application-level state serialized as JSON */
  appState?: Record<string, unknown>
}

interface WindowStore {
  windows: WindowInstance[]
  nextZIndex: number

  /** Open a new window for an app */
  openWindow: (appId: string, title: string, options?: Partial<WindowInstance>) => string
  /** Close a window */
  closeWindow: (id: string) => void
  /** Focus a window (bring to front) */
  focusWindow: (id: string) => void
  /** Minimize a window */
  minimizeWindow: (id: string) => void
  /** Restore a minimized window */
  restoreWindow: (id: string) => void
  /** Toggle maximize/restore */
  toggleMaximize: (id: string) => void
  /** Move a window */
  moveWindow: (id: string, x: number, y: number) => void
  /** Resize a window */
  resizeWindow: (id: string, width: number, height: number) => void
  /** Update window title */
  updateTitle: (id: string, title: string) => void
  /** Update window app state */
  updateAppState: (id: string, state: Record<string, unknown>) => void
  /** Get all windows for an app */
  getWindowsByApp: (appId: string) => WindowInstance[]
  /** Get the focused window */
  getFocusedWindow: () => WindowInstance | undefined
  /** Close all windows */
  closeAllWindows: () => void
}

let idCounter = 0
function generateWindowId(): string {
  return `win-${Date.now()}-${++idCounter}`
}

export const useWindowStore = create<WindowStore>()(
  persist(
    (set, get) => ({
      windows: [],
      nextZIndex: 1,

      openWindow(appId, title, options) {
        const id = generateWindowId()
        const { nextZIndex, windows } = get()

        // Calculate cascading position
        const offset = (windows.length % 10) * 26
        const newWindow: WindowInstance = {
          id,
          appId,
          title,
          x: options?.x ?? 120 + offset,
          y: options?.y ?? 80 + offset,
          width: options?.width ?? 1000,
          height: options?.height ?? 680,
          zIndex: nextZIndex,
          isMaximized: false,
          isMinimized: false,
          isFocused: true,
          appState: options?.appState
        }

        set(state => ({
          windows: [...state.windows.map(w => ({ ...w, isFocused: false })), newWindow],
          nextZIndex: nextZIndex + 1
        }))

        // Spawn a system process for this window
        useProcessStore.getState().spawn(id, appId)

        return id
      },

      closeWindow(id) {
        useProcessStore.getState().terminate(id)

        set(state => {
          const remaining = state.windows.filter(w => w.id !== id)
          // Focus the topmost remaining window
          if (remaining.length > 0) {
            const topWindow = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
            return {
              windows: remaining.map(w => ({
                ...w,
                isFocused: w.id === topWindow.id
              }))
            }
          }
          return { windows: remaining }
        })
      },

      focusWindow(id) {
        useProcessStore.getState().activate(id)

        // Background all other processes
        const { windows } = get()
        for (const w of windows) {
          if (w.id !== id) {
            useProcessStore.getState().toBackground(w.id)
          }
        }

        set(state => {
          const nextZ = state.nextZIndex
          return {
            windows: state.windows.map(w =>
              w.id === id ? { ...w, isFocused: true, zIndex: nextZ, isMinimized: false } : { ...w, isFocused: false }
            ),
            nextZIndex: nextZ + 1
          }
        })
      },

      minimizeWindow(id) {
        // Suspend the process when minimized
        useProcessStore.getState().suspend(id)

        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, isMinimized: true, isFocused: false } : w))
        }))

        // Focus the next topmost window
        const { windows } = get()
        const remaining = windows.filter(w => w.id !== id && !w.isMinimized)
        if (remaining.length > 0) {
          const topWindow = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
          get().focusWindow(topWindow.id)
        }
      },

      restoreWindow(id) {
        const { focusWindow } = get()
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, isMinimized: false } : w))
        }))
        focusWindow(id)
      },

      toggleMaximize(id) {
        set(state => ({
          windows: state.windows.map(w => {
            if (w.id !== id) return w
            if (w.isMaximized) {
              // Restore from saved bounds
              return {
                ...w,
                isMaximized: false,
                ...(w.restoreBounds ?? {}),
                restoreBounds: undefined
              }
            }
            // Save current bounds before maximizing
            return {
              ...w,
              isMaximized: true,
              restoreBounds: { x: w.x, y: w.y, width: w.width, height: w.height }
            }
          })
        }))
      },

      moveWindow(id, x, y) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, x, y } : w))
        }))
      },

      resizeWindow(id, width, height) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, width, height } : w))
        }))
      },

      updateTitle(id, title) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, title } : w))
        }))
      },

      updateAppState(id, appState) {
        set(state => ({
          windows: state.windows.map(w => (w.id === id ? { ...w, appState } : w))
        }))
      },

      getWindowsByApp(appId) {
        return get().windows.filter(w => w.appId === appId)
      },

      getFocusedWindow() {
        return get().windows.find(w => w.isFocused)
      },

      closeAllWindows() {
        set({ windows: [], nextZIndex: 1 })
      }
    }),
    {
      name: 'ventoos-windows',
      partialize: state => ({
        windows: state.windows,
        nextZIndex: state.nextZIndex
      })
    }
  )
)
