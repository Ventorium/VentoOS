/**
 * API Client App — Store Tests
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useApiClientStore } from '../store'

function resetStore() {
  useApiClientStore.setState({
    collections: [],
    environments: [],
    activeEnvironmentId: null,
    history: [],
    tabs: [],
    activeTabId: null,
    sidebarTab: 'collections',
    responses: {},
    isLoading: false,
    isSending: false
  })
}

describe('ApiClient Store', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('Tab Management', () => {
    it('should add a new tab with defaults', () => {
      const { addTab } = useApiClientStore.getState()
      const tabId = addTab()
      const state = useApiClientStore.getState()

      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe(tabId)
      expect(state.tabs[0].name).toBe('Untitled Request')
      expect(state.tabs[0].method).toBe('GET')
      expect(state.tabs[0].url).toBe('')
      expect(state.tabs[0].isDirty).toBe(false)
      expect(state.activeTabId).toBe(tabId)
    })

    it('should add a tab with custom values', () => {
      const { addTab } = useApiClientStore.getState()
      addTab({ name: 'Create User', method: 'POST', url: 'https://api.example.com/users' })
      const state = useApiClientStore.getState()

      expect(state.tabs[0].name).toBe('Create User')
      expect(state.tabs[0].method).toBe('POST')
      expect(state.tabs[0].url).toBe('https://api.example.com/users')
    })

    it('should remove a tab and update active', () => {
      const { addTab } = useApiClientStore.getState()
      const tab1 = addTab({ name: 'Tab 1' })
      const tab2 = addTab({ name: 'Tab 2' })
      const tab3 = addTab({ name: 'Tab 3' })

      // Active should be tab3 (last added)
      expect(useApiClientStore.getState().activeTabId).toBe(tab3)

      // Remove active tab
      useApiClientStore.getState().removeTab(tab3)
      const state = useApiClientStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe(tab2)
    })

    it('should remove a non-active tab without changing active', () => {
      const { addTab } = useApiClientStore.getState()
      const tab1 = addTab({ name: 'Tab 1' })
      const tab2 = addTab({ name: 'Tab 2' })

      useApiClientStore.getState().removeTab(tab1)
      const state = useApiClientStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe(tab2)
    })

    it('should set active tab to null when last tab removed', () => {
      const { addTab } = useApiClientStore.getState()
      const tabId = addTab()

      useApiClientStore.getState().removeTab(tabId)
      expect(useApiClientStore.getState().tabs).toHaveLength(0)
      expect(useApiClientStore.getState().activeTabId).toBeNull()
    })

    it('should switch active tab', () => {
      const { addTab } = useApiClientStore.getState()
      const tab1 = addTab({ name: 'Tab 1' })
      addTab({ name: 'Tab 2' })

      useApiClientStore.getState().setActiveTab(tab1)
      expect(useApiClientStore.getState().activeTabId).toBe(tab1)
    })

    it('should update tab request and mark dirty', () => {
      const { addTab } = useApiClientStore.getState()
      const tabId = addTab()

      useApiClientStore.getState().updateTabRequest(tabId, {
        url: 'https://example.com/api',
        method: 'POST'
      })

      const tab = useApiClientStore.getState().tabs[0]
      expect(tab.url).toBe('https://example.com/api')
      expect(tab.method).toBe('POST')
      expect(tab.isDirty).toBe(true)
    })
  })

  describe('Sidebar', () => {
    it('should switch sidebar tab', () => {
      useApiClientStore.getState().setSidebarTab('environments')
      expect(useApiClientStore.getState().sidebarTab).toBe('environments')

      useApiClientStore.getState().setSidebarTab('history')
      expect(useApiClientStore.getState().sidebarTab).toBe('history')
    })
  })

  describe('Environment', () => {
    it('should set active environment', () => {
      useApiClientStore.getState().setActiveEnvironment('env-1')
      expect(useApiClientStore.getState().activeEnvironmentId).toBe('env-1')

      useApiClientStore.getState().setActiveEnvironment(null)
      expect(useApiClientStore.getState().activeEnvironmentId).toBeNull()
    })
  })

  describe('Open Request', () => {
    it('should open a saved request in new tab', () => {
      useApiClientStore.getState().openRequest({
        id: 'req-123',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        request: {}
      })

      const state = useApiClientStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].requestId).toBe('req-123')
      expect(state.tabs[0].name).toBe('Get Users')
    })

    it('should switch to existing tab if request already open', () => {
      useApiClientStore.getState().openRequest({
        id: 'req-123',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        request: {}
      })

      // Open same request again
      useApiClientStore.getState().openRequest({
        id: 'req-123',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        request: {}
      })

      expect(useApiClientStore.getState().tabs).toHaveLength(1)
    })
  })
})
