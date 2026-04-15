import { beforeEach, describe, expect, it } from 'vitest'
import { useBottomPanelStore } from '../stores/bottom-panel-store'

describe('BottomPanelStore', () => {
  beforeEach(() => {
    useBottomPanelStore.setState({
      tabs: [],
      activeTabId: null,
    })
  })

  it('opens a YAML tab', () => {
    const { openYamlTab } = useBottomPanelStore.getState()
    const id = openYamlTab('c1', 'default', 'pod', 'nginx')
    const state = useBottomPanelStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].type).toBe('yaml')
    expect(state.tabs[0].title).toContain('nginx')
    expect(state.activeTabId).toBe(id)
  })

  it('opens a logs tab', () => {
    const { openLogsTab } = useBottomPanelStore.getState()
    const id = openLogsTab('c1', 'default', 'nginx', 'app')
    const state = useBottomPanelStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].type).toBe('logs')
    expect(state.tabs[0].container).toBe('app')
    expect(state.activeTabId).toBe(id)
  })

  it('closes a tab and activates next', () => {
    const { openYamlTab, closeTab } = useBottomPanelStore.getState()
    const id1 = openYamlTab('c1', 'default', 'pod', 'nginx')
    const id2 = openYamlTab('c1', 'default', 'deployment', 'web')
    closeTab(id1)
    const state = useBottomPanelStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(id2)
  })
})
