import { beforeEach, describe, expect, it } from 'vitest'
import { useKubernetesStore } from '../stores/kubernetes-store'

describe('KubernetesStore', () => {
  beforeEach(() => {
    useKubernetesStore.setState({
      tabs: [],
      activeTabId: null,
      sidebarExpandedClusters: new Set(),
      detailOpen: false,
      detailWidth: window.innerWidth * 0.45,
      detailResource: null,
      detailActiveTab: 'summary',
      bottomPanelOpen: false,
      bottomPanelHeight: window.innerHeight * 0.5,
    })
  })

  it('opens a new tab', () => {
    const { openTab } = useKubernetesStore.getState()
    const id = openTab('c1', 'default', 'pod')
    const state = useKubernetesStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].clusterId).toBe('c1')
    expect(state.tabs[0].namespace).toBe('default')
    expect(state.tabs[0].kind).toBe('pod')
    expect(state.activeTabId).toBe(id)
  })

  it('reuses existing tab when reuse=true', () => {
    const { openTab } = useKubernetesStore.getState()
    const id1 = openTab('c1', 'default', 'pod')
    const id2 = openTab('c1', 'default', 'pod')
    const state = useKubernetesStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(id1).toBe(id2)
  })

  it('closes a tab and activates next', () => {
    const { openTab, closeTab } = useKubernetesStore.getState()
    const id1 = openTab('c1', 'default', 'pod')
    const id2 = openTab('c1', 'default', 'deployment')
    closeTab(id1)
    const state = useKubernetesStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(id2)
  })

  it('reorders tabs', () => {
    const { openTab, reorderTabs } = useKubernetesStore.getState()
    openTab('c1', 'default', 'pod')
    openTab('c1', 'default', 'deployment')
    openTab('c1', 'default', 'service')
    reorderTabs(0, 2)
    const state = useKubernetesStore.getState()
    expect(state.tabs[0].kind).toBe('deployment')
    expect(state.tabs[1].kind).toBe('service')
    expect(state.tabs[2].kind).toBe('pod')
  })

  it('opens detail drawer', () => {
    const { openDetailDrawer } = useKubernetesStore.getState()
    const resource = { name: 'nginx', kind: 'pod' as const, namespace: 'default' }
    openDetailDrawer(resource, 'yaml')
    const state = useKubernetesStore.getState()
    expect(state.detailOpen).toBe(true)
    expect(state.detailResource).toEqual(resource)
    expect(state.detailActiveTab).toBe('yaml')
  })

  it('toggles bottom panel', () => {
    const { toggleBottomPanel } = useKubernetesStore.getState()
    toggleBottomPanel()
    expect(useKubernetesStore.getState().bottomPanelOpen).toBe(true)
    toggleBottomPanel()
    expect(useKubernetesStore.getState().bottomPanelOpen).toBe(false)
  })

  it('expands sidebar cluster', () => {
    const { expandSidebarCluster } = useKubernetesStore.getState()
    expandSidebarCluster('c1')
    expect(useKubernetesStore.getState().sidebarExpandedClusters.has('c1')).toBe(true)
  })
})
