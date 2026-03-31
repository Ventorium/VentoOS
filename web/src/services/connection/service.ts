/**
 * Connection Service
 *
 * CRUD operations for connections. Calls the backend API and updates the local store.
 */

import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'
import type { ConnectionStatusPayload } from '@/infra/ws'
import { wsClient } from '@/infra/ws'
import { systemChannel } from '@/kernel/channel'
import type { ConnectionItem } from './store'
import { useConnectionStore } from './store'

const logger = createLogger('services/connection')

export const connectionService = {
  /** Fetch all connections from backend and sync local cache. */
  async fetchConnections(): Promise<ConnectionItem[]> {
    const res = await apiClient.getConnections()
    const connections = res.data as ConnectionItem[]
    useConnectionStore.getState()._setConnections(connections)
    return connections
  },

  /** Create a new connection. */
  async createConnection(conn: Omit<ConnectionItem, 'id' | 'status'>): Promise<ConnectionItem> {
    const res = await apiClient.createConnection(conn)
    const created = res.data as ConnectionItem
    useConnectionStore.getState()._addConnection(created)
    logger.info('Connection created', { id: created.id })
    return created
  },

  /** Remove a connection by ID. */
  async removeConnection(id: string): Promise<void> {
    // Backend call would go here when implemented
    useConnectionStore.getState()._removeConnection(id)
    logger.info('Connection removed', { id })
  },

  /** Update a connection's local status. */
  setStatus(id: string, status: ConnectionItem['status']): void {
    useConnectionStore.getState().setStatus(id, status)
  },

  /**
   * Subscribe to connection status updates from the backend WebSocket.
   * Returns a cleanup function.
   */
  listenToStatusUpdates(): () => void {
    return wsClient.on('ConnectionStatus', (data: ConnectionStatusPayload) => {
      useConnectionStore.getState().setStatus(data.connection_id, data.status as ConnectionItem['status'])
      systemChannel.notify('connection:status-changed', {
        connectionId: data.connection_id,
        status: data.status
      })
    })
  }
}
