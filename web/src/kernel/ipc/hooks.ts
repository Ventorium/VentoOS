/**
 * IPC EventBus — React Hooks
 *
 * Provides useEventHandler and useEventEmitter for React components.
 * Handlers registered via useEventHandler are automatically cleaned up
 * on component unmount.
 */

import { useCallback, useEffect, useRef } from 'react'
import { eventBus } from './event-bus'
import type { EventPayloadBase, EventPayloadOf, EventTopic } from './types'

/**
 * Register an event handler in a React component.
 * Automatically unregisters on unmount.
 *
 * @param appId - The application ID this component belongs to
 * @param topic - The event topic to handle
 * @param handler - The handler function
 * @param options - Optional configuration (priority)
 *
 * @example
 * function DatabaseApp({ windowId }: AppComponentProps) {
 *   useEventHandler('database', 'open:postgres', async (payload) => {
 *     await addOrUpdateConnection(payload)
 *   })
 *   return <div>...</div>
 * }
 */
export function useEventHandler<T extends EventTopic>(
  appId: string,
  topic: T,
  handler: (payload: EventPayloadOf<T>) => void | Promise<void>,
  options?: { priority?: number }
): void {
  // Use ref to keep handler reference stable across renders
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const stableHandler = (payload: EventPayloadOf<T>) => handlerRef.current(payload)
    const unsubscribe = eventBus.on(appId, topic, stableHandler, options)
    return unsubscribe
  }, [appId, topic, options?.priority])
}

/**
 * Get a typed event emitter function bound to a specific app.
 *
 * @param appId - The application ID that will be the sender
 * @returns A function that emits events with the correct types
 *
 * @example
 * function K8sApp({ windowId }: AppComponentProps) {
 *   const emit = useEventEmitter('kubernetes')
 *
 *   const handleOpenDatabase = () => {
 *     emit('open:postgres', {
 *       dbType: 'postgresql',
 *       host: 'localhost',
 *       port: 5432,
 *       database: 'mydb',
 *     })
 *   }
 * }
 */
export function useEventEmitter(
  appId: string
): <T extends EventTopic>(
  topic: T,
  payload: Omit<EventPayloadOf<T>, keyof EventPayloadBase>
) => Promise<void> {
  return useCallback(
    <T extends EventTopic>(
      topic: T,
      payload: Omit<EventPayloadOf<T>, keyof EventPayloadBase>
    ) => eventBus.emit(appId, topic, payload),
    [appId]
  )
}
