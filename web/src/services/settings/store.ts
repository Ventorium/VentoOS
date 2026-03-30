/**
 * Settings Store
 *
 * Persisted desktop and system appearance settings.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type DockPosition = 'bottom' | 'left' | 'right'

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
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    set => ({
      wallpaper: '/wallpapers/dark-aurora.jpg',
      themeMode: 'dark',
      resolvedTheme: 'dark',

      dockIconSize: 48,
      dockPosition: 'bottom',
      dockMagnification: true,
      dockAutoHide: false,

      setWallpaper(url) {
        set({ wallpaper: url })
      },

      setThemeMode(mode) {
        set({ themeMode: mode })
      },

      setResolvedTheme(theme) {
        set({ resolvedTheme: theme })
      },

      setDockIconSize(size) {
        set({ dockIconSize: size })
      },

      setDockPosition(pos) {
        set({ dockPosition: pos })
      },

      setDockMagnification(on) {
        set({ dockMagnification: on })
      },

      setDockAutoHide(on) {
        set({ dockAutoHide: on })
      },
    }),
    {
      name: 'ventoos-settings',
      partialize: state => ({
        wallpaper: state.wallpaper,
        themeMode: state.themeMode,
        dockIconSize: state.dockIconSize,
        dockPosition: state.dockPosition,
        dockMagnification: state.dockMagnification,
        dockAutoHide: state.dockAutoHide,
      }),
    },
  ),
)
