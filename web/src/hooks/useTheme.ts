import { useEffect } from 'react'
import { systemChannel } from '@/kernel'
import { useSettingsStore } from '@/services/settings'
import { darkTheme, lightTheme, type ThemeColors } from '@/theme'

function applyThemeVars(theme: ThemeColors) {
  const root = document.documentElement
  const set = (k: string, v: string) => root.style.setProperty(k, v)
  set('--vos-bg-desktop', theme.bg.desktop)
  set('--vos-bg-surface', theme.bg.surface)
  set('--vos-bg-surface-hover', theme.bg.surfaceHover)
  set('--vos-bg-overlay', theme.bg.overlay)
  set('--vos-bg-topbar', theme.bg.topBar)
  set('--vos-bg-dock', theme.bg.dock)
  set('--vos-bg-window', theme.bg.window)
  set('--vos-bg-window-active', theme.bg.windowActive)
  set('--vos-bg-input', theme.bg.input)
  set('--vos-text-primary', theme.text.primary)
  set('--vos-text-secondary', theme.text.secondary)
  set('--vos-text-tertiary', theme.text.tertiary)
  set('--vos-text-inverse', theme.text.inverse)
  set('--vos-border-default', theme.border.default)
  set('--vos-border-subtle', theme.border.subtle)
  set('--vos-border-strong', theme.border.strong)
  set('--vos-accent-primary', theme.accent.primary)
  set('--vos-accent-success', theme.accent.success)
  set('--vos-accent-warning', theme.accent.warning)
  set('--vos-accent-danger', theme.accent.danger)
  set('--vos-accent-info', theme.accent.info)
  set('--vos-tl-close', theme.trafficLight.close)
  set('--vos-tl-minimize', theme.trafficLight.minimize)
  set('--vos-tl-maximize', theme.trafficLight.maximize)
  set('--vos-tl-inactive', theme.trafficLight.inactive)
  // New tokens from OS layer
  set('--vos-bg-window-title', theme.bg.windowTitle)
  set('--vos-bg-context-menu', theme.bg.contextMenu)
  set('--vos-bg-selection', theme.bg.selection)
  set('--vos-bg-item-hover', theme.bg.itemHover)
  set('--vos-bg-launchpad', theme.bg.launchpad)
  // Elevated / hover / selected aliases used across apps
  set('--vos-bg-elevated', theme.bg.windowActive)
  set('--vos-bg-hover', theme.bg.itemHover)
  set('--vos-bg-selected', theme.bg.selection)
  // Tertiary background alias (used by API Client and other apps)
  set('--vos-bg-tertiary', theme.bg.surfaceHover)
}

/**
 * Syncs the desktop store's theme mode with CSS custom properties on :root.
 * Call once at the app root.
 */
export function useThemeSync() {
  const themeMode = useSettingsStore(s => s.themeMode)
  const setResolvedTheme = useSettingsStore(s => s.setResolvedTheme)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const update = () => {
      const prefersDark = mediaQuery.matches
      const resolved = themeMode === 'auto' ? (prefersDark ? 'dark' : 'light') : themeMode
      const colors = resolved === 'dark' ? darkTheme : lightTheme

      document.documentElement.classList.toggle('dark', resolved === 'dark')
      applyThemeVars(colors)
      setResolvedTheme(resolved)
      // Broadcast theme change to all subscribers (apps, components)
      systemChannel.notify('theme:changed', { mode: resolved as 'light' | 'dark' })
    }

    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [themeMode, setResolvedTheme])
}
