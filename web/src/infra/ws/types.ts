/**
 * WebSocket Message Types
 *
 * Mirrors the Rust backend ServerMessage / ClientMessage enums.
 * Keep in sync with ventoos-core/src/ws.rs
 */

// ─── Server → Client ───────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'Pong' }
  | { type: 'ProcessUpdate'; data: ProcessUpdatePayload }
  | { type: 'TaskUpdate'; data: TaskUpdatePayload }
  | { type: 'Notification'; data: NotificationPayload }
  | { type: 'ConnectionStatus'; data: ConnectionStatusPayload }
  | { type: 'AppMessage'; data: { app_id: string; payload: unknown } }

export interface ProcessUpdatePayload {
  pid: number
  window_id: string
  app_id: string
  status: 'running' | 'suspended' | 'terminated'
}

export interface TaskUpdatePayload {
  id: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  progress?: number
  message?: string
}

export interface NotificationPayload {
  id: string
  title: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  source?: string
}

export interface ConnectionStatusPayload {
  connection_id: string
  status: 'connected' | 'disconnected' | 'error'
  error?: string
}

// ─── Client → Server ───────────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'Ping' }
  | { type: 'Subscribe'; data: { channel: string } }
  | { type: 'Unsubscribe'; data: { channel: string } }
  | { type: 'AppMessage'; data: { app_id: string; payload: unknown } }
