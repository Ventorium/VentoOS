/**
 * useAppTheme — Subscribe to system theme changes from within app components.
 *
 * Returns the current resolved theme and provides a callback for when theme changes.
 * Apps can use this to adjust their own UI (e.g. code editor theme, chart colors).
 *
 * Usage:
 *   const theme = useAppTheme()  // 'light' | 'dark'
 *
 *   // Or with change handler:
 *   useAppTheme((mode) => { setEditorTheme(mode === 'dark' ? 'vs-dark' : 'vs') })
 */
import { useEffect, useState } from 'react'
import { systemChannel } from '@/kernel'
import { useSettingsStore } from '@/services/settings'

type ThemeMode = 'light' | 'dark'

/**
 * Returns the current resolved theme mode and re-renders when system theme changes.
 * Optionally accepts an onChange callback invoked on every theme-change event.
 */
export function useAppTheme(onChange?: (mode: ThemeMode) => void): ThemeMode {
  const resolvedTheme = useSettingsStore(s => s.resolvedTheme) as ThemeMode

  useEffect(() => {
    if (!onChange) return
    return systemChannel.subscribe('theme:changed', ({ mode }) => onChange(mode))
  }, [onChange])

  return resolvedTheme
}
