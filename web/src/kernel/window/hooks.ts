/**
 * Window Hooks
 *
 * React hooks for window state and operations.
 */

import { useCallback } from 'react'
import { closeWindow, focusWindow, minimizeWindow, restoreWindow, toggleMaximize } from './manager'
import { useWindowStore } from './store'
import type { WindowInstance } from './types'

/** Get a single window instance by ID */
export function useWindow(windowId: string): WindowInstance | undefined {
  return useWindowStore(state => state.windows.find(w => w.id === windowId))
}

/** Get all window instances */
export function useWindowList(): WindowInstance[] {
  return useWindowStore(state => state.windows)
}

/** Get the currently focused window */
export function useFocusedWindow(): WindowInstance | undefined {
  return useWindowStore(state => state.windows.find(w => w.isFocused))
}

/** Get all windows belonging to a specific app */
export function useAppWindows(appId: string): WindowInstance[] {
  return useWindowStore(state => state.windows.filter(w => w.appId === appId))
}

/**
 * Hook that provides window management actions for a specific window.
 * Useful inside app components that receive `windowId` as a prop.
 */
export function useWindowActions(windowId: string) {
  const updateTitle = useWindowStore(state => state.updateTitle)
  const updateAppState = useWindowStore(state => state.updateAppState)
  const moveWindow = useWindowStore(state => state.moveWindow)
  const resizeWindow = useWindowStore(state => state.resizeWindow)

  return {
    close: useCallback(() => closeWindow(windowId), [windowId]),
    focus: useCallback(() => focusWindow(windowId), [windowId]),
    minimize: useCallback(() => minimizeWindow(windowId), [windowId]),
    restore: useCallback(() => restoreWindow(windowId), [windowId]),
    toggleMaximize: useCallback(() => toggleMaximize(windowId), [windowId]),
    setTitle: useCallback((title: string) => updateTitle(windowId, title), [windowId, updateTitle]),
    setAppState: useCallback(
      (appState: Record<string, unknown>) => updateAppState(windowId, appState),
      [windowId, updateAppState],
    ),
    move: useCallback((x: number, y: number) => moveWindow(windowId, x, y), [windowId, moveWindow]),
    resize: useCallback(
      (width: number, height: number) => resizeWindow(windowId, width, height),
      [windowId, resizeWindow],
    ),
  }
}
