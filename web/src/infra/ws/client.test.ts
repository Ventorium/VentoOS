import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WsClient } from './client'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []

  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  triggerClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }
}

describe('WsClient channel subscription', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('deduplicates subscribe and unsubscribes only after last listener', () => {
    const client = new WsClient()
    client.setTokenProvider(() => 'token-1')
    client.connect()

    const ws = FakeWebSocket.instances[0]
    expect(ws.url).toContain('/ws?token=token-1')

    const unsubA = client.subscribeChannel('task_events')
    const unsubB = client.subscribeChannel('task_events')

    ws.triggerOpen()

    const subscribeMessages = ws.sent.filter(message => message.includes('"Subscribe"'))
    expect(subscribeMessages).toHaveLength(1)
    expect(subscribeMessages[0]).toContain('task_events')

    unsubA()
    expect(ws.sent.filter(message => message.includes('"Unsubscribe"'))).toHaveLength(0)

    unsubB()
    const unsubscribeMessages = ws.sent.filter(message => message.includes('"Unsubscribe"'))
    expect(unsubscribeMessages).toHaveLength(1)
    expect(unsubscribeMessages[0]).toContain('task_events')
  })

  it('replays active subscriptions after reconnect', () => {
    const client = new WsClient()
    client.setTokenProvider(() => 'token-2')
    client.connect()

    const ws1 = FakeWebSocket.instances[0]
    const unsubscribe = client.subscribeChannel('task_events')

    ws1.triggerOpen()
    ws1.sent = []

    ws1.triggerClose()
    vi.advanceTimersByTime(3_000)

    const ws2 = FakeWebSocket.instances[1]
    expect(ws2).toBeTruthy()
    ws2.triggerOpen()

    const replayMessages = ws2.sent.filter(message => message.includes('"Subscribe"'))
    expect(replayMessages).toHaveLength(1)
    expect(replayMessages[0]).toContain('task_events')

    unsubscribe()
  })
})
