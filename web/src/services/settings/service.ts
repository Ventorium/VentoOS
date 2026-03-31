/**
 * Settings Service
 *
 * Syncs desktop settings with the backend.
 */

import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'
import { useSettingsStore } from './store'

const logger = createLogger('services/settings')

export const settingsService = {
  /** Fetch and apply desktop settings from backend. */
  async fetchDesktopSettings(): Promise<void> {
    try {
      const res = await apiClient.getDesktopSettings()
      const data = res.data as Partial<{ wallpaper: string; theme_mode: string }>
      if (data.wallpaper) useSettingsStore.getState().setWallpaper(data.wallpaper)
      if (data.theme_mode) {
        useSettingsStore
          .getState()
          .setThemeMode(data.theme_mode as Parameters<typeof useSettingsStore.getState.prototype.setThemeMode>[0])
      }
    } catch (err) {
      logger.warn('Failed to fetch desktop settings', err)
    }
  },

  /** Persist current desktop settings to backend. */
  async saveDesktopSettings(): Promise<void> {
    const { wallpaper, themeMode } = useSettingsStore.getState()
    try {
      await apiClient.saveDesktopSettings({ wallpaper, theme_mode: themeMode })
      logger.info('Desktop settings saved')
    } catch (err) {
      logger.warn('Failed to save desktop settings', err)
    }
  }
}
