import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowStore } from '../window/store'
import type { WindowInstance } from '../window/types'

vi.mock('@/infra/api', () => ({
  apiClient: {
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

describe('WindowStore', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: [], nextZIndex: 1 })
  })

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
    const w1 = state.getWindow('w1')
    const w2 = state.getWindow('w2')
    expect(w1!.isFocused).toBe(false)
    expect(w2!.isFocused).toBe(true)
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

  it('should toggle maximize and store restore bounds', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', x: 50, y: 50, width: 400, height: 300 }))

    // Maximize
    useWindowStore.getState()._toggleMaximize('w1')
    let w = useWindowStore.getState().getWindow('w1')!
    expect(w.isMaximized).toBe(true)
    expect(w.restoreBounds).toEqual({ x: 50, y: 50, width: 400, height: 300 })

    // Restore
    useWindowStore.getState()._toggleMaximize('w1')
    w = useWindowStore.getState().getWindow('w1')!
    expect(w.isMaximized).toBe(false)
    expect(w.x).toBe(50)
    expect(w.y).toBe(50)
    expect(w.width).toBe(400)
    expect(w.height).toBe(300)
  })

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

  it('should get windows by app', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1', appId: 'k8s' }))
    store._addWindow(makeWin({ id: 'w2', appId: 'db' }))
    store._addWindow(makeWin({ id: 'w3', appId: 'k8s' }))

    const k8sWindows = useWindowStore.getState().getWindowsByApp('k8s')
    expect(k8sWindows).toHaveLength(2)
  })

  it('should get focused window', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    store._addWindow(makeWin({ id: 'w2' }))

    // w2 is focused (last added)
    const focused = useWindowStore.getState().getFocusedWindow()
    expect(focused?.id).toBe('w2')
  })

  it('should set process ID', () => {
    const store = useWindowStore.getState()
    store._addWindow(makeWin({ id: 'w1' }))
    useWindowStore.getState()._setProcessId('w1', 42)

    expect(useWindowStore.getState().getWindow('w1')!.processId).toBe(42)
  })
})
