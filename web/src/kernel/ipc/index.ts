/**
 * IPC EventBus — Public API
 *
 * Layer 1 (Kernel) inter-app communication bus.
 */

export { eventBus } from './event-bus'
export { useEventEmitter, useEventHandler } from './hooks'
export type {
  AppEventMap,
  EventEmitDecl,
  EventHandleDecl,
  EventLogEntry,
  EventPayloadBase,
  EventPayloadOf,
  EventRegistration,
  EventTopic,
  HandlerTraceResult,
  K8sPortForwardContext,
  NavigateResourcePayload,
  OpenDatabasePayload,
  OpenExplorerPayload,
  OpenRedisPayload,
  OpenTerminalPayload,
  SystemEventMap,
} from './types'
