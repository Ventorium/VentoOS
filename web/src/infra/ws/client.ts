/**
 * WebSocket Client
 *
 * Persistent WebSocket client with auto-reconnect and typed message dispatch.
 */

import type { ClientMessage, ServerMessage } from './types'

type MessageHandler<T = unknown> = (data: T) => void

class WsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private url: string
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.url = `${proto}//${window.location.host}/ws`
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        // Start heartbeat
        this.pingInterval = setInterval(() => {
          this.send({ type: 'Ping' })
        }, 30_000)
      }

      this.ws.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data as string) as ServerMessage
          const type = (msg as { type: string }).type

          // Dispatch to typed handlers
          const handlers = this.handlers.get(type)
          if (handlers) {
            const payload = 'data' in msg ? msg.data : undefined
            for (const fn of handlers) fn(payload)
          }

          // Wildcard handlers receive the full message
          const wildcardHandlers = this.handlers.get('*')
          if (wildcardHandlers) {
            for (const fn of wildcardHandlers) fn(msg)
          }
        } catch {
          // Ignore non-JSON or malformed messages
        }
      }

      this.ws.onclose = () => {
        this.clearPing()
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private clearPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3_000)
  }

  /**
   * Subscribe to a specific server message type.
   * Returns an unsubscribe function.
   */
  on<K extends ServerMessage['type']>(
    type: K,
    handler: MessageHandler<Extract<ServerMessage, { type: K }> extends { data: infer D } ? D : undefined>
  ): () => void {
    const set = this.handlers.get(type)
    if (set) {
      set.add(handler as MessageHandler)
    } else {
      this.handlers.set(type, new Set([handler as MessageHandler]))
    }
    return () => {
      this.handlers.get(type)?.delete(handler as MessageHandler)
    }
  }

  /** Subscribe to all messages (wildcard '*'). Returns unsubscribe. */
  onAny(handler: MessageHandler<ServerMessage>): () => void {
    const set = this.handlers.get('*')
    if (set) {
      set.add(handler as MessageHandler)
    } else {
      this.handlers.set('*', new Set([handler as MessageHandler]))
    }
    return () => {
      this.handlers.get('*')?.delete(handler as MessageHandler)
    }
  }

  /** Send a typed message to the backend. */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  disconnect(): void {
    this.clearPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }
}

/** Singleton WebSocket client. Connect during app bootstrap. */
export const wsClient = new WsClient()
