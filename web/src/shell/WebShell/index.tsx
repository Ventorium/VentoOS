/**
 * WebShell — xterm.js terminal connected via WebSocket
 *
 * Props:
 *   target  'local' | SSH server UUID
 *   onClose optional callback when connection closes
 */
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/services/auth'

interface WebShellProps {
  target?: string
  cwd?: string
  onClose?: () => void
}

export default function WebShell({ target = 'local', cwd, onClose }: WebShellProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      theme: {
        background: '#0d0d0d',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      scrollback: 5000,
      allowTransparency: false,
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

    // Determine WebSocket URL — dev uses proxy, prod same origin
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${wsProtocol}//${window.location.host}`
    const token = useAuthStore.getState().token ?? ''
    let url = `${wsBase}/ws/shell?target=${encodeURIComponent(target)}&token=${encodeURIComponent(token)}`
    if (cwd) {
      url += `&cwd=${encodeURIComponent(cwd)}`
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // Send initial terminal size
      const cols = term.cols
      const rows = term.rows
      ws.send(`\x1b[resize:${cols}x${rows}`)
    }

    ws.onmessage = ev => {
      if (typeof ev.data === 'string') {
        term.write(ev.data)
      } else {
        // Blob/ArrayBuffer
        ev.data.text?.().then((t: string) => term.write(t))
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[90m[连接已断开]\x1b[0m')
      onClose?.()
    }

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m[连接错误]\x1b[0m')
    }

    // Forward keyboard input to WebSocket
    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // Send resize events
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\x1b[resize:${cols}x${rows}`)
      }
    })

    // ResizeObserver to auto-fit
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        /* ignore */
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      ws.close()
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, cwd])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#0d0d0d',
        padding: '4px 6px',
        overflow: 'hidden'
      }}
    />
  )
}
