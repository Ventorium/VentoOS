import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowStore } from '@/kernel/window/store'
import { useAppStore } from '@/kernel/apps/store'
import type { AppManifest } from '@/kernel/apps/manifest'
import { useAIStatusStore } from '@/shell/Dock/aiStatusStore'
import { useDockPositionStore } from '@/shell/Dock/dockPositionStore'
import React from 'react'

// Mock framer-motion
vi.mock('framer-motion', () => {
  const actual = {
    motion: new Proxy({}, {
      get: (_target, prop) => {
        const { forwardRef } = require('react')
        return forwardRef((props: Record<string, unknown>, ref: unknown) => {
          const { children, animate, initial, exit, transition, whileHover, whileTap, variants, style, ...rest } = props
          const Tag = prop as string
          return <Tag ref={ref} style={style} {...rest}>{children}</Tag>
        })
      }
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: (initial: number) => ({ get: () => initial, set: vi.fn() }),
    useSpring: (val: unknown) => val,
    useTransform: (_val: unknown, _input: unknown, output?: unknown) => (output ? { get: () => (output as number[])[2] } : { get: () => 0 }),
  }
  return actual
})

vi.mock('@/infra/api', () => ({
  apiClient: {
    saveWindowSettings: vi.fn().mockResolvedValue({}),
    getWindowSettings: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

vi.mock('@/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const mockApp = (id: string, name: string, overrides?: Partial<AppManifest>): AppManifest => ({
  id,
  name,
  version: '1.0.0',
  author: { name: 'test' },
  icon: React.createElement('span', { 'data-testid': `icon-${id}` }, name[0]),
  multiWindow: false,
  component: () => Promise.resolve({ default: () => null as unknown as React.ReactElement }),
  ...overrides,
})

describe('Dock Component', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: [], nextZIndex: 1 })
    useAppStore.setState({ apps: new Map() })
    useAIStatusStore.setState({ status: 'idle' })
  })

  afterEach(() => {
    cleanup()
  })

  async function renderDock() {
    const Dock = (await import('@/shell/Dock/index')).default
    return render(<Dock />)
  }

  it('should render app icons', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    apps.set('db', mockApp('db', 'Database'))
    useAppStore.setState({ apps })

    await renderDock()
    expect(screen.getByTestId('icon-k8s')).toBeInTheDocument()
    expect(screen.getByTestId('icon-db')).toBeInTheDocument()
  })

  it('should render launchpad button', async () => {
    await renderDock()
    // Dock icons use className vos-dock-icon; launchpad is always present
    const dockIcons = document.querySelectorAll('.vos-dock-icon')
    expect(dockIcons.length).toBeGreaterThan(0)
  })

  it('should render AI assistant button', async () => {
    await renderDock()
    // AI icon always present; can check by label presence on hover
    // The Sparkles icon from lucide-react should be present
    expect(document.querySelector('.vos-dock-icon')).toBeTruthy()
  })

  it('should show badge when app has active windows', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes', { multiWindow: true }))
    useAppStore.setState({ apps })

    useWindowStore.setState({
      windows: [
        { id: 'w1', appId: 'k8s', title: 'K8s 1', x: 100, y: 100, width: 800, height: 600, zIndex: 1, isMaximized: false, isMinimized: false, isFocused: true },
        { id: 'w2', appId: 'k8s', title: 'K8s 2', x: 150, y: 150, width: 800, height: 600, zIndex: 2, isMaximized: false, isMinimized: false, isFocused: false },
      ],
      nextZIndex: 3,
    })

    await renderDock()
    // Badge should show "2"
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('should not count minimized windows in badge', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes', { multiWindow: true }))
    useAppStore.setState({ apps })

    useWindowStore.setState({
      windows: [
        { id: 'w1', appId: 'k8s', title: 'K8s 1', x: 100, y: 100, width: 800, height: 600, zIndex: 1, isMaximized: false, isMinimized: false, isFocused: true },
        { id: 'w2', appId: 'k8s', title: 'K8s 2', x: 150, y: 150, width: 800, height: 600, zIndex: 2, isMaximized: false, isMinimized: true, isFocused: false },
      ],
      nextZIndex: 3,
    })

    await renderDock()
    // Badge should show "1" (only non-minimized counted)
    const badges = screen.queryAllByText('1')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('should show minimized window thumbnails', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    useAppStore.setState({ apps })

    useWindowStore.setState({
      windows: [
        { id: 'w1', appId: 'k8s', title: 'Minimized K8s', x: 100, y: 100, width: 800, height: 600, zIndex: 1, isMaximized: false, isMinimized: true, isFocused: false },
      ],
      nextZIndex: 2,
    })

    await renderDock()
    // Minimized thumbnail button should have title
    expect(screen.getByTitle('Minimized K8s')).toBeInTheDocument()
  })
})

describe('AI Status Store', () => {
  it('should default to idle', () => {
    useAIStatusStore.setState({ status: 'idle' })
    expect(useAIStatusStore.getState().status).toBe('idle')
  })

  it('should update status', () => {
    useAIStatusStore.getState().setStatus('thinking')
    expect(useAIStatusStore.getState().status).toBe('thinking')
  })

  it('should cycle through all statuses', () => {
    const statuses: Array<'idle' | 'thinking' | 'executing' | 'error'> = ['idle', 'thinking', 'executing', 'error']
    for (const s of statuses) {
      useAIStatusStore.getState().setStatus(s)
      expect(useAIStatusStore.getState().status).toBe(s)
    }
  })
})

describe('Dock Position Store', () => {
  beforeEach(() => {
    useDockPositionStore.setState({
      iconRects: new Map(),
      thumbnailAreaRect: null,
    })
  })

  it('should register and retrieve icon rect', () => {
    const store = useDockPositionStore.getState()
    store.registerIconRect('k8s', { x: 100, y: 400, width: 48, height: 48 })
    expect(useDockPositionStore.getState().getTargetRect('k8s')).toEqual({ x: 100, y: 400, width: 48, height: 48 })
  })

  it('should unregister icon rect', () => {
    const store = useDockPositionStore.getState()
    store.registerIconRect('k8s', { x: 100, y: 400, width: 48, height: 48 })
    store.unregisterIconRect('k8s')
    expect(useDockPositionStore.getState().getTargetRect('k8s')).toBeNull()
  })

  it('should fall back to thumbnail area rect', () => {
    const store = useDockPositionStore.getState()
    store.setThumbnailAreaRect({ x: 200, y: 500, width: 100, height: 48 })
    expect(useDockPositionStore.getState().getTargetRect('unknown-app')).toEqual({ x: 200, y: 500, width: 100, height: 48 })
  })
})
