import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from './store'

const { saveDesktopSettings, getDesktopSettings } = vi.hoisted(() => ({
  saveDesktopSettings: vi.fn().mockResolvedValue({}),
  getDesktopSettings: vi.fn()
}))

vi.mock('@/infra/api', () => ({
  apiClient: {
    saveDesktopSettings,
    getDesktopSettings
  }
}))

vi.mock('@/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

describe('settings store accent persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useSettingsStore.setState({
      wallpaper: '/wallpapers/dark-mountain.jpg',
      themeMode: 'dark',
      accentColor: null,
      resolvedTheme: 'dark',
      dockIconSize: 48,
      dockPosition: 'bottom',
      dockMagnification: true,
      dockAutoHide: false
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('syncs accent color changes to backend desktop settings', async () => {
    useSettingsStore.getState().setAccentColor('#FF3B30')

    vi.advanceTimersByTime(500)
    await Promise.resolve()

    expect(saveDesktopSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        accent_color: '#FF3B30'
      })
    )
  })

  it('loads accent color from backend desktop settings', async () => {
    getDesktopSettings.mockResolvedValue({
      data: {
        wallpaper: '/wallpapers/dark-mountain.jpg',
        theme_mode: 'dark',
        accent_color: '#30D158',
        dock_icon_size: 48,
        dock_position: 'bottom',
        dock_magnification: true,
        dock_auto_hide: false
      }
    })

    await useSettingsStore.getState().loadFromBackend()

    expect(useSettingsStore.getState().accentColor).toBe('#30D158')
  })
})
