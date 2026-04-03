import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/kernel/apps/store'
import { useWindowStore } from '@/kernel/window/store'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import type { AppManifest } from '@/kernel/apps/manifest'
import React from 'react'

vi.mock('framer-motion', () => {
  const actual = {
    motion: new Proxy({}, {
      get: (_target, prop) => {
        const { forwardRef } = require('react')
        return forwardRef((props: Record<string, unknown>, ref: unknown) => {
          const { children, animate, initial, exit, transition, whileHover, whileTap, variants, ...rest } = props
          const Tag = prop as string
          return <Tag ref={ref} {...rest}>{children}</Tag>
        })
      }
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: (initial: number) => ({ get: () => initial, set: vi.fn() }),
    useSpring: (val: unknown) => val,
    useTransform: () => ({ get: () => 0 }),
  }
  return actual
})

vi.mock('@/infra/api', () => ({
  apiClient: {
    saveWindowSettings: vi.fn().mockResolvedValue({}),
    getWindowSettings: vi.fn().mockResolvedValue({ data: [] }),
    createProcess: vi.fn().mockResolvedValue({ data: { pid: 1 } }),
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

const mockApp = (id: string, name: string, description?: string): AppManifest => ({
  id,
  name,
  version: '1.0.0',
  author: { name: 'test' },
  icon: React.createElement('span', { 'data-testid': `icon-${id}` }, name[0]),
  description,
  multiWindow: false,
  component: () => Promise.resolve({ default: () => null as unknown as React.ReactElement }),
})

describe('Launchpad Store', () => {
  beforeEach(() => {
    useLaunchpadStore.setState({ isOpen: false, searchQuery: '' })
  })

  it('should open launchpad', () => {
    useLaunchpadStore.getState().open()
    expect(useLaunchpadStore.getState().isOpen).toBe(true)
  })

  it('should close launchpad', () => {
    useLaunchpadStore.getState().open()
    useLaunchpadStore.getState().close()
    expect(useLaunchpadStore.getState().isOpen).toBe(false)
  })

  it('should toggle launchpad', () => {
    useLaunchpadStore.getState().toggle()
    expect(useLaunchpadStore.getState().isOpen).toBe(true)
    useLaunchpadStore.getState().toggle()
    expect(useLaunchpadStore.getState().isOpen).toBe(false)
  })

  it('should clear search on open', () => {
    useLaunchpadStore.setState({ searchQuery: 'old query' })
    useLaunchpadStore.getState().open()
    expect(useLaunchpadStore.getState().searchQuery).toBe('')
  })

  it('should clear search on close', () => {
    useLaunchpadStore.setState({ isOpen: true, searchQuery: 'test' })
    useLaunchpadStore.getState().close()
    expect(useLaunchpadStore.getState().searchQuery).toBe('')
  })

  it('should set search query', () => {
    useLaunchpadStore.getState().setSearch('kubernetes')
    expect(useLaunchpadStore.getState().searchQuery).toBe('kubernetes')
  })
})

describe('Launchpad Component', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: [], nextZIndex: 1 })
    useAppStore.setState({ apps: new Map() })
    useLaunchpadStore.setState({ isOpen: false, searchQuery: '' })
  })

  afterEach(() => {
    cleanup()
  })

  async function renderLaunchpad() {
    const Launchpad = (await import('@/shell/Launchpad/index')).default
    return render(<Launchpad />)
  }

  it('should not render when closed', async () => {
    useLaunchpadStore.setState({ isOpen: false })
    await renderLaunchpad()
    expect(screen.queryByPlaceholderText('搜索')).not.toBeInTheDocument()
  })

  it('should render search input when open', async () => {
    useLaunchpadStore.setState({ isOpen: true })
    await renderLaunchpad()
    expect(screen.getByPlaceholderText('搜索')).toBeInTheDocument()
  })

  it('should render all apps when no search', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    apps.set('db', mockApp('db', 'Database'))
    apps.set('redis', mockApp('redis', 'Redis'))
    useAppStore.setState({ apps })
    useLaunchpadStore.setState({ isOpen: true })

    await renderLaunchpad()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.getByText('Database')).toBeInTheDocument()
    expect(screen.getByText('Redis')).toBeInTheDocument()
  })

  it('should filter apps by name search', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    apps.set('db', mockApp('db', 'Database'))
    apps.set('redis', mockApp('redis', 'Redis'))
    useAppStore.setState({ apps })
    useLaunchpadStore.setState({ isOpen: true, searchQuery: 'kube' })

    await renderLaunchpad()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.queryByText('Database')).not.toBeInTheDocument()
    expect(screen.queryByText('Redis')).not.toBeInTheDocument()
  })

  it('should filter apps by description search', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes', 'Container orchestration'))
    apps.set('db', mockApp('db', 'Database', 'SQL management'))
    useAppStore.setState({ apps })
    useLaunchpadStore.setState({ isOpen: true, searchQuery: 'container' })

    await renderLaunchpad()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.queryByText('Database')).not.toBeInTheDocument()
  })

  it('should show empty state when no results', async () => {
    const apps = new Map<string, AppManifest>()
    apps.set('k8s', mockApp('k8s', 'Kubernetes'))
    useAppStore.setState({ apps })
    useLaunchpadStore.setState({ isOpen: true, searchQuery: 'zzzzzzz' })

    await renderLaunchpad()
    expect(screen.getByText('未找到应用')).toBeInTheDocument()
  })

  it('should close on Escape key', async () => {
    useLaunchpadStore.setState({ isOpen: true })
    await renderLaunchpad()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useLaunchpadStore.getState().isOpen).toBe(false)
  })
})
