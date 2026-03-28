type EventHandler = (data: unknown) => void

/**
 * Persistent WebSocket client that auto-reconnects.
 * Dispatches backend events (task updates, notifications, etc.)
 */
class WsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<EventHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private url: string

  constructor() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.url = `${proto}//${window.location.host}/ws`
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data)
          const type = msg.type as string | undefined
          if (type) {
            const handlers = this.handlers.get(type)
            if (handlers) {
              for (const fn of handlers) fn(msg.data)
            }
          }
          // Also emit wildcard
          const wildcardHandlers = this.handlers.get('*')
          if (wildcardHandlers) {
            for (const fn of wildcardHandlers) fn(msg)
          }
        } catch {
          // ignore non-JSON
        }
      }

      this.ws.onclose = () => {
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  /** Subscribe to a specific event type. Returns unsubscribe function. */
  on(type: string, handler: EventHandler): () => void {
    const set = this.handlers.get(type)
    if (set) {
      set.add(handler)
    } else {
      this.handlers.set(type, new Set([handler]))
    }
    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  /** Send a message to the server */
  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }
}

export const wsClient = new WsClient()
