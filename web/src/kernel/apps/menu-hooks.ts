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
  appId ? state.menus.get(appId) ?? EMPTY_MENUS : EMPTY_MENUS

/** Menus registered for a specific app */
export function useAppMenus(appId: string | null): AppMenuGroup[] {
  return useMenuStore(selectAppMenus(appId))
}

/** Menus for the currently focused window's app */
export function useActiveAppMenus(): AppMenuGroup[] {
  const focusedAppId = useWindowStore(s => s.windows.find(w => w.isFocused)?.appId ?? null)
  return useMenuStore(selectAppMenus(focusedAppId))
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
