/**
 * IPC EventBus — Core Implementation
 *
 * Layer 1 (Kernel) inter-app communication bus.
 * Enables typed event emission and handling between applications.
 *
 * Design:
 * - Apps declare emits/handles in their AppManifest
 * - emit() validates sender permission against manifest
 * - Handlers are sorted by priority before execution
 * - Auto-open: if target app has no window and autoOpen=true, opens it
 * - Event log: ring buffer of recent events for debugging
 * - Sensitive fields (password) are redacted in logs
 */

import { createLogger } from '@/infra/logger'
import { useAppStore } from '../apps/store'
import type { EventLogEntry, EventPayloadBase, EventPayloadOf, EventRegistration, EventTopic, HandlerTraceResult } from './types'

const logger = createLogger('kernel/ipc')

// ─── Sensitive field redaction ───────────────────────────────────────────────

const SENSITIVE_KEYS = new Set(['password', 'secret', 'token', 'credential', 'privateKey'])

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '***REDACTED***'
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizePayload(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

// ─── ID generation ──────────────────────────────────────────────────────────

let _eventCounter = 0
function generateEventId(): string {
  return `evt-${Date.now()}-${++_eventCounter}`
}

// ─── EventBus Implementation ────────────────────────────────────────────────

const LOG_BUFFER_SIZE = 100

class EventBusImpl {
  /** topic → Set of registrations */
  private handlers = new Map<string, Set<EventRegistration>>()
  /** appId → Set of cleanup functions */
  private appCleanups = new Map<string, Set<() => void>>()
  /** Circular buffer for event log */
  private eventLog: EventLogEntry[] = []
  /** Track processed event IDs to prevent duplicate processing */
  private processedEvents = new Set<string>()
  /** Subscribers for real-time event log notifications */
  private listeners = new Set<(entry: EventLogEntry) => void>()

  /**
   * Subscribe to real-time event log updates.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (entry: EventLogEntry) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Register an event handler for an application.
   * Typically called during the app's onActivate lifecycle.
   * Returns an unsubscribe function.
   *
   * @example
   * eventBus.on('database', 'open:postgres', async (payload) => {
   *   await addOrUpdateConnection(payload)
   * })
   */
  on<T extends EventTopic>(
    appId: string,
    topic: T,
    handler: (payload: EventPayloadOf<T>) => void | Promise<void>,
    options?: { priority?: number }
  ): () => void {
    // Validate that the app manifest declares this topic in handles
    const manifest = useAppStore.getState().getApp(appId)
    if (!manifest) {
      logger.warn(`Cannot register handler: unknown app "${appId}"`)
      return () => {}
    }

    if (manifest.handles && manifest.handles.length > 0) {
      const declared = manifest.handles.some(h => h.topic === topic)
      if (!declared) {
        logger.warn(`App "${appId}" did not declare handles for "${topic}" in manifest`)
        return () => {}
      }
    }

    const registration: EventRegistration<T> = {
      topic,
      handler: handler as EventRegistration['handler'],
      appId,
      priority: options?.priority ?? 0,
    }

    const set = this.handlers.get(topic)
    if (set) {
      set.add(registration as EventRegistration)
    } else {
      this.handlers.set(topic, new Set([registration as EventRegistration]))
    }

    // Track cleanup for this app
    const cleanup = () => {
      this.handlers.get(topic)?.delete(registration as EventRegistration)
    }
    const cleanups = this.appCleanups.get(appId)
    if (cleanups) {
      cleanups.add(cleanup)
    } else {
      this.appCleanups.set(appId, new Set([cleanup]))
    }

    logger.info(`Registered handler: ${appId} → ${topic}`)
    return cleanup
  }

  /**
   * Emit an event.
   * Validates sender permission against its manifest.
   * Auto-attaches eventId, senderId, timestamp.
   * If target app is not open and has autoOpen=true, opens its window.
   *
   * @example
   * await eventBus.emit('kubernetes', 'open:postgres', {
   *   dbType: 'postgresql',
   *   host: 'localhost',
   *   port: 5432,
   * })
   */
  async emit<T extends EventTopic>(
    senderId: string,
    topic: T,
    payload: Omit<EventPayloadOf<T>, keyof EventPayloadBase>
  ): Promise<void> {
    // 1. Validate sender manifest declares this topic in emits
    const senderManifest = useAppStore.getState().getApp(senderId)
    if (!senderManifest) {
      logger.warn(`Cannot emit: unknown sender app "${senderId}"`)
      return
    }

    if (senderManifest.emits && senderManifest.emits.length > 0) {
      const declared = senderManifest.emits.some(e => e.topic === topic)
      if (!declared) {
        logger.warn(`App "${senderId}" did not declare emits for "${topic}" in manifest`)
        return
      }
    }

    // 2. Build full payload
    const eventId = generateEventId()
    const fullPayload = {
      ...payload,
      eventId,
      senderId,
      timestamp: Date.now(),
    } as EventPayloadOf<T>

    // 3. Deduplicate
    if (this.processedEvents.has(eventId)) {
      logger.warn(`Duplicate event ${eventId} detected, skipping`)
      return
    }
    this.processedEvents.add(eventId)

    // Trim dedup set if too large
    if (this.processedEvents.size > 1000) {
      const iter = this.processedEvents.values()
      for (let i = 0; i < 500; i++) {
        const val = iter.next().value
        if (val) this.processedEvents.delete(val)
      }
    }

    // 4. Find handlers
    const registrations = this.handlers.get(topic)
    if (!registrations || registrations.size === 0) {
      logger.info(`No handlers registered for "${topic}"`)
      this.logEvent(eventId, topic, senderId, [], fullPayload)
      return
    }

    // 5. Sort by priority
    const sorted = [...registrations].sort((a, b) => a.priority - b.priority)
    const targetAppIds = sorted.map(r => r.appId)

    // 6. Auto-open target apps that have autoOpen=true and no window
    for (const reg of sorted) {
      const targetManifest = useAppStore.getState().getApp(reg.appId)
      if (!targetManifest) continue

      const handleDecl = targetManifest.handles?.find(h => h.topic === topic)
      const autoOpen = handleDecl?.autoOpen ?? true

      if (autoOpen) {
        // Import dynamically to avoid circular dependency
        const { useWindowStore } = await import('../window/store')
        const existingWindows = useWindowStore.getState().getWindowsByApp(reg.appId)
        if (existingWindows.length === 0) {
          const { openWindow } = await import('../window/manager')
          logger.info(`Auto-opening app "${reg.appId}" for event "${topic}"`)
          await openWindow(reg.appId)
        } else {
          // Focus existing window
          const { focusWindow } = await import('../window/manager')
          await focusWindow(existingWindows[0].id)
        }
      }
    }

    // 7. Execute handlers with timing
    const handlerResults: HandlerTraceResult[] = []
    const emitStart = performance.now()
    logger.info(`Emitting "${topic}" from "${senderId}" to ${targetAppIds.join(', ')}`)

    for (const reg of sorted) {
      const start = performance.now()
      try {
        await reg.handler(fullPayload)
        handlerResults.push({ appId: reg.appId, durationMs: performance.now() - start, success: true })
      } catch (err) {
        handlerResults.push({ appId: reg.appId, durationMs: performance.now() - start, success: false, error: String(err) })
        logger.error(`Handler error: ${reg.appId} → ${topic}`, err)
      }
    }

    this.logEvent(eventId, topic, senderId, targetAppIds, fullPayload, handlerResults, performance.now() - emitStart)
  }

  /**
   * Get all registered handlers for a given event topic.
   */
  getHandlers(topic: EventTopic): EventRegistration[] {
    const set = this.handlers.get(topic)
    if (!set) return []
    return [...set].sort((a, b) => a.priority - b.priority)
  }

  /**
   * Get all event handlers registered by a specific app.
   */
  getAppHandlers(appId: string): EventRegistration[] {
    const result: EventRegistration[] = []
    for (const set of this.handlers.values()) {
      for (const reg of set) {
        if (reg.appId === appId) result.push(reg)
      }
    }
    return result
  }

  /**
   * Unregister all event handlers for an app.
   * Called when the app's last window closes (onDeactivate).
   */
  unregisterApp(appId: string): void {
    const cleanups = this.appCleanups.get(appId)
    if (cleanups) {
      for (const fn of cleanups) fn()
      this.appCleanups.delete(appId)
    }
    logger.info(`Unregistered all handlers for app "${appId}"`)
  }

  /**
   * Get recent event log entries (for debugging).
   */
  getRecentEvents(count = 20): EventLogEntry[] {
    return this.eventLog.slice(-count)
  }

  /**
   * Clear the event log.
   */
  clearLog(): void {
    this.eventLog = []
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private logEvent(
    eventId: string,
    topic: string,
    senderId: string,
    targetAppIds: string[],
    payload: Record<string, unknown>,
    handlerResults?: HandlerTraceResult[],
    durationMs?: number
  ): void {
    const entry: EventLogEntry = {
      eventId,
      topic,
      senderId,
      targetAppIds,
      timestamp: Date.now(),
      payload: sanitizePayload(payload),
      handlerResults,
      durationMs,
    }

    this.eventLog.push(entry)
    if (this.eventLog.length > LOG_BUFFER_SIZE) {
      this.eventLog = this.eventLog.slice(-LOG_BUFFER_SIZE)
    }

    // Notify subscribers
    for (const listener of this.listeners) {
      try { listener(entry) } catch { /* ignore listener errors */ }
    }
  }
}

/** Singleton EventBus instance */
export const eventBus = new EventBusImpl()
