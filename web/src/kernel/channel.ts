/**
 * System Notification Channel
 *
 * Layer 1 (Kernel) broadcast mechanism.
 * One-way: kernel/services emit → shell/apps subscribe.
 *
 * NOT a global EventBus. This channel has:
 * - A typed event map (no stringly-typed events)
 * - Clearly scoped consumers (UI components that need to react to OS events)
 * - No back-channel (subscribers can only listen, not emit)
 */

// ─── Event map ─────────────────────────────────────────────────────────────

export interface SystemNotifications {
  'window:opened': { windowId: string; appId: string }
  'window:closed': { windowId: string; appId: string }
  'window:focused': { windowId: string; appId: string }
  'window:minimized': { windowId: string }
  'window:restored': { windowId: string }
  'process:created': { pid: number; windowId: string; appId: string }
  'process:terminated': { pid: number; windowId: string }
  'process:suspended': { pid: number; windowId: string }
  'theme:changed': { mode: 'light' | 'dark' }
  'connection:status-changed': { connectionId: string; status: string }
  'task:completed': { taskId: string; success: boolean }
  'notification:added': { notificationId: string }
}

type Handler<T> = (data: T) => void

// ─── SystemChannel class ────────────────────────────────────────────────────

class SystemChannelImpl {
  private listeners = new Map<string, Set<Handler<unknown>>>()

  /**
   * Subscribe to a system notification.
   * Returns an unsubscribe function.
   *
   * Usage in React components:
   *   useEffect(() => systemChannel.subscribe('window:opened', handler), [])
   */
  subscribe<K extends keyof SystemNotifications>(event: K, handler: Handler<SystemNotifications[K]>): () => void {
    const set = this.listeners.get(event)
    if (set) {
      set.add(handler as Handler<unknown>)
    } else {
      this.listeners.set(event, new Set([handler as Handler<unknown>]))
    }
    return () => {
      this.listeners.get(event)?.delete(handler as Handler<unknown>)
    }
  }

  /**
   * Emit a system notification.
   * Only kernel and services should call this.
   * Shell components and apps should only subscribe.
   */
  notify<K extends keyof SystemNotifications>(event: K, data: SystemNotifications[K]): void {
    const set = this.listeners.get(event)
    if (set) {
      for (const fn of set) fn(data as unknown)
    }
  }
}

export const systemChannel = new SystemChannelImpl()
