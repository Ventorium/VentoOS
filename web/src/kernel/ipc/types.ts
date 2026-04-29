/**
 * IPC EventBus — Type Definitions
 *
 * Layer 1 (Kernel) inter-app communication type system.
 * Provides typed event topics, payloads, and registration contracts.
 */

// ─── Event Payload Base ─────────────────────────────────────────────────────

/** Base fields automatically attached to every event by the EventBus */
export interface EventPayloadBase {
  /** Unique event tracking ID (auto-generated) */
  readonly eventId: string
  /** Sender application ID */
  readonly senderId: string
  /** Event creation timestamp */
  readonly timestamp: number
}

// ─── Predefined Event Payloads ──────────────────────────────────────────────

/** K8s context info for port-forward based connections */
export interface K8sPortForwardContext {
  cluster: string
  namespace: string
  service: string
  portName?: string
}

/** Open database event payload (covers PostgreSQL, MySQL, SQLite) */
export interface OpenDatabasePayload extends EventPayloadBase {
  dbType: 'postgresql' | 'mysql' | 'sqlite'
  /** Display name for the connection */
  name?: string
  /** Database host (post port-forward address) */
  host: string
  /** Database port */
  port: number
  /** Database name */
  database?: string
  /** Username */
  username?: string
  /** Password (sensitive — not logged by EventBus) */
  password?: string
  /** Additional connection parameters */
  params?: Record<string, string>
  /** Existing connection ID (edit mode if present, create mode if absent) */
  connectionId?: string
  /** Auto-connect after adding/updating (default: true) */
  autoConnect?: boolean
  /** K8s origin context for port-forward setup */
  k8sContext?: K8sPortForwardContext
}

/** Open Redis event payload */
export interface OpenRedisPayload extends EventPayloadBase {
  name?: string
  host: string
  port: number
  password?: string
  db?: number
  connectionId?: string
  autoConnect?: boolean
  k8sContext?: K8sPortForwardContext
}

/** Open terminal event payload */
export interface OpenTerminalPayload extends EventPayloadBase {
  /** Connection target (SSH address, K8s pod, etc.) */
  target?: string
  /** Working directory */
  workingDirectory?: string
  /** Associated connection ID */
  connectionId?: string
}

/** Open file explorer event payload */
export interface OpenExplorerPayload extends EventPayloadBase {
  /** Initial path */
  path?: string
  /** Associated connection ID */
  connectionId?: string
}

/** Navigate to K8s resource event payload */
export interface NavigateResourcePayload extends EventPayloadBase {
  resourceType: string
  resourceName: string
  namespace: string
  cluster?: string
}

// ─── System Event Map ───────────────────────────────────────────────────────

/**
 * System predefined event topic → payload type mapping.
 *
 * Apps can extend this map via module augmentation:
 * @example
 * declare module '@/kernel/ipc/types' {
 *   interface AppEventMap {
 *     'custom:my-event': MyCustomPayload
 *   }
 * }
 */
export interface SystemEventMap {
  'open:postgres': OpenDatabasePayload
  'open:mysql': OpenDatabasePayload
  'open:sqlite': OpenDatabasePayload
  'open:redis': OpenRedisPayload
  'open:terminal': OpenTerminalPayload
  'open:explorer': OpenExplorerPayload
  'navigate:resource': NavigateResourcePayload
}

/** Extended event map (union of system + app-defined events) */
export interface AppEventMap extends SystemEventMap {}

/** All supported event topics */
export type EventTopic = keyof AppEventMap

/** Get the payload type for a given event topic */
export type EventPayloadOf<T extends EventTopic> = AppEventMap[T]

// ─── Event Declarations (for AppManifest) ───────────────────────────────────

/** Declaration of an event an app can emit */
export interface EventEmitDecl<T extends EventTopic = EventTopic> {
  topic: T
  /** Human-readable description for docs and debugging */
  description?: string
}

/** Declaration of an event an app can handle */
export interface EventHandleDecl<T extends EventTopic = EventTopic> {
  topic: T
  /** Whether to auto-open the app window when event arrives (default: true) */
  autoOpen?: boolean
  /** Handler priority — lower runs first (default: 0) */
  priority?: number
  description?: string
}

// ─── Runtime Registration ───────────────────────────────────────────────────

/** Runtime event handler registration record */
export interface EventRegistration<T extends EventTopic = EventTopic> {
  topic: T
  handler: (payload: EventPayloadOf<T>) => void | Promise<void>
  appId: string
  priority: number
}

// ─── Event Log Entry ────────────────────────────────────────────────────────

/** Event log entry for debugging */
export interface EventLogEntry {
  eventId: string
  topic: string
  senderId: string
  targetAppIds: string[]
  timestamp: number
  /** Sanitized payload (passwords redacted) */
  payload: Record<string, unknown>
}
