import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'auto' | 'light' | 'dark'

interface DesktopStore {
  wallpaper: string
  themeMode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setWallpaper: (url: string) => void
  setThemeMode: (mode: ThemeMode) => void
  setResolvedTheme: (theme: 'light' | 'dark') => void
}

export const useDesktopStore = create<DesktopStore>()(
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
      }
    }),
    {
      name: 'ventoos-desktop',
      partialize: state => ({
        wallpaper: state.wallpaper,
        themeMode: state.themeMode
      })
    }
  )
)
