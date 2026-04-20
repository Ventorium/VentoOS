import { create } from 'zustand'
import { apiClientApi } from './api'
import type {
  CollectionTree,
  Environment,
  HistoryEntry,
  HttpMethod,
  KeyValueItem,
  ProxyResponse,
  RequestTab,
} from './types'

let _tabCounter = 0
function nextTabId() {
  return `tab-${++_tabCounter}-${Date.now()}`
}

interface ApiClientState {
  // Data
  collections: CollectionTree[]
  environments: Environment[]
  activeEnvironmentId: string | null
  history: HistoryEntry[]

  // Tabs
  tabs: RequestTab[]
  activeTabId: string | null

  // Sidebar
  sidebarTab: 'collections' | 'environments' | 'history'

  // Response for active tab
  responses: Record<string, ProxyResponse>

  // Loading
  isLoading: boolean
  isSending: boolean

  // Actions
  loadCollections: () => Promise<void>
  loadEnvironments: () => Promise<void>
  loadHistory: () => Promise<void>

  setSidebarTab: (tab: 'collections' | 'environments' | 'history') => void
  setActiveEnvironment: (id: string | null) => void

  // Tab actions
  addTab: (tab?: Partial<RequestTab>) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabRequest: (tabId: string, updates: Partial<RequestTab>) => void

  // Request actions
  sendRequest: (tabId: string) => Promise<void>
  saveRequest: (tabId: string, collectionId: string, folderId?: string) => Promise<void>

  // Open a saved request in a tab
  openRequest: (req: {
    id: string
    name: string
    method: HttpMethod
    url: string
    request: Record<string, unknown>
  }) => void
}

export const useApiClientStore = create<ApiClientState>((set, get) => ({
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  history: [],
  tabs: [],
  activeTabId: null,
  sidebarTab: 'collections',
  responses: {},
  isLoading: false,
  isSending: false,

  loadCollections: async () => {
    set({ isLoading: true })
    try {
      const res = await apiClientApi.getCollections()
      if (res.data) {
        set({ collections: res.data })
      }
    } catch {
      // ignore
    } finally {
      set({ isLoading: false })
    }
  },

  loadEnvironments: async () => {
    try {
      const res = await apiClientApi.getEnvironments()
      if (res.data) {
        set({ environments: res.data })
      }
    } catch {
      // ignore
    }
  },

  loadHistory: async () => {
    try {
      const res = await apiClientApi.getHistory({ limit: 50 })
      if (res.data) {
        set({ history: res.data })
      }
    } catch {
      // ignore
    }
  },

  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setActiveEnvironment: (id) => set({ activeEnvironmentId: id }),

  addTab: (partial) => {
    const id = nextTabId()
    const tab: RequestTab = {
      id,
      name: partial?.name ?? 'Untitled Request',
      method: partial?.method ?? 'GET',
      url: partial?.url ?? '',
      request: partial?.request ?? {},
      isDirty: false,
      requestId: partial?.requestId,
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
    }))
    return id
  },

  removeTab: (tabId) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      const newResponses = { ...s.responses }
      delete newResponses[tabId]
      let activeTabId = s.activeTabId
      if (activeTabId === tabId) {
        const idx = s.tabs.findIndex((t) => t.id === tabId)
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId, responses: newResponses }
    })
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTabRequest: (tabId, updates) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, ...updates, isDirty: true } : t,
      ),
    }))
  },

  sendRequest: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab || !tab.url) return

    set({ isSending: true })
    try {
      const enabledHeaders = (tab.request.headers ?? []).filter((h: KeyValueItem) => h.enabled)
      const res = await apiClientApi.sendRequest({
        method: tab.method,
        url: tab.url,
        headers: enabledHeaders.length > 0 ? enabledHeaders : undefined,
        body: tab.request.body ? { type: tab.request.body.type, content: tab.request.body.content } : undefined,
        follow_redirects: true,
      })
      if (res.data) {
        set((s) => ({
          responses: { ...s.responses, [tabId]: res.data! },
        }))
      }
    } catch {
      // ignore
    } finally {
      set({ isSending: false })
      // Reload history after sending
      get().loadHistory()
    }
  },

  saveRequest: async (tabId, collectionId, folderId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return

    const data: Record<string, unknown> = {
      name: tab.name,
      method: tab.method,
      url: tab.url,
      collection_id: collectionId,
      folder_id: folderId,
      params: tab.request.params,
      headers: tab.request.headers,
      body: tab.request.body,
      auth: tab.request.auth,
    }

    try {
      if (tab.requestId) {
        await apiClientApi.updateRequest(tab.requestId, data)
      } else {
        const res = await apiClientApi.createRequest(data)
        if (res.data) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, requestId: res.data!.id, isDirty: false } : t,
            ),
          }))
        }
      }
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, isDirty: false } : t,
        ),
      }))
      get().loadCollections()
    } catch {
      // ignore
    }
  },

  openRequest: (req) => {
    const { tabs } = get()
    const existing = tabs.find((t) => t.requestId === req.id)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    get().addTab({
      requestId: req.id,
      name: req.name,
      method: req.method,
      url: req.url,
      request: req.request as Partial<RequestTab['request']>,
    })
  },
}))
