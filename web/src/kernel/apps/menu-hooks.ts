/**
 * App Menu Hooks
 *
 * React hooks for consuming menu and tray registrations.
 */
import { useMemo } from 'react'
import { useWindowStore } from '../window/store'
import type { AppMenuGroup, AppTrayConfig } from './menu'
import { useMenuStore } from './menu-store'

const EMPTY_MENUS: AppMenuGroup[] = []

const selectAppMenus = (appId: string | null) => (state: { menus: Map<string, AppMenuGroup[]> }) =>
  appId ? (state.menus.get(appId) ?? EMPTY_MENUS) : EMPTY_MENUS

/** Menus registered for a specific app */
export function useAppMenus(appId: string | null): AppMenuGroup[] {
  return useMenuStore(selectAppMenus(appId))
}

/** Menus for the currently focused window.
 *  Looks up by window instance ID first (per-window menus registered via windowId),
 *  then falls back to appId (shared menus registered by appId). */
export function useActiveAppMenus(): AppMenuGroup[] {
  // Use two separate primitive selectors to avoid creating new objects each render
  const focusedWinId = useWindowStore(s => s.windows.find(w => w.isFocused)?.id ?? null)
  const focusedAppId = useWindowStore(s => s.windows.find(w => w.isFocused)?.appId ?? null)
  // Capture in stable vars for the menu selector closure
  const winId = focusedWinId
  const appId = focusedAppId
  return useMenuStore(s => {
    if (winId) {
      const byWin = s.menus.get(winId)
      if (byWin) return byWin
    }
    return appId ? (s.menus.get(appId) ?? EMPTY_MENUS) : EMPTY_MENUS
  })
}

/** All registered tray icons */
export function useAllTrays(): Array<{ appId: string; config: AppTrayConfig }> {
  const trays = useMenuStore(s => s.trays)
  return useMemo(() => [...trays.entries()].map(([appId, config]) => ({ appId, config })), [trays])
}

/** Tray for a specific app */
export function useAppTray(appId: string): AppTrayConfig | undefined {
  return useMenuStore(s => s.trays.get(appId) as AppTrayConfig | undefined)
}
