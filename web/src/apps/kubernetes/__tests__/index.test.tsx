import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useAppStateSync } = vi.hoisted(() => ({
  useAppStateSync: vi.fn()
}))

vi.mock('@/kernel', () => ({
  useAppStateSync
}))

vi.mock('../components/layout/K8sLayout', () => ({
  K8sLayout: ({ children }: { children: ReactNode }) => <div data-testid="k8s-layout">{children}</div>
}))

vi.mock('../components/overview/ClusterOverview', () => ({
  ClusterOverview: ({ clusterId }: { clusterId: string }) => <div data-testid="cluster-overview">overview:{clusterId}</div>
}))

vi.mock('../components/resource-list/ResourceList', () => ({
  ResourceList: ({ clusterId, namespace, kind }: { clusterId: string; namespace: string; kind: string }) => (
    <div data-testid="resource-list">{`${clusterId}:${namespace}:${kind}`}</div>
  )
}))

import KubernetesApp from '../index'
import { useClusterStore } from '../stores/cluster-store'
import { useKubernetesStore } from '../stores/kubernetes-store'

describe('KubernetesApp workspace restore', () => {
  beforeEach(() => {
    useAppStateSync.mockReset()

    useClusterStore.setState({
      clusters: [{ id: 'c1', name: 'cluster-1', context_name: 'ctx-1' }],
      connections: {},
      lastNamespace: {},
      loading: false,
      error: null,
      loadClusters: vi.fn().mockResolvedValue(undefined)
    })

    useKubernetesStore.setState({
      tabs: [],
      activeTabId: null,
      sidebarExpandedClusters: new Set(),
      detailOpen: false,
      detailWidth: window.innerWidth * 0.45,
      detailResource: null,
      detailActiveTab: 'summary',
      bottomPanelOpen: false,
      bottomPanelHeight: window.innerHeight * 0.5
    })
  })

  it('restores persisted workspace from window app state after cluster load', async () => {
    render(
      <KubernetesApp
        windowId="window-k8s"
        processId={1}
        initialAppState={{
          tabs: [
            {
              id: 'tab-restored',
              clusterId: 'c1',
              namespace: 'default',
              kind: 'deployment',
              title: 'Deployments'
            }
          ],
          activeTabId: 'tab-restored'
        }}
      />
    )

    await waitFor(() => {
      expect(useKubernetesStore.getState().activeTabId).toBe('tab-restored')
    })

    expect(screen.getByTestId('resource-list')).toHaveTextContent('c1:default:deployment')
    expect(useAppStateSync).toHaveBeenCalledWith(
      'window-k8s',
      expect.objectContaining({
        activeTabId: 'tab-restored',
        tabs: expect.arrayContaining([expect.objectContaining({ id: 'tab-restored', clusterId: 'c1' })])
      }),
      expect.any(Array)
    )
  })
})
