/**
 * Auth Service
 *
 * Business logic for authentication: login, logout, password change, status check.
 * Wraps the raw API client + updates the auth store.
 */

import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'
import { wsClient } from '@/infra/ws'
import { useAuthStore } from './store'

const logger = createLogger('services/auth')

export const authService = {
  /** Check initialization and session validity with the backend. */
  async checkStatus(): Promise<{ initialized: boolean }> {
    const res = await apiClient.authStatus()
    useAuthStore.getState().setInitialized(res.data.initialized)
    return { initialized: res.data.initialized }
  },

  /** Set up the system password for the first time. */
  async setup(password: string): Promise<void> {
    await apiClient.authSetup(password)
    logger.info('Auth setup complete')
  },

  /** Login with password. Stores the token on success. */
  async login(password: string): Promise<string> {
    const res = await apiClient.authLogin(password)
    const { token } = res.data
    useAuthStore.getState().unlock(token)
    wsClient.connect()
    logger.info('Logged in')
    return token
  },

  /** Logout: clears token on backend and locks the system. */
  async logout(): Promise<void> {
    try {
      await apiClient.authLogout()
    } catch {
      // Ignore backend errors on logout
    }
    useAuthStore.getState().lock()
    wsClient.disconnect()
    logger.info('Logged out')
  },

  /** Change the system password. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.authChangePassword(currentPassword, newPassword)
    logger.info('Password changed')
  },

  /** Lock the screen immediately (without calling backend). */
  lock(): void {
    useAuthStore.getState().lock()
    logger.info('Screen locked')
  },

  /**
   * Re-validate a stored token with the backend.
   * Locks if token is no longer valid.
   */
  async revalidateToken(): Promise<boolean> {
    const { token } = useAuthStore.getState()
    if (!token) return false
    try {
      await apiClient.health()
      useAuthStore.getState().unlock(token)
      return true
    } catch {
      useAuthStore.getState().lock()
      return false
    }
  }
}
