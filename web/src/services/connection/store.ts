/**
 * Connection Store
 *
 * Local cache of connection state.
 * Source of truth is the backend; this is a frontend mirror.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ConnectionType =
  | 'kubernetes'
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'redis'
  | 'ssh'
  | 'sftp'
  | 'ftp'
  | 'smb'
  | 's3'

export interface ConnectionItem {
  id: string
  name: string
  type: ConnectionType
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  host?: string
  port?: number
  config: Record<string, unknown>
  lastConnectedAt?: number
}

interface ConnectionStore {
  connections: ConnectionItem[]

  _setConnections: (connections: ConnectionItem[]) => void
  _addConnection: (conn: ConnectionItem) => void
  _updateConnection: (id: string, updates: Partial<ConnectionItem>) => void
  _removeConnection: (id: string) => void
  setStatus: (id: string, status: ConnectionItem['status']) => void

  getConnection: (id: string) => ConnectionItem | undefined
  getConnectionsByType: (type: ConnectionType) => ConnectionItem[]
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      connections: [],

      _setConnections(connections) {
        set({ connections })
      },

      _addConnection(conn) {
        set(s => ({ connections: [...s.connections, conn] }))
      },

      _updateConnection(id, updates) {
        set(s => ({
          connections: s.connections.map(c => (c.id === id ? { ...c, ...updates } : c)),
        }))
      },

      _removeConnection(id) {
        set(s => ({
          connections: s.connections.filter(c => c.id !== id),
        }))
      },

      setStatus(id, status) {
        set(s => ({
          connections: s.connections.map(c =>
            c.id === id
              ? {
                  ...c,
                  status,
                  lastConnectedAt: status === 'connected' ? Date.now() : c.lastConnectedAt,
                }
              : c,
          ),
        }))
      },

      getConnection(id) {
        return get().connections.find(c => c.id === id)
      },

      getConnectionsByType(type) {
        return get().connections.filter(c => c.type === type)
      },
    }),
    {
      name: 'ventoos-connections',
      partialize: state => ({ connections: state.connections }),
    },
  ),
)
