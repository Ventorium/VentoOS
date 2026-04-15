/**
 * Kubernetes App — Main Zustand Store
 *
 * Manages tabs, detail drawer, bottom panel, and layout state.
 */

import { create } from 'zustand'
import type { K8sResource, K8sResourceKind, K8sTab } from '../types'
import { getResourceDef } from '../utils/resource-registry'
import {
  DEFAULT_BOTTOM_HEIGHT,
  DEFAULT_DRAWER_WIDTH,
  MAX_DRAWER_WIDTH_PCT,
  MIN_BOTTOM_HEIGHT,
  MIN_DRAWER_WIDTH,
} from '../constants'

interface KubernetesStore {
  // Tabs
  tabs: K8sTab[]
  activeTabId: string | null
  openTab: (clusterId: string, namespace: string, kind: K8sResourceKind, options?: { reuse?: boolean; isPreview?: boolean }) => string
  pinTab: (id: string) => void
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  closeTabsToTheRight: (id: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  setActiveTab: (id: string) => void
  getActiveTab: () => K8sTab | null

  // Sidebar sync
  sidebarExpandedClusters: Set<string>
  toggleSidebarCluster: (clusterId: string) => void
  expandSidebarCluster: (clusterId: string) => void

  // Detail drawer
  detailOpen: boolean
  detailWidth: number
  detailResource: K8sResource | null
  detailActiveTab: string
  openDetailDrawer: (resource: K8sResource, defaultTab?: string) => void
  closeDetailDrawer: () => void
  setDetailWidth: (w: number) => void
  setDetailActiveTab: (tab: string) => void

  // Bottom panel
  bottomPanelOpen: boolean
  bottomPanelHeight: number
  toggleBottomPanel: () => void
  setBottomPanelHeight: (h: number) => void
  openBottomPanel: () => void
}

function makeTabId(clusterId: string, namespace: string, kind: K8sResourceKind): string {
  return `${clusterId}::${namespace}::${kind}`
}

function makeTabTitle(kind: K8sResourceKind, clusterName?: string): string {
  const def = getResourceDef(kind)
  return clusterName ? `${def.pluralLabel} — ${clusterName}` : def.pluralLabel
}

export const useKubernetesStore = create<KubernetesStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab(clusterId, namespace, kind, options = {}) {
    const { reuse = true, isPreview = false } = options
    const { tabs } = get()
    const existing = tabs.find(t => t.clusterId === clusterId && t.namespace === namespace && t.kind === kind)
    if (reuse && existing) {
      // If opening permanently and tab is currently preview, pin it
      if (!isPreview && existing.isPreview) {
        set({ tabs: tabs.map(t => t.id === existing.id ? { ...t, isPreview: false } : t), activeTabId: existing.id })
      } else {
        set({ activeTabId: existing.id })
      }
      get().expandSidebarCluster(clusterId)
      return existing.id
    }

    if (isPreview) {
      // Replace existing preview tab in-place, or create a new one
      const previewTab = tabs.find(t => t.isPreview)
      if (previewTab) {
        const updatedTab: K8sTab = {
          id: previewTab.id,
          clusterId,
          namespace,
          kind,
          title: makeTabTitle(kind),
          isPreview: true,
        }
        set({ tabs: tabs.map(t => t.id === previewTab.id ? updatedTab : t), activeTabId: previewTab.id })
        get().expandSidebarCluster(clusterId)
        return previewTab.id
      }
    }

    const id = `${makeTabId(clusterId, namespace, kind)}::${Date.now()}`
    const newTab: K8sTab = {
      id,
      clusterId,
      namespace,
      kind,
      title: makeTabTitle(kind),
      isPreview,
    }
    set({ tabs: [...tabs, newTab], activeTabId: id })
    get().expandSidebarCluster(clusterId)
    return id
  },

  pinTab(id) {
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, isPreview: false } : t) }))
  },

  closeTab(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === id)
    if (idx === -1) return
    const nextTabs = tabs.filter(t => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      nextActive = nextTabs[idx]?.id ?? nextTabs[idx - 1]?.id ?? nextTabs[0]?.id ?? null
    }
    set({ tabs: nextTabs, activeTabId: nextActive })
  },

  closeOtherTabs(id) {
    const { tabs } = get()
    const keep = tabs.find(t => t.id === id)
    if (!keep) return
    set({ tabs: [keep], activeTabId: keep.id })
  },

  closeTabsToTheRight(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === id)
    if (idx === -1) return
    const nextTabs = tabs.slice(0, idx + 1)
    let nextActive = activeTabId
    if (activeTabId && !nextTabs.find(t => t.id === activeTabId)) {
      nextActive = nextTabs[nextTabs.length - 1]?.id ?? null
    }
    set({ tabs: nextTabs, activeTabId: nextActive })
  },

  reorderTabs(fromIndex, toIndex) {
    const { tabs } = get()
    if (fromIndex === toIndex) return
    const next = [...tabs]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    set({ tabs: next })
  },

  setActiveTab(id) {
    set({ activeTabId: id })
    const tab = get().tabs.find(t => t.id === id)
    if (tab) get().expandSidebarCluster(tab.clusterId)
  },

  getActiveTab() {
    const { tabs, activeTabId } = get()
    return tabs.find(t => t.id === activeTabId) ?? null
  },

  sidebarExpandedClusters: new Set(),

  toggleSidebarCluster(clusterId) {
    set(s => {
      const next = new Set(s.sidebarExpandedClusters)
      if (next.has(clusterId)) next.delete(clusterId)
      else next.add(clusterId)
      return { sidebarExpandedClusters: next }
    })
  },

  expandSidebarCluster(clusterId) {
    set(s => {
      const next = new Set(s.sidebarExpandedClusters)
      next.add(clusterId)
      return { sidebarExpandedClusters: next }
    })
  },

  detailOpen: false,
  detailWidth: window.innerWidth * DEFAULT_DRAWER_WIDTH,
  detailResource: null,
  detailActiveTab: 'summary',

  openDetailDrawer(resource, defaultTab = 'summary') {
    set({ detailOpen: true, detailResource: resource, detailActiveTab: defaultTab })
  },

  closeDetailDrawer() {
    set({ detailOpen: false })
  },

  setDetailWidth(w) {
    const max = window.innerWidth * MAX_DRAWER_WIDTH_PCT
    const clamped = Math.max(MIN_DRAWER_WIDTH, Math.min(max, w))
    set({ detailWidth: clamped })
  },

  setDetailActiveTab(tab) {
    set({ detailActiveTab: tab })
  },

  bottomPanelOpen: false,
  bottomPanelHeight: window.innerHeight * DEFAULT_BOTTOM_HEIGHT,

  toggleBottomPanel() {
    set(s => ({ bottomPanelOpen: !s.bottomPanelOpen }))
  },

  openBottomPanel() {
    set({ bottomPanelOpen: true })
  },

  setBottomPanelHeight(h) {
    set({ bottomPanelHeight: Math.max(MIN_BOTTOM_HEIGHT, h) })
  },
}))
