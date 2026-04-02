/**
 * Settings Service
 *
 * Syncs desktop settings with the backend.
 */

import { createLogger } from '@/infra/logger'
import { useSettingsStore } from './store'

const logger = createLogger('services/settings')

export const settingsService = {
  /** Fetch and apply desktop settings from backend. */
  async fetchDesktopSettings(): Promise<void> {
    try {
      await useSettingsStore.getState().loadFromBackend()
    } catch (err) {
      logger.warn('Failed to fetch desktop settings', err)
    }
  },

  /** Persist current desktop settings to backend (now automatic via debounce). */
  async saveDesktopSettings(): Promise<void> {
    // Settings are now auto-synced via debounce on each setter.
    // This method is kept for API compatibility.
    logger.info('Desktop settings auto-sync is active')
  }
}
