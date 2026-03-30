/**
 * Settings Store
 *
 * Persisted desktop and system appearance settings.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'auto' | 'light' | 'dark'

interface SettingsStore {
  wallpaper: string
  themeMode: ThemeMode
  resolvedTheme: 'light' | 'dark'

  setWallpaper: (url: string) => void
  setThemeMode: (mode: ThemeMode) => void
  setResolvedTheme: (theme: 'light' | 'dark') => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    set => ({
      wallpaper: '/wallpapers/default.jpg',
      themeMode: 'auto',
      resolvedTheme: 'light',

      setWallpaper(url) {
        set({ wallpaper: url })
      },

      setThemeMode(mode) {
        set({ themeMode: mode })
      },

      setResolvedTheme(theme) {
        set({ resolvedTheme: theme })
      },
    }),
    {
      name: 'ventoos-settings',
      partialize: state => ({
        wallpaper: state.wallpaper,
        themeMode: state.themeMode,
      }),
    },
  ),
)
