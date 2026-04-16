/**
 * Kubernetes App — Cluster Store
 *
 * Manages cluster list, per-cluster connection state, and namespace cache.
 */

import { create } from 'zustand'
import type { K8sCluster, K8sNamespace } from '../types'
import type { UpdateK8sClusterReq } from '../api'
import { k8sApi } from '../api'

interface ClusterConnectionState {
  connected: boolean
  connecting: boolean
  error: string | null
  namespaces: K8sNamespace[]
  namespaceLoading: boolean
  namespaceError: string | null
}

interface ClusterStore {
  clusters: K8sCluster[]
  connections: Record<string, ClusterConnectionState>
  loading: boolean
  error: string | null

  loadClusters: () => Promise<void>
  addCluster: (cluster: K8sCluster) => void
  removeCluster: (id: string) => void
  updateCluster: (id: string, req: UpdateK8sClusterReq) => Promise<K8sCluster | null>
  connectCluster: (id: string) => Promise<void>
  disconnectCluster: (id: string) => void
  fetchNamespaces: (id: string) => Promise<K8sNamespace[]>
  getClusterNamespaces: (id: string) => K8sNamespace[]
  setClusterStatus: (id: string, status: K8sCluster['status']) => void
}

function defaultConnectionState(): ClusterConnectionState {
  return {
    connected: false,
    connecting: false,
    error: null,
    namespaces: [],
    namespaceLoading: false,
    namespaceError: null,
  }
}

export const useClusterStore = create<ClusterStore>((set, get) => ({
  clusters: [],
  connections: {},
  loading: false,
  error: null,

  async loadClusters() {
    set({ loading: true, error: null })
    try {
      const res = await k8sApi.getK8sClusters()
      const data = res.data ?? []
      set({ clusters: data })
      // Do NOT auto-connect — user must explicitly double-click to connect
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载集群失败' })
    } finally {
      set({ loading: false })
    }
  },

  addCluster(cluster) {
    set(s => ({ clusters: [...s.clusters, cluster] }))
    // Auto-connect newly added cluster
    get().connectCluster(cluster.id)
  },

  async updateCluster(id, req) {
    try {
      const res = await k8sApi.updateK8sCluster(id, req)
      const updated = res.data
      set(s => ({ clusters: s.clusters.map(c => c.id === id ? updated : c) }))
      return updated
    } catch {
      return null
    }
  },

  async connectCluster(id) {
    set(s => ({
      connections: {
        ...s.connections,
        [id]: { ...(s.connections[id] ?? defaultConnectionState()), connecting: true, namespaceError: null },
      },
    }))
    await get().fetchNamespaces(id)
  },

  disconnectCluster(id) {
    set(s => ({
      connections: {
        ...s.connections,
        [id]: defaultConnectionState(),
      },
    }))
  },

  removeCluster(id) {
    set(s => {
      const nextClusters = s.clusters.filter(c => c.id !== id)
      const nextConnections = { ...s.connections }
      delete nextConnections[id]
      return { clusters: nextClusters, connections: nextConnections }
    })
  },

  async fetchNamespaces(id) {
    set(s => ({
      connections: {
        ...s.connections,
        [id]: { ...(s.connections[id] ?? defaultConnectionState()), namespaceLoading: true, namespaceError: null },
      },
    }))
    try {
      const res = await k8sApi.getK8sNamespaces(id)
      const namespaces = res.data ?? []
      set(s => ({
        connections: {
          ...s.connections,
          [id]: {
            ...(s.connections[id] ?? defaultConnectionState()),
            connected: true,
            connecting: false,
            namespaces,
            namespaceLoading: false,
          },
        },
      }))
      return namespaces
    } catch (e) {
      const err = e instanceof Error ? e.message : '加载命名空间失败'
      set(s => ({
        connections: {
          ...s.connections,
          [id]: {
            ...(s.connections[id] ?? defaultConnectionState()),
            connected: false,
            namespaceLoading: false,
            namespaceError: err,
          },
        },
      }))
      return []
    }
  },

  getClusterNamespaces(id) {
    return get().connections[id]?.namespaces ?? []
  },

  setClusterStatus(id, status) {
    set(s => ({
      clusters: s.clusters.map(c => (c.id === id ? { ...c, status } : c)),
    }))
  },
}))
