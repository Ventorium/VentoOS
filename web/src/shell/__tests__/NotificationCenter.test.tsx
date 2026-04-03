import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore, type NotificationItem } from '@/services/notification'
import React from 'react'

// Mock framer-motion
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
  }
  return actual
})

vi.mock('@/theme', () => ({
  tokens: {
    topBar: { height: 36 },
    radius: { panel: 12 },
    shadow: { overlay: 'none' },
  },
}))

function makeNotif(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: overrides.id ?? `notif-${Date.now()}-${Math.random()}`,
    title: 'Test Notification',
    message: 'Test message',
    level: 'info',
    read: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('NotificationCenter Store', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], panelOpen: false, doNotDisturb: false })
  })

  it('should add a notification', () => {
    const n = makeNotif({ id: 'n1' })
    useNotificationStore.getState()._addNotification(n)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotificationStore.getState().notifications[0].id).toBe('n1')
  })

  it('should prepend new notifications (newest first)', () => {
    const n1 = makeNotif({ id: 'n1', title: 'First' })
    const n2 = makeNotif({ id: 'n2', title: 'Second' })
    useNotificationStore.getState()._addNotification(n1)
    useNotificationStore.getState()._addNotification(n2)
    const items = useNotificationStore.getState().notifications
    expect(items[0].id).toBe('n2')
    expect(items[1].id).toBe('n1')
  })

  it('should mark a notification as read', () => {
    const n = makeNotif({ id: 'n1', read: false })
    useNotificationStore.getState()._addNotification(n)
    useNotificationStore.getState().markAsRead('n1')
    expect(useNotificationStore.getState().notifications[0].read).toBe(true)
  })

  it('should mark all as read', () => {
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n1', read: false }))
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n2', read: false }))
    useNotificationStore.getState().markAllAsRead()
    const items = useNotificationStore.getState().notifications
    expect(items.every(n => n.read)).toBe(true)
  })

  it('should remove a notification', () => {
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n1' }))
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n2' }))
    useNotificationStore.getState().removeNotification('n1')
    const items = useNotificationStore.getState().notifications
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('n2')
  })

  it('should clear all notifications', () => {
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n1' }))
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n2' }))
    useNotificationStore.getState().clearAll()
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('should toggle panel', () => {
    expect(useNotificationStore.getState().panelOpen).toBe(false)
    useNotificationStore.getState().togglePanel()
    expect(useNotificationStore.getState().panelOpen).toBe(true)
    useNotificationStore.getState().togglePanel()
    expect(useNotificationStore.getState().panelOpen).toBe(false)
  })

  it('should set panel open state', () => {
    useNotificationStore.getState().setPanel(true)
    expect(useNotificationStore.getState().panelOpen).toBe(true)
    useNotificationStore.getState().setPanel(false)
    expect(useNotificationStore.getState().panelOpen).toBe(false)
  })

  it('should count unread notifications', () => {
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n1', read: false }))
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n2', read: true }))
    useNotificationStore.getState()._addNotification(makeNotif({ id: 'n3', read: false }))
    expect(useNotificationStore.getState().getUnreadCount()).toBe(2)
  })

  it('should toggle do not disturb', () => {
    expect(useNotificationStore.getState().doNotDisturb).toBe(false)
    useNotificationStore.getState().toggleDoNotDisturb()
    expect(useNotificationStore.getState().doNotDisturb).toBe(true)
  })

  it('should set do not disturb value', () => {
    useNotificationStore.getState().setDoNotDisturb(true)
    expect(useNotificationStore.getState().doNotDisturb).toBe(true)
    useNotificationStore.getState().setDoNotDisturb(false)
    expect(useNotificationStore.getState().doNotDisturb).toBe(false)
  })
})

describe('NotificationCenter Component', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], panelOpen: false, doNotDisturb: false })
  })

  afterEach(() => {
    cleanup()
  })

  async function renderNotificationCenter() {
    const NotificationCenter = (await import('@/shell/NotificationCenter/index')).default
    return render(<NotificationCenter />)
  }

  it('should not render when panel is closed', async () => {
    useNotificationStore.setState({ panelOpen: false })
    await renderNotificationCenter()
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
  })

  it('should render when panel is open', async () => {
    useNotificationStore.setState({ panelOpen: true })
    await renderNotificationCenter()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
  })

  it('should show empty state when no notifications', async () => {
    useNotificationStore.setState({ panelOpen: true, notifications: [] })
    await renderNotificationCenter()
    expect(screen.getByText('No notifications')).toBeInTheDocument()
  })

  it('should render notification items', async () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotif({ id: 'n1', title: 'Deploy Complete', message: 'Pod deployed successfully' }),
        makeNotif({ id: 'n2', title: 'Error Detected', message: 'Connection failed', level: 'error' }),
      ],
    })
    await renderNotificationCenter()
    expect(screen.getByText('Deploy Complete')).toBeInTheDocument()
    expect(screen.getByText('Pod deployed successfully')).toBeInTheDocument()
    expect(screen.getByText('Error Detected')).toBeInTheDocument()
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('should have Mark all read and Clear buttons', async () => {
    useNotificationStore.setState({ panelOpen: true })
    await renderNotificationCenter()
    expect(screen.getByText('Mark all read')).toBeInTheDocument()
    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('should clear all notifications when Clear is clicked', async () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [makeNotif({ id: 'n1', title: 'Test' })],
    })
    await renderNotificationCenter()
    fireEvent.click(screen.getByText('Clear'))
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('should mark all as read when Mark all read is clicked', async () => {
    useNotificationStore.setState({
      panelOpen: true,
      notifications: [
        makeNotif({ id: 'n1', read: false }),
        makeNotif({ id: 'n2', read: false }),
      ],
    })
    await renderNotificationCenter()
    fireEvent.click(screen.getByText('Mark all read'))
    expect(useNotificationStore.getState().notifications.every(n => n.read)).toBe(true)
  })
})
