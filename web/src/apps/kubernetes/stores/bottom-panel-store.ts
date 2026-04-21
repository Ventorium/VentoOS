/**
 * Kubernetes App — Bottom Panel Store
 *
 * Manages bottom panel tabs (YAML editor, Logs, Shell).
 */

import { create } from 'zustand'
import type { BottomPanelTab, K8sResourceKind } from '../types'
import { getResourceDef } from '../utils/resource-registry'

interface BottomPanelStore {
  tabs: BottomPanelTab[]
  activeTabId: string | null

  openYamlTab: (clusterId: string, namespace: string, kind: K8sResourceKind, name: string) => string
  openLogsTab: (clusterId: string, namespace: string, podName: string, container?: string) => string
  openShellTab: (clusterId: string, namespace: string, podName: string, container?: string) => string
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  getActiveTab: () => BottomPanelTab | null
}

function makeId(): string {
  return `bp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export const useBottomPanelStore = create<BottomPanelStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openYamlTab(clusterId, namespace, kind, name) {
    const { tabs } = get()
    const id = makeId()
    const def = getResourceDef(kind)
    const tab: BottomPanelTab = {
      id,
      type: 'yaml',
      title: `Edit ${def.label}: ${name}`,
      clusterId,
      namespace,
      kind,
      name
    }
    set({ tabs: [...tabs, tab], activeTabId: id })
    return id
  },

  openLogsTab(clusterId, namespace, podName, container) {
    const { tabs } = get()
    const id = makeId()
    const tab: BottomPanelTab = {
      id,
      type: 'logs',
      title: `Logs: ${podName}${container ? `/${container}` : ''}`,
      clusterId,
      namespace,
      name: podName,
      container
    }
    set({ tabs: [...tabs, tab], activeTabId: id })
    return id
  },

  openShellTab(clusterId, namespace, podName, container) {
    const { tabs } = get()
    const id = makeId()
    const tab: BottomPanelTab = {
      id,
      type: 'shell',
      title: `Shell: ${podName}${container ? `/${container}` : ''}`,
      clusterId,
      namespace,
      name: podName,
      container
    }
    set({ tabs: [...tabs, tab], activeTabId: id })
    return id
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

  setActiveTab(id) {
    set({ activeTabId: id })
  },

  getActiveTab() {
    const { tabs, activeTabId } = get()
    return tabs.find(t => t.id === activeTabId) ?? null
  }
}))
