import { beforeEach, describe, expect, it, vi } from 'vitest'
import { k8sApi } from '../api'
import { useClusterStore } from '../stores/cluster-store'

vi.mock('../api', () => ({
  k8sApi: {
    getK8sClusters: vi.fn(),
    getK8sNamespaces: vi.fn()
  }
}))

describe('ClusterStore', () => {
  beforeEach(() => {
    useClusterStore.setState({
      clusters: [],
      connections: {},
      loading: false,
      error: null
    })
  })

  it('adds a cluster and initializes connection state', () => {
    const { addCluster } = useClusterStore.getState()
    addCluster({ id: 'c1', name: 'test-cluster', context_name: 'ctx1' })
    const state = useClusterStore.getState()
    expect(state.clusters).toHaveLength(1)
    expect(state.clusters[0].name).toBe('test-cluster')
  })

  it('removes a cluster and its connection state', () => {
    const { addCluster, removeCluster } = useClusterStore.getState()
    addCluster({ id: 'c1', name: 'test-cluster', context_name: 'ctx1' })
    removeCluster('c1')
    const state = useClusterStore.getState()
    expect(state.clusters).toHaveLength(0)
    expect(state.connections['c1']).toBeUndefined()
  })

  it('sets cluster status', () => {
    const { addCluster, setClusterStatus } = useClusterStore.getState()
    addCluster({ id: 'c1', name: 'test-cluster', context_name: 'ctx1' })
    setClusterStatus('c1', 'connected')
    expect(useClusterStore.getState().clusters[0].status).toBe('connected')
  })
})
