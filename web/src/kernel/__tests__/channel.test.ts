import { describe, expect, it, vi } from 'vitest'
import { systemChannel } from '../channel'

// Reset listeners between tests by creating fresh channel instances isn't
// possible with the singleton, so we rely on unsubscribe cleanup.

describe('SystemChannel', () => {
  it('should deliver events to subscribers', () => {
    const handler = vi.fn()
    const unsub = systemChannel.subscribe('window:opened', handler)

    systemChannel.notify('window:opened', { windowId: 'w1', appId: 'test' })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ windowId: 'w1', appId: 'test' })
    unsub()
  })

  it('should unsubscribe correctly', () => {
    const handler = vi.fn()
    const unsub = systemChannel.subscribe('window:closed', handler)

    unsub()
    systemChannel.notify('window:closed', { windowId: 'w1', appId: 'test' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('should support multiple listeners on the same event', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    const u1 = systemChannel.subscribe('window:focused', h1)
    const u2 = systemChannel.subscribe('window:focused', h2)

    systemChannel.notify('window:focused', { windowId: 'w1', appId: 'test' })

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
    u1()
    u2()
  })

  it('should not call handler for different event', () => {
    const handler = vi.fn()
    const unsub = systemChannel.subscribe('window:minimized', handler)

    systemChannel.notify('window:restored', { windowId: 'w1' })

    expect(handler).not.toHaveBeenCalled()
    unsub()
  })

  it('should handle subscribe after unsubscribe correctly', () => {
    const h1 = vi.fn()
    const u1 = systemChannel.subscribe('theme:changed', h1)
    u1()

    const h2 = vi.fn()
    const u2 = systemChannel.subscribe('theme:changed', h2)

    systemChannel.notify('theme:changed', { mode: 'dark' })

    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalledWith({ mode: 'dark' })
    u2()
  })
})
