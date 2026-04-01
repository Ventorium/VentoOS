/**
 * Kernel Bootstrap
 *
 * Initializes the frontend kernel at application startup.
 * Should be called once before rendering the React tree.
 */

import { configureApiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'
import { wsClient } from '@/infra/ws'

const logger = createLogger('kernel/bootstrap')

/**
 * Bootstrap the kernel.
 *
 * @param tokenProvider   Function that returns the current auth token (or null)
 * @param onUnauthorized  Called when the backend returns 401
 */
export function bootKernel(opts: { tokenProvider: () => string | null; onUnauthorized: () => void }): () => void {
  logger.info('Booting kernel...')

  // Configure the API client with auth callbacks
  configureApiClient({
    tokenProvider: opts.tokenProvider,
    onUnauthorized: opts.onUnauthorized
  })

  // Configure WebSocket with token provider (actual connection deferred until auth validated)
  wsClient.setTokenProvider(opts.tokenProvider)

  logger.info('Kernel booted')

  // Return cleanup function (for HMR / tests)
  return () => {
    wsClient.disconnect()
  }
}
