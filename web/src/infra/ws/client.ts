/**
 * WebSocket Client
 *
 * Persistent WebSocket client with auto-reconnect and typed message dispatch.
 */

import type { ClientMessage, ServerMessage } from './types'

type MessageHandler<T = unknown> = (data: T) => void

/** Function that returns the current auth token (or null if not authenticated). */
type TokenProvider = () => string | null

export class WsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler>>()
  private channelRefs = new Map<string, number>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private baseUrl: string
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private tokenProvider: TokenProvider = () => null

  constructor() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.baseUrl = `${proto}//${window.location.host}/ws`
  }

  /** Set the token provider (called during kernel bootstrap). */
  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const token = this.tokenProvider()
    // Don't connect without a valid token
    if (!token) return

    try {
      const url = `${this.baseUrl}?token=${encodeURIComponent(token)}`
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.flushSubscriptions()

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

  subscribeChannel(channel: string): () => void {
    const current = this.channelRefs.get(channel) ?? 0
    this.channelRefs.set(channel, current + 1)

    if (current === 0) {
      this.send({ type: 'Subscribe', data: { channel } })
    }

    return () => {
      const next = (this.channelRefs.get(channel) ?? 1) - 1
      if (next <= 0) {
        this.channelRefs.delete(channel)
        this.send({ type: 'Unsubscribe', data: { channel } })
        return
      }

      this.channelRefs.set(channel, next)
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

  private flushSubscriptions(): void {
    for (const channel of this.channelRefs.keys()) {
      this.send({ type: 'Subscribe', data: { channel } })
    }
  }
}

/** Singleton WebSocket client. Connect during app bootstrap. */
export const wsClient = new WsClient()
