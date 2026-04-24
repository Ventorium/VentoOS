import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/infra/api'
import { useWindowStore } from '../window/store'
import type { WindowInstance } from '../window/types'

// Mock api client
vi.mock('@/infra/api', () => ({
  apiClient: {
    saveWindowSettings: vi.fn().mockResolvedValue({}),
    getWindowSettings: vi.fn().mockResolvedValue({ data: [] }),
    createWindowState: vi.fn().mockResolvedValue({ data: { id: 'mock-window' } }),
    updateWindowState: vi.fn().mockResolvedValue({}),
    deleteWindowState: vi.fn().mockResolvedValue({})
  }
}))

vi.mock('@/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

function makeWin(overrides: Partial<WindowInstance> = {}): WindowInstance {
  const id = overrides.id ?? crypto.randomUUID()
  return {
    id,
    appId: 'test-app',
    title: 'Test',
    x: 100,
    y: 100,
    width: 800,
    height: 600,
    zIndex: 1,
    isMaximized: false,
    isMinimized: false,
    isFocused: true,
    ...overrides
  }
}

describe('WindowStore — Enhanced Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWindowStore.setState({ windows: [], nextZIndex: 1 })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Basic CRUD ──────────────────────────────────────────────────

  it('should add a window', () => {
    const { _addWindow, getWindow } = useWindowStore.getState()
    _addWindow(makeWin({ id: 'w1' }))
    expect(getWindow('w1')).toBeDefined()
    expect(useWindowStore.getState().windows).toHaveLength(1)
  })

  it('should unfocus existing windows when adding a new one', () => {
    const { _addWindow } = useWindowStore.getState()
    _addWindow(makeWin({ id: 'w1', isFocused: true }))
    _addWindow(makeWin({ id: 'w2', isFocused: true }))
    const state = useWindowStore.getState()
    expect(state.getWindow('w1')!.isFocused).toBe(false)
    expect(state.getWindow('w2')!.isFocused).toBe(true)
  })

  it('should remove a window and auto-focus topmost', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', zIndex: 1 }))
    store._addWindow(makeWin({ id: 'w2', zIndex: 2 }))
    useWindowStore.getState()._removeWindow('w2')
    const state = useWindowStore.getState()
    expect(state.windows).toHaveLength(1)
    expect(state.getWindow('w1')!.isFocused).toBe(true)
  })

  // ── Focus & z-index ─────────────────────────────────────────────

  it('should focus a window and update z-index', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    store._addWindow(makeWin({ id: 'w2' }))
    const z = useWindowStore.getState().nextZIndex
    useWindowStore.getState()._focusWindow('w1', z)
    const state = useWindowStore.getState()
    expect(state.getWindow('w1')!.isFocused).toBe(true)
    expect(state.getWindow('w1')!.zIndex).toBe(z)
    expect(state.getWindow('w2')!.isFocused).toBe(false)
  })

  it('should increment nextZIndex on focus', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    const before = useWindowStore.getState().nextZIndex
    useWindowStore.getState()._focusWindow('w1', before)
    expect(useWindowStore.getState().nextZIndex).toBe(before + 1)
  })

  it('z-index of focused window should always be highest', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', zIndex: 1 }))
    store._addWindow(makeWin({ id: 'w2', zIndex: 2 }))
    store._addWindow(makeWin({ id: 'w3', zIndex: 3 }))

    const z = useWindowStore.getState().nextZIndex
    useWindowStore.getState()._focusWindow('w1', z)

    const state = useWindowStore.getState()
    const w1z = state.getWindow('w1')!.zIndex
    const w2z = state.getWindow('w2')!.zIndex
    const w3z = state.getWindow('w3')!.zIndex
    expect(w1z).toBeGreaterThan(w2z)
    expect(w1z).toBeGreaterThan(w3z)
  })

  it('should only sync windows whose focus state changed', async () => {
    useWindowStore.setState({
      windows: [
        makeWin({ id: 'w1', zIndex: 1, isFocused: false }),
        makeWin({ id: 'w2', zIndex: 2, isFocused: true }),
        makeWin({ id: 'w3', zIndex: 3, isFocused: false })
      ],
      nextZIndex: 4
    })

    vi.mocked(apiClient.updateWindowState).mockClear()

    useWindowStore.getState()._focusWindow('w1', 4)

    vi.advanceTimersByTime(500)
    await Promise.resolve()

    expect(apiClient.updateWindowState).toHaveBeenCalledTimes(2)
    expect(apiClient.updateWindowState).toHaveBeenCalledWith('w1', expect.objectContaining({ z_index: 4, status: 'active' }))
    expect(apiClient.updateWindowState).toHaveBeenCalledWith('w2', expect.objectContaining({ status: 'blurred' }))
  })

  // ── Minimize/Restore ────────────────────────────────────────────

  it('should minimize a window', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', isFocused: true }))
    useWindowStore.getState()._minimizeWindow('w1')
    const w = useWindowStore.getState().getWindow('w1')!
    expect(w.isMinimized).toBe(true)
    expect(w.isFocused).toBe(false)
  })

  it('should restore a minimized window', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState()._minimizeWindow('w1')
    useWindowStore.getState()._restoreWindowState('w1')
    expect(useWindowStore.getState().getWindow('w1')!.isMinimized).toBe(false)
  })

  it('should handle minimize then restore preserving position', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', x: 150, y: 200 }))
    useWindowStore.getState()._minimizeWindow('w1')
    useWindowStore.getState()._restoreWindowState('w1')
    const w = useWindowStore.getState().getWindow('w1')!
    expect(w.x).toBe(150)
    expect(w.y).toBe(200)
  })

  // ── Maximize/Restore ────────────────────────────────────────────

  it('should toggle maximize and store restore bounds', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', x: 50, y: 50, width: 400, height: 300 }))

    useWindowStore.getState()._toggleMaximize('w1')
    let w = useWindowStore.getState().getWindow('w1')!
    expect(w.isMaximized).toBe(true)
    expect(w.restoreBounds).toEqual({ x: 50, y: 50, width: 400, height: 300 })

    useWindowStore.getState()._toggleMaximize('w1')
    w = useWindowStore.getState().getWindow('w1')!
    expect(w.isMaximized).toBe(false)
    expect(w.x).toBe(50)
    expect(w.y).toBe(50)
    expect(w.width).toBe(400)
    expect(w.height).toBe(300)
  })

  // ── Move/Resize ─────────────────────────────────────────────────

  it('should move a window', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState().moveWindow('w1', 200, 300)
    const w = useWindowStore.getState().getWindow('w1')!
    expect(w.x).toBe(200)
    expect(w.y).toBe(300)
  })

  it('should resize a window', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState().resizeWindow('w1', 1200, 900)
    const w = useWindowStore.getState().getWindow('w1')!
    expect(w.width).toBe(1200)
    expect(w.height).toBe(900)
  })

  // ── Title/AppState ──────────────────────────────────────────────

  it('should update title', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', title: 'Old' }))
    useWindowStore.getState().updateTitle('w1', 'New Title')
    expect(useWindowStore.getState().getWindow('w1')!.title).toBe('New Title')
  })

  it('should update app state', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState().updateAppState('w1', { tab: 'pods' })
    expect(useWindowStore.getState().getWindow('w1')!.appState).toEqual({ tab: 'pods' })
  })

  it('should serialize and restore complex appState', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    const complexState = {
      activeTab: 'connections',
      expandedNodes: ['node-1', 'node-2'],
      scrollPosition: 450,
      filters: { status: 'active', search: 'test' }
    }
    useWindowStore.getState().updateAppState('w1', complexState)
    const restored = useWindowStore.getState().getWindow('w1')!.appState
    expect(restored).toEqual(complexState)
  })

  it('should preserve appState across minimize/restore', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState().updateAppState('w1', { cursor: 42 })
    useWindowStore.getState()._minimizeWindow('w1')
    useWindowStore.getState()._restoreWindowState('w1')
    expect(useWindowStore.getState().getWindow('w1')!.appState).toEqual({ cursor: 42 })
  })

  // ── Queries ─────────────────────────────────────────────────────

  it('should get windows by app', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', appId: 'k8s' }))
    store._addWindow(makeWin({ id: 'w2', appId: 'db' }))
    store._addWindow(makeWin({ id: 'w3', appId: 'k8s' }))
    expect(useWindowStore.getState().getWindowsByApp('k8s')).toHaveLength(2)
  })

  it('should get focused window', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    store._addWindow(makeWin({ id: 'w2' }))
    expect(useWindowStore.getState().getFocusedWindow()?.id).toBe('w2')
  })

  it('should return undefined for non-existent window', () => {
    expect(useWindowStore.getState().getWindow('nonexistent')).toBeUndefined()
  })

  it('should set process ID', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState()._setProcessId('w1', 42)
    expect(useWindowStore.getState().getWindow('w1')!.processId).toBe(42)
  })

  // ── Edge cases ──────────────────────────────────────────────────

  it('should handle removing the only window gracefully', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState()._removeWindow('w1')
    expect(useWindowStore.getState().windows).toHaveLength(0)
    expect(useWindowStore.getState().getFocusedWindow()).toBeUndefined()
  })

  it('should handle multiple rapid minimizes', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    store._addWindow(makeWin({ id: 'w2' }))
    store._addWindow(makeWin({ id: 'w3' }))
    useWindowStore.getState()._minimizeWindow('w1')
    useWindowStore.getState()._minimizeWindow('w2')
    useWindowStore.getState()._minimizeWindow('w3')
    const state = useWindowStore.getState()
    expect(state.windows.filter(w => w.isMinimized)).toHaveLength(3)
    expect(state.windows.every(w => !w.isFocused)).toBe(true)
  })
})
