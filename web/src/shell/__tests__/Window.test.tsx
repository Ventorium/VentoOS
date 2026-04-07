import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowStore } from '@/kernel/window/store'
import type { WindowInstance } from '@/kernel/window/types'

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => {
  const actual = {
    motion: new Proxy(
      {},
      {
        get: (_target, prop) => {
          // Return a forwardRef component for any html element
          const { forwardRef } = require('react')
          return forwardRef((props: Record<string, unknown>, ref: unknown) => {
            const { children, animate, initial, exit, transition, whileHover, whileTap, variants, ...rest } = props
            const Tag = prop as string
            return (
              <Tag ref={ref} {...rest}>
                {children}
              </Tag>
            )
          })
        }
      }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: (initial: number) => ({ get: () => initial, set: vi.fn() }),
    useSpring: (val: unknown) => val,
    useTransform: (_val: unknown, _input: unknown, output?: unknown) =>
      output ? { get: () => (output as number[])[2] } : { get: () => 0 },
    useAnimationControls: () => ({
      start: vi.fn(),
      set: vi.fn(),
      stop: vi.fn()
    })
  }
  return actual
})

vi.mock('@/infra/api', () => ({
  apiClient: {
    saveWindowSettings: vi.fn().mockResolvedValue({}),
    getWindowSettings: vi.fn().mockResolvedValue({ data: [] }),
    createProcess: vi.fn().mockResolvedValue({ data: { pid: 1 } }),
    terminateProcess: vi.fn().mockResolvedValue({}),
    suspendProcess: vi.fn().mockResolvedValue({}),
    resumeProcess: vi.fn().mockResolvedValue({})
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

vi.mock('@/shell/Dock/dockPositionStore', () => ({
  useDockPositionStore: (sel: (s: unknown) => unknown) =>
    sel({
      iconRects: new Map(),
      thumbnailAreaRect: null,
      getTargetRect: () => null,
      registerIconRect: vi.fn(),
      unregisterIconRect: vi.fn(),
      setThumbnailAreaRect: vi.fn()
    })
}))

// Dynamic import to avoid hoisting issues
let Window: typeof import('@/shell/Window/index')['default']

describe('Window Component', () => {
  beforeEach(async () => {
    useWindowStore.setState({ windows: [], nextZIndex: 1 })
    const mod = await import('@/shell/Window/index')
    Window = mod.default
  })

  afterEach(() => {
    cleanup()
  })

  function makeWin(overrides: Partial<WindowInstance> = {}): WindowInstance {
    return {
      id: 'test-win',
      appId: 'test-app',
      title: 'Test Window',
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

  it('should render window with title', () => {
    const win = makeWin({ title: 'My Window' })
    render(
      <Window win={win}>
        <div>Content</div>
      </Window>
    )
    expect(screen.getByText('My Window')).toBeInTheDocument()
  })

  it('should render children content', () => {
    const win = makeWin()
    render(
      <Window win={win}>
        <div>App Content Here</div>
      </Window>
    )
    expect(screen.getByText('App Content Here')).toBeInTheDocument()
  })

  it('should render traffic lights (close, minimize, maximize)', () => {
    const win = makeWin()
    render(
      <Window win={win}>
        <div>Content</div>
      </Window>
    )
    expect(screen.getByLabelText('关闭')).toBeInTheDocument()
    expect(screen.getByLabelText('最小化')).toBeInTheDocument()
    expect(screen.getByLabelText('最大化')).toBeInTheDocument()
  })

  it('should render resize handles when not maximized', () => {
    const win = makeWin({ isMaximized: false })
    render(
      <Window win={win}>
        <div>Content</div>
      </Window>
    )
    expect(screen.getByLabelText('resize-n')).toBeInTheDocument()
    expect(screen.getByLabelText('resize-s')).toBeInTheDocument()
    expect(screen.getByLabelText('resize-e')).toBeInTheDocument()
    expect(screen.getByLabelText('resize-w')).toBeInTheDocument()
  })

  it('should not render resize handles when maximized', () => {
    const win = makeWin({ isMaximized: true })
    render(
      <Window win={win}>
        <div>Content</div>
      </Window>
    )
    expect(screen.queryByLabelText('resize-n')).not.toBeInTheDocument()
  })

  it('should show suspended message when minimized', () => {
    const win = makeWin({ isMinimized: true })
    render(
      <Window win={win}>
        <div>Content</div>
      </Window>
    )
    expect(screen.getByText('进程已暂停')).toBeInTheDocument()
  })
})
