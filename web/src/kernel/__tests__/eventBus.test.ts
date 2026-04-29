import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const mockGetApp = vi.fn()
vi.mock('../apps/store', () => ({
  useAppStore: {
    getState: () => ({
      getApp: mockGetApp,
    }),
  },
}))

const mockGetWindowsByApp = vi.fn().mockReturnValue([])
const mockOpenWindow = vi.fn().mockResolvedValue(undefined)
const mockFocusWindow = vi.fn().mockResolvedValue(undefined)

vi.mock('../window/store', () => ({
  useWindowStore: {
    getState: () => ({
      getWindowsByApp: mockGetWindowsByApp,
    }),
  },
}))

vi.mock('../window/manager', () => ({
  openWindow: (...args: unknown[]) => mockOpenWindow(...args),
  focusWindow: (...args: unknown[]) => mockFocusWindow(...args),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { eventBus } from '../ipc/event-bus'
import type { AppManifest } from '../apps/manifest'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: 'test-app',
    name: 'Test App',
    version: '1.0.0',
    author: { name: 'Test' },
    description: 'Test app',
    icon: null as unknown as React.ReactNode,
    component: () => Promise.resolve({ default: () => null }),
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EventBus', () => {
  beforeEach(() => {
    // Reset internal state by clearing handlers
    eventBus.unregisterApp('kubernetes')
    eventBus.unregisterApp('database')
    eventBus.unregisterApp('redis')
    eventBus.unregisterApp('test-app')
    eventBus.clearLog()
    vi.clearAllMocks()
  })

  describe('on() — handler registration', () => {
    it('registers a handler and returns a cleanup function', () => {
      mockGetApp.mockReturnValue(
        makeManifest({
          id: 'database',
          handles: [{ topic: 'open:postgres' }],
        })
      )

      const handler = vi.fn()
      const unsub = eventBus.on('database', 'open:postgres', handler)

      expect(typeof unsub).toBe('function')
      expect(eventBus.getHandlers('open:postgres')).toHaveLength(1)

      unsub()
      expect(eventBus.getHandlers('open:postgres')).toHaveLength(0)
    })

    it('rejects registration for unknown app', () => {
      mockGetApp.mockReturnValue(undefined)

      const handler = vi.fn()
      const unsub = eventBus.on('unknown-app', 'open:postgres', handler)

      // Should return no-op cleanup
      expect(typeof unsub).toBe('function')
      expect(eventBus.getHandlers('open:postgres')).toHaveLength(0)
    })

    it('rejects registration if manifest handles does not include the topic', () => {
      mockGetApp.mockReturnValue(
        makeManifest({
          id: 'database',
          handles: [{ topic: 'open:mysql' }], // declares mysql, not postgres
        })
      )

      const handler = vi.fn()
      eventBus.on('database', 'open:postgres', handler)

      expect(eventBus.getHandlers('open:postgres')).toHaveLength(0)
    })

    it('allows registration if handles is undefined (no restriction)', () => {
      mockGetApp.mockReturnValue(
        makeManifest({
          id: 'database',
          // handles not defined — permissive
        })
      )

      const handler = vi.fn()
      eventBus.on('database', 'open:postgres', handler)

      expect(eventBus.getHandlers('open:postgres')).toHaveLength(1)
    })
  })

  describe('emit() — event emission', () => {
    it('calls registered handlers with full payload', async () => {
      // Sender manifest declares emits
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({
            id: 'kubernetes',
            emits: [{ topic: 'open:postgres' }],
          })
        }
        if (id === 'database') {
          return makeManifest({
            id: 'database',
            handles: [{ topic: 'open:postgres', autoOpen: false }],
          })
        }
        return undefined
      })

      const handler = vi.fn()
      eventBus.on('database', 'open:postgres', handler)

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(handler).toHaveBeenCalledTimes(1)
      const payload = handler.mock.calls[0][0]
      expect(payload.dbType).toBe('postgresql')
      expect(payload.host).toBe('localhost')
      expect(payload.port).toBe(5432)
      expect(payload.eventId).toMatch(/^evt-/)
      expect(payload.senderId).toBe('kubernetes')
      expect(typeof payload.timestamp).toBe('number')
    })

    it('rejects emission if sender is unknown', async () => {
      mockGetApp.mockReturnValue(undefined)

      const handler = vi.fn()
      // Manually register without validation
      mockGetApp.mockReturnValueOnce(
        makeManifest({ id: 'database', handles: [{ topic: 'open:postgres' }] })
      )
      eventBus.on('database', 'open:postgres', handler)

      mockGetApp.mockReturnValue(undefined)
      await eventBus.emit('unknown', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(handler).not.toHaveBeenCalled()
    })

    it('rejects emission if sender manifest emits does not include the topic', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({
            id: 'kubernetes',
            emits: [{ topic: 'open:mysql' }], // declares mysql, not postgres
          })
        }
        if (id === 'database') {
          return makeManifest({
            id: 'database',
            handles: [{ topic: 'open:postgres' }],
          })
        }
        return undefined
      })

      const handler = vi.fn()
      eventBus.on('database', 'open:postgres', handler)

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(handler).not.toHaveBeenCalled()
    })

    it('executes handlers in priority order', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({
            id: 'kubernetes',
            emits: [{ topic: 'open:postgres' }],
          })
        }
        if (id === 'database') {
          return makeManifest({
            id: 'database',
            handles: [{ topic: 'open:postgres', autoOpen: false }],
          })
        }
        return undefined
      })

      const order: number[] = []
      eventBus.on('database', 'open:postgres', () => { order.push(1) }, { priority: 10 })
      eventBus.on('database', 'open:postgres', () => { order.push(0) }, { priority: 0 })

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(order).toEqual([0, 1])
    })

    it('continues executing other handlers when one throws', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({ id: 'kubernetes', emits: [{ topic: 'open:postgres' }] })
        }
        if (id === 'database') {
          return makeManifest({ id: 'database', handles: [{ topic: 'open:postgres', autoOpen: false }] })
        }
        return undefined
      })

      const handler1 = vi.fn().mockRejectedValue(new Error('boom'))
      const handler2 = vi.fn()

      eventBus.on('database', 'open:postgres', handler1, { priority: 0 })
      eventBus.on('database', 'open:postgres', handler2, { priority: 1 })

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })
  })

  describe('auto-open behavior', () => {
    it('auto-opens target app when no window exists and autoOpen=true', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({ id: 'kubernetes', emits: [{ topic: 'open:postgres' }] })
        }
        if (id === 'database') {
          return makeManifest({ id: 'database', handles: [{ topic: 'open:postgres', autoOpen: true }] })
        }
        return undefined
      })

      mockGetWindowsByApp.mockReturnValue([])

      eventBus.on('database', 'open:postgres', vi.fn())

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(mockOpenWindow).toHaveBeenCalledWith('database')
    })

    it('focuses existing window when app already has a window', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({ id: 'kubernetes', emits: [{ topic: 'open:postgres' }] })
        }
        if (id === 'database') {
          return makeManifest({ id: 'database', handles: [{ topic: 'open:postgres', autoOpen: true }] })
        }
        return undefined
      })

      mockGetWindowsByApp.mockReturnValue([{ id: 'win-1' }])

      eventBus.on('database', 'open:postgres', vi.fn())

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(mockOpenWindow).not.toHaveBeenCalled()
      expect(mockFocusWindow).toHaveBeenCalledWith('win-1')
    })

    it('does not auto-open when autoOpen=false', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({ id: 'kubernetes', emits: [{ topic: 'open:postgres' }] })
        }
        if (id === 'database') {
          return makeManifest({ id: 'database', handles: [{ topic: 'open:postgres', autoOpen: false }] })
        }
        return undefined
      })

      mockGetWindowsByApp.mockReturnValue([])

      eventBus.on('database', 'open:postgres', vi.fn())

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(mockOpenWindow).not.toHaveBeenCalled()
      expect(mockFocusWindow).not.toHaveBeenCalled()
    })
  })

  describe('unregisterApp()', () => {
    it('removes all handlers for the given app', () => {
      mockGetApp.mockReturnValue(
        makeManifest({ id: 'database', handles: [{ topic: 'open:postgres' }, { topic: 'open:mysql' }] })
      )

      eventBus.on('database', 'open:postgres', vi.fn())
      eventBus.on('database', 'open:mysql', vi.fn())

      expect(eventBus.getAppHandlers('database')).toHaveLength(2)

      eventBus.unregisterApp('database')

      expect(eventBus.getAppHandlers('database')).toHaveLength(0)
    })
  })

  describe('event log', () => {
    it('logs events after emission', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({ id: 'kubernetes', emits: [{ topic: 'open:postgres' }] })
        }
        return undefined
      })

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      const log = eventBus.getRecentEvents(10)
      expect(log.length).toBeGreaterThanOrEqual(1)
      expect(log[log.length - 1].topic).toBe('open:postgres')
      expect(log[log.length - 1].senderId).toBe('kubernetes')
    })

    it('redacts sensitive fields in log payload', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({ id: 'kubernetes', emits: [{ topic: 'open:postgres' }] })
        }
        return undefined
      })

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
        password: 'supersecret',
      })

      const log = eventBus.getRecentEvents(1)
      expect(log[0].payload.password).toBe('***REDACTED***')
      expect(log[0].payload.host).toBe('localhost')
    })

    it('clearLog() empties the log', async () => {
      mockGetApp.mockImplementation((id: string) => {
        if (id === 'kubernetes') {
          return makeManifest({ id: 'kubernetes', emits: [{ topic: 'open:postgres' }] })
        }
        return undefined
      })

      await eventBus.emit('kubernetes', 'open:postgres', {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      })

      expect(eventBus.getRecentEvents().length).toBeGreaterThan(0)
      eventBus.clearLog()
      expect(eventBus.getRecentEvents().length).toBe(0)
    })
  })

  describe('getAppHandlers()', () => {
    it('returns all handlers registered by a specific app', () => {
      mockGetApp.mockReturnValue(
        makeManifest({
          id: 'database',
          handles: [{ topic: 'open:postgres' }, { topic: 'open:mysql' }],
        })
      )

      eventBus.on('database', 'open:postgres', vi.fn())
      eventBus.on('database', 'open:mysql', vi.fn())

      const handlers = eventBus.getAppHandlers('database')
      expect(handlers).toHaveLength(2)
      expect(handlers.map(h => h.topic).sort()).toEqual(['open:mysql', 'open:postgres'])
    })
  })
})
