/**
 * App Menu & Tray Store
 *
 * Runtime registration for app menus and tray icons.
 * Apps call registerAppMenus / registerAppTray at activation time;
 * TopBar and TrayArea subscribe to get the current state.
 */
import { create } from 'zustand'
import type { AppMenuGroup, AppTrayConfig } from './menu'

interface MenuStoreState {
  /** appId → menu groups */
  menus: Map<string, AppMenuGroup[]>
  /** appId → tray config */
  trays: Map<string, AppTrayConfig>

  registerMenus: (appId: string, groups: AppMenuGroup[]) => void
  unregisterMenus: (appId: string) => void
  registerTray: (appId: string, config: AppTrayConfig) => void
  unregisterTray: (appId: string) => void

  getMenus: (appId: string) => AppMenuGroup[]
  getAllTrays: () => Array<{ appId: string; config: AppTrayConfig }>
}

export const useMenuStore = create<MenuStoreState>((set, get) => ({
  menus: new Map(),
  trays: new Map(),

  registerMenus(appId, groups) {
    set(state => {
      const next = new Map(state.menus)
      next.set(appId, groups)
      return { menus: next }
    })
  },

  unregisterMenus(appId) {
    set(state => {
      const next = new Map(state.menus)
      next.delete(appId)
      return { menus: next }
    })
  },

  registerTray(appId, config) {
    set(state => {
      const next = new Map(state.trays)
      next.set(appId, config)
      return { trays: next }
    })
  },

  unregisterTray(appId) {
    set(state => {
      const next = new Map(state.trays)
      next.delete(appId)
      return { trays: next }
    })
  },

  getMenus(appId) {
    return get().menus.get(appId) ?? []
  },

  getAllTrays() {
    return [...get().trays.entries()].map(([appId, config]) => ({ appId, config }))
  }
}))

// ─── Convenience functions ─────────────────────────────────────────────────

export function registerAppMenus(appId: string, groups: AppMenuGroup[]) {
  useMenuStore.getState().registerMenus(appId, groups)
}

export function unregisterAppMenus(appId: string) {
  useMenuStore.getState().unregisterMenus(appId)
}

export function registerAppTray(appId: string, config: AppTrayConfig) {
  useMenuStore.getState().registerTray(appId, config)
}

export function unregisterAppTray(appId: string) {
  useMenuStore.getState().unregisterTray(appId)
}
