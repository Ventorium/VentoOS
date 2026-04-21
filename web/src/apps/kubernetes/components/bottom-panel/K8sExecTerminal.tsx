import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { useAuthStore } from '@/services/auth'

interface Props {
  clusterId: string
  namespace: string
  podName: string
  container?: string
  shell?: string
}

export function K8sExecTerminal({ clusterId, namespace, podName, container, shell = '/bin/sh' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
      theme: {
        background: '#0d0d0d',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4'
      },
      scrollback: 5000,
      convertEol: true
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    termRef.current = term
    fitAddonRef.current = fitAddon

    term.open(containerRef.current)
    fitAddon.fit()

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${wsProtocol}//${window.location.host}`
    const token = useAuthStore.getState().token ?? ''
    const params = new URLSearchParams({ namespace })
    if (container) params.set('container', container)
    if (token) params.set('token', token)
    const url = `${wsBase}/api/k8s/clusters/${encodeURIComponent(clusterId)}/pods/${encodeURIComponent(podName)}/exec?${params.toString()}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      const cols = term.cols
      const rows = term.rows
      ws.send(JSON.stringify({ type: 'resize', data: { cols, rows } }))
    }

    ws.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'stdout') {
          term.write(msg.data)
        } else if (msg.type === 'error') {
          term.writeln(`\r\n\x1b[31m[Error: ${msg.data}]\x1b[0m`)
        } else if (msg.type === 'close') {
          term.writeln('\r\n\x1b[90m[Session closed]\x1b[0m')
        }
      } catch {
        term.write(String(ev.data))
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[90m[Connection closed]\x1b[0m')
    }

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m[Connection error]\x1b[0m')
    }

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stdin', data }))
      }
    })

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', data: { cols, rows } }))
      }
    })

    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        /* ignore */
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  }, [clusterId, namespace, podName, container, shell])

  return (
    <div className="w-full h-full relative overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden relative z-[1] px-[6px] py-1"
        style={{ background: '#0d0d0d' }}
      />
    </div>
  )
}
