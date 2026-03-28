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

  addConnection: (conn: Omit<ConnectionItem, 'id' | 'status'>) => string
  updateConnection: (id: string, updates: Partial<ConnectionItem>) => void
  removeConnection: (id: string) => void
  setStatus: (id: string, status: ConnectionItem['status']) => void
  getConnection: (id: string) => ConnectionItem | undefined
  getConnectionsByType: (type: ConnectionType) => ConnectionItem[]
}

let connCounter = 0

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      connections: [],

      addConnection(conn) {
        const id = `conn-${Date.now()}-${++connCounter}`
        const item: ConnectionItem = { ...conn, id, status: 'disconnected' }
        set(s => ({ connections: [...s.connections, item] }))
        return id
      },

      updateConnection(id, updates) {
        set(s => ({
          connections: s.connections.map(c => (c.id === id ? { ...c, ...updates } : c))
        }))
      },

      removeConnection(id) {
        set(s => ({
          connections: s.connections.filter(c => c.id !== id)
        }))
      },

      setStatus(id, status) {
        set(s => ({
          connections: s.connections.map(c =>
            c.id === id
              ? {
                  ...c,
                  status,
                  lastConnectedAt: status === 'connected' ? Date.now() : c.lastConnectedAt
                }
              : c
          )
        }))
      },

      getConnection(id) {
        return get().connections.find(c => c.id === id)
      },

      getConnectionsByType(type) {
        return get().connections.filter(c => c.type === type)
      }
    }),
    {
      name: 'ventoos-connections',
      partialize: state => ({ connections: state.connections })
    }
  )
)
