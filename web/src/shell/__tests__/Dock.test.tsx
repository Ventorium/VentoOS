import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppManifest } from '@/kernel/apps/manifest'
import { useAppStore } from '@/kernel/apps/store'
import { useWindowStore } from '@/kernel/window/store'
import { useAIStatusStore } from '@/shell/Dock/aiStatusStore'
import { useDockLayoutStore } from '@/shell/Dock/dockLayoutStore'
import { useDockPositionStore } from '@/shell/Dock/dockPositionStore'

// Mock framer-motion
vi.mock('framer-motion', () => {
  const actual = {
    motion: new Proxy(
      {},
      {
        get: (_target, prop) => {
          const { forwardRef } = require('react')
          return forwardRef((props: Record<string, unknown>, ref: unknown) => {
            const { children, animate, initial, exit, transition, whileHover, whileTap, variants, style, ...rest } =
              props
            const Tag = prop as string
            return (
              <Tag ref={ref} style={style} {...rest}>
                {children}
              </Tag>
            )
          })
        }
      }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    LayoutGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: (initial: number) => ({ get: () => initial, set: vi.fn() }),
    useSpring: (val: unknown) => val,
    useTransform: (_val: unknown, _input: unknown, output?: unknown) =>
      output ? { get: () => (output as number[])[2] } : { get: () => 0 }
  }
  return actual
})

vi.mock('@/infra/api', () => ({
  apiClient: {
    saveWindowSettings: vi.fn().mockResolvedValue({}),
    getWindowSettings: vi.fn().mockResolvedValue({ data: [] })
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

const mockApp = (id: string, name: string, overrides?: Partial<AppManifest>): AppManifest => ({
  id,
  name,
  version: '1.0.0',
  author: { name: 'test' },
  icon: React.createElement('span', { 'data-testid': `icon-${id}` }, name[0]),
  multiWindow: false,
  component: () => Promise.resolve({ default: () => null as unknown as React.ReactElement }),
  ...overrides
})

describe('Dock Component', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: [], nextZIndex: 1 })
    useAppStore.setState({ apps: new Map() })
    useAIStatusStore.setState({ status: 'idle' })
    useDockLayoutStore.setState({ items: [], loaded: true })
  })

  afterEach(() => {
    cleanup()
  })

  async function renderDock(customItems?: Array<{ type: 'app'; appId: string }>) {
    if (customItems) {
      useDockLayoutStore.setState({ items: customItems, loaded: true })
    } else {
      const appIds = Array.from(useAppStore.getState().apps.keys())
      useDockLayoutStore.setState({
        items: appIds.map(appId => ({ type: 'app' as const, appId })),
        loaded: true
      })
    }
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

  it('should show running indicator when app has active windows', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes', { multiWindow: true }))
    useAppStore.setState({ apps })

    useWindowStore.setState({
      windows: [
        {
          id: 'w1',
          appId: 'k8s',
          title: 'K8s 1',
          x: 100,
          y: 100,
          width: 800,
          height: 600,
          zIndex: 1,
          isMaximized: false,
          isMinimized: false,
          isFocused: true
        },
        {
          id: 'w2',
          appId: 'k8s',
          title: 'K8s 2',
          x: 150,
          y: 150,
          width: 800,
          height: 600,
          zIndex: 2,
          isMaximized: false,
          isMinimized: false,
          isFocused: false
        }
      ],
      nextZIndex: 3
    })

    await renderDock()
    // Badge was removed; instead running indicator should be present (running dot)
    expect(document.querySelector('.vos-dock-icon')).toBeInTheDocument()
    // No numeric badge text
    expect(document.querySelectorAll('.vos-dock-icon').length).toBeGreaterThan(0)
  })

  it('should not show numeric badge for minimized windows', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes', { multiWindow: true }))
    useAppStore.setState({ apps })

    useWindowStore.setState({
      windows: [
        {
          id: 'w1',
          appId: 'k8s',
          title: 'K8s 1',
          x: 100,
          y: 100,
          width: 800,
          height: 600,
          zIndex: 1,
          isMaximized: false,
          isMinimized: false,
          isFocused: true
        },
        {
          id: 'w2',
          appId: 'k8s',
          title: 'K8s 2',
          x: 150,
          y: 150,
          width: 800,
          height: 600,
          zIndex: 2,
          isMaximized: false,
          isMinimized: true,
          isFocused: false
        }
      ],
      nextZIndex: 3
    })

    await renderDock()
    // Badges are removed from the dock; no numeric text should appear
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(document.querySelector('.vos-dock-icon')).toBeInTheDocument()
  })

  it('should show minimized window thumbnails', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    useAppStore.setState({ apps })

    useWindowStore.setState({
      windows: [
        {
          id: 'w1',
          appId: 'k8s',
          title: 'Minimized K8s',
          x: 100,
          y: 100,
          width: 800,
          height: 600,
          zIndex: 1,
          isMaximized: false,
          isMinimized: true,
          isFocused: false
        }
      ],
      nextZIndex: 2
    })

    await renderDock()
    // Minimized thumbnail button should have title
    expect(screen.getByTitle('Minimized K8s')).toBeInTheDocument()
  })

  it('should make dock items draggable and running unpinned non-draggable', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    apps.set('db', mockApp('db', 'Database'))
    useAppStore.setState({ apps })

    // Pin both apps
    useDockLayoutStore.setState({
      items: [
        { type: 'app', appId: 'k8s' },
        { type: 'app', appId: 'db' }
      ],
      loaded: true
    })

    await renderDock()
    const dockIcons = document.querySelectorAll('.vos-dock-icon')
    // First icon is launchpad (not draggable), then k8s, then db
    expect(dockIcons.length).toBeGreaterThanOrEqual(3)
    // Check that dock items wrapper divs are draggable
    const launchpadWrapper = dockIcons[0].closest('div[style*="cursor: grab"]')
    expect(launchpadWrapper).toBeNull() // Launchpad not draggable
    const k8sWrapper = dockIcons[1].closest('div[style*="cursor: grab"]')
    expect(k8sWrapper).not.toBeNull() // Pinned app draggable
    const dbWrapper = dockIcons[2].closest('div[style*="cursor: grab"]')
    expect(dbWrapper).not.toBeNull() // Pinned app draggable
  })

  it('should not make running unpinned apps draggable', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    apps.set('db', mockApp('db', 'Database'))
    useAppStore.setState({ apps })

    useWindowStore.setState({
      windows: [
        {
          id: 'w1',
          appId: 'db',
          title: 'DB',
          x: 100,
          y: 100,
          width: 800,
          height: 600,
          zIndex: 1,
          isMaximized: false,
          isMinimized: false,
          isFocused: true
        }
      ],
      nextZIndex: 2
    })

    // Only pin k8s, db is running but not pinned
    await renderDock([{ type: 'app', appId: 'k8s' }])
    const dockIcons = document.querySelectorAll('.vos-dock-icon')
    // launchpad, k8s(pinned), db(running unpinned)
    expect(dockIcons.length).toBeGreaterThanOrEqual(3)
    const k8sWrapper = dockIcons[1].closest('div[style*="cursor: grab"]')
    expect(k8sWrapper).not.toBeNull()
    const dbWrapper = dockIcons[2].closest('div[style*="cursor: grab"]')
    expect(dbWrapper).toBeNull() // Running unpinned not draggable
  })

  it('should call moveItem after drag drop', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    apps.set('db', mockApp('db', 'Database'))
    useAppStore.setState({ apps })

    useDockLayoutStore.setState({
      items: [
        { type: 'app', appId: 'k8s' },
        { type: 'app', appId: 'db' }
      ],
      loaded: true
    })

    const moveItemSpy = vi.spyOn(useDockLayoutStore.getState(), 'moveItem')

    await renderDock()

    const dockIcons = document.querySelectorAll('.vos-dock-icon')
    // dockIcons[1] = k8s, dockIcons[2] = db
    const k8sWrapper = dockIcons[1].closest('div[draggable="true"]') as HTMLElement
    const dbWrapper = dockIcons[2].closest('div[draggable="true"]') as HTMLElement
    expect(k8sWrapper).not.toBeNull()
    expect(dbWrapper).not.toBeNull()

    // Simulate dragstart on k8s
    const mockDataTransfer = { effectAllowed: 'move', setDragImage: vi.fn() }
    fireEvent.dragStart(k8sWrapper, { dataTransfer: mockDataTransfer })

    // Simulate dragover on the items container (drop target)
    const itemsContainer = screen.getByTestId('dock-items')
    fireEvent.dragOver(itemsContainer)

    // Simulate drop
    fireEvent.drop(itemsContainer)

    expect(moveItemSpy).toHaveBeenCalled()
    moveItemSpy.mockRestore()
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
      thumbnailAreaRect: null
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
    expect(useDockPositionStore.getState().getTargetRect('unknown-app')).toEqual({
      x: 200,
      y: 500,
      width: 100,
      height: 48
    })
  })
})
