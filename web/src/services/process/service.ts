/**
 * Process Service
 *
 * Frontend proxy for the backend ProcessManager.
 * Provides typed access to backend process operations.
 * Integrates with the SystemChannel to propagate process lifecycle events.
 */

import { apiClient } from '@/infra/api'
import type { VProcess } from '@/infra/api'
import { wsClient } from '@/infra/ws'
import type { ProcessUpdatePayload } from '@/infra/ws'
import { systemChannel } from '@/kernel/channel'
import { createLogger } from '@/infra/logger'

const logger = createLogger('services/process')

export const processService = {
  /** Create a backend process for an opening window. */
  async createProcess(appId: string, windowId: string): Promise<VProcess> {
    const res = await apiClient.createProcess({ app_id: appId, window_id: windowId })
    logger.debug('Process created', res.data)
    return res.data
  },

  /** Terminate the backend process for a closing window. */
  async terminateProcess(pid: number): Promise<void> {
    await apiClient.terminateProcess(pid)
    logger.debug('Process terminated', { pid })
  },

  /** Suspend process (window minimized). */
  async suspendProcess(pid: number): Promise<void> {
    await apiClient.suspendProcess(pid)
    logger.debug('Process suspended', { pid })
  },

  /** Resume process (window restored). */
  async resumeProcess(pid: number): Promise<void> {
    await apiClient.resumeProcess(pid)
    logger.debug('Process resumed', { pid })
  },

  /** List all active processes. */
  async listProcesses(): Promise<VProcess[]> {
    const res = await apiClient.getProcesses()
    return res.data
  },

  /**
   * Start listening to process update events from the backend WebSocket.
   * Returns a cleanup function.
   */
  listenToProcessUpdates(): () => void {
    return wsClient.on('ProcessUpdate', (data: ProcessUpdatePayload) => {
      if (data.status === 'terminated') {
        systemChannel.notify('process:terminated', {
          pid: data.pid,
          windowId: data.window_id,
        })
      } else if (data.status === 'suspended') {
        systemChannel.notify('process:suspended', {
          pid: data.pid,
          windowId: data.window_id,
        })
      }
    })
  },
}
