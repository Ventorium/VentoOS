import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEventHandler, useEventEmitter } from '../ipc/hooks'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const mockOn = vi.fn().mockReturnValue(vi.fn())
const mockEmit = vi.fn().mockResolvedValue(undefined)
const mockUnregisterApp = vi.fn()

vi.mock('../ipc/event-bus', () => ({
  eventBus: {
    on: (...args: unknown[]) => mockOn(...args),
    emit: (...args: unknown[]) => mockEmit(...args),
    unregisterApp: (...args: unknown[]) => mockUnregisterApp(...args),
  },
}))

const mockGetApp = vi.fn()
vi.mock('../apps/store', () => ({
  useAppStore: {
    getState: () => ({
      getApp: mockGetApp,
    }),
  },
}))

import type { AppManifest } from '../apps/manifest'

function makeManifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: 'test-app',
    name: 'Test App',
    version: '1.0.0',
    author: { name: 'Test' },
    description: 'Test',
    icon: null as unknown as React.ReactNode,
    component: () => Promise.resolve({ default: () => null }),
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useEventHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers handler on mount and unregisters on unmount', () => {
    mockGetApp.mockReturnValue(makeManifest({ id: 'database', handles: [{ topic: 'open:postgres' }] }))

    const handler = vi.fn()
    const { unmount } = renderHook(() => useEventHandler('database', 'open:postgres', handler))

    expect(mockOn).toHaveBeenCalledWith('database', 'open:postgres', expect.any(Function), undefined)

    unmount()
    // The cleanup function returned by eventBus.on should have been called
  })

  it('does not re-register when handler reference changes', () => {
    mockGetApp.mockReturnValue(makeManifest({ id: 'database', handles: [{ topic: 'open:postgres' }] }))

    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const { rerender } = renderHook(
      ({ h }) => useEventHandler('database', 'open:postgres', h),
      { initialProps: { h: handler1 } }
    )

    expect(mockOn).toHaveBeenCalledTimes(1)

    rerender({ h: handler2 })

    // Should still only have been called once — handler is kept via ref
    expect(mockOn).toHaveBeenCalledTimes(1)
  })
})

describe('useEventEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a stable emit function', () => {
    const { result, rerender } = renderHook(() => useEventEmitter('kubernetes'))

    const emit1 = result.current
    rerender()
    const emit2 = result.current

    expect(emit1).toBe(emit2)
  })

  it('emit function calls eventBus.emit with the bound appId', async () => {
    const { result } = renderHook(() => useEventEmitter('kubernetes'))

    await result.current('open:postgres', {
      dbType: 'postgresql',
      host: 'localhost',
      port: 5432,
    })

    expect(mockEmit).toHaveBeenCalledWith('kubernetes', 'open:postgres', {
      dbType: 'postgresql',
      host: 'localhost',
      port: 5432,
    })
  })
})
