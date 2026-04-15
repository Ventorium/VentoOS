/**
 * Settings Store
 *
 * Desktop and system appearance settings, persisted to backend.
 */

import { create } from 'zustand'
import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type DockPosition = 'bottom' | 'left' | 'right'

const logger = createLogger('services/settings/store')

/** Debounce timer for syncing settings to backend. */
let _syncTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_DEBOUNCE_MS = 500

function scheduleSyncToBackend() {
  if (_syncTimer) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => {
    const { wallpaper, themeMode, dockIconSize, dockPosition, dockMagnification, dockAutoHide } =
      useSettingsStore.getState()
    apiClient
      .saveDesktopSettings({
        wallpaper,
        theme_mode: themeMode,
        dock_icon_size: dockIconSize,
        dock_position: dockPosition,
        dock_magnification: dockMagnification,
        dock_auto_hide: dockAutoHide
      })
      .catch(err => {
        logger.warn('Failed to sync settings to backend', err)
      })
  }, SYNC_DEBOUNCE_MS)
}

interface SettingsStore {
  wallpaper: string
  themeMode: ThemeMode
  resolvedTheme: 'light' | 'dark'

  // Dock settings
  dockIconSize: number
  dockPosition: DockPosition
  dockMagnification: boolean
  dockAutoHide: boolean

  setWallpaper: (url: string) => void
  setThemeMode: (mode: ThemeMode) => void
  setResolvedTheme: (theme: 'light' | 'dark') => void
  setDockIconSize: (size: number) => void
  setDockPosition: (pos: DockPosition) => void
  setDockMagnification: (on: boolean) => void
  setDockAutoHide: (on: boolean) => void

  /** Load settings from backend (called once at boot) */
  loadFromBackend: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>()(set => ({
  wallpaper: '/wallpapers/dark-mountain.jpg',
  themeMode: 'dark',
  resolvedTheme: 'dark',

  dockIconSize: 48,
  dockPosition: 'bottom',
  dockMagnification: true,
  dockAutoHide: false,

  setWallpaper(url) {
    set({ wallpaper: url })
    scheduleSyncToBackend()
  },

  setThemeMode(mode) {
    set({ themeMode: mode })
    scheduleSyncToBackend()
  },

  setResolvedTheme(theme) {
    set({ resolvedTheme: theme })
  },

  setDockIconSize(size) {
    set({ dockIconSize: size })
    scheduleSyncToBackend()
  },

  setDockPosition(pos) {
    set({ dockPosition: pos })
    scheduleSyncToBackend()
  },

  setDockMagnification(on) {
    set({ dockMagnification: on })
    scheduleSyncToBackend()
  },

  setDockAutoHide(on) {
    set({ dockAutoHide: on })
    scheduleSyncToBackend()
  },

  async loadFromBackend() {
    try {
      const res = await apiClient.getDesktopSettings()
      const data = res.data
      if (!data) return
      set({
        ...(data.wallpaper ? { wallpaper: data.wallpaper } : {}),
        ...(data.theme_mode ? { themeMode: data.theme_mode as ThemeMode } : {}),
        ...(data.dock_icon_size ? { dockIconSize: data.dock_icon_size } : {}),
        ...(data.dock_position ? { dockPosition: data.dock_position as DockPosition } : {}),
        ...(data.dock_magnification !== undefined ? { dockMagnification: data.dock_magnification } : {}),
        ...(data.dock_auto_hide !== undefined ? { dockAutoHide: data.dock_auto_hide } : {})
      })
      logger.info('Loaded settings from backend')
    } catch (err) {
      logger.warn('Failed to load settings from backend', err)
    }
  }
}))
