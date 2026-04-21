/**
 * useAppStateSync
 *
 * Reusable hook for persisting app operational state to the backend.
 * Apps call this with a serializable state object and dependency array;
 * the hook debounced-syncs the state via `updateAppState` to the window_states table.
 *
 * Usage in app components:
 *   useAppStateSync(windowId, { path, selectedNode }, [path, selectedNode])
 *
 * The app should also read `initialAppState` from props to restore state on mount.
 */

import { useEffect } from 'react'
import { useWindowStore } from './store'

export function useAppStateSync(windowId: string, state: Record<string, unknown>, deps: unknown[]) {
  useEffect(() => {
    const timer = setTimeout(() => {
      useWindowStore.getState().updateAppState(windowId, state)
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
