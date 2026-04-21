/**
 * WebShell — xterm.js terminal connected via WebSocket
 *
 * Props:
 *   target  'local' | SSH server UUID
 *   paneId  optional pane registry key (for clear/write actions)
 *   onClose optional callback when connection closes
 */
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { useSuperTerminalStore } from '@/apps/super-terminal/store'
import { terminalRegistry } from '@/apps/super-terminal/terminalRegistry'
import { useAuthStore } from '@/services/auth'

interface WebShellProps {
  target?: string
  paneId?: string
  cwd?: string
  shell?: string
  onClose?: () => void
}

export default function WebShell({ target = 'local', paneId, cwd, shell, onClose }: WebShellProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  // Read terminal settings from store
  const terminalSettings = useSuperTerminalStore(s => s.terminalSettings)

  // Main terminal init effect
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: terminalSettings.fontSize,
      fontFamily: terminalSettings.fontFamily,
      theme: {
        background: terminalSettings.backgroundColor ?? '#0d0d0d',
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
      scrollback: terminalSettings.scrollback,
      allowTransparency: true,
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

    // Register clear/write/focus actions for this pane
    if (paneId) {
      terminalRegistry.set(paneId, {
        clear: () => term.clear(),
        write: (text: string) => {
          // Write text as if user typed it
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(text)
          }
        },
        focus: () => term.focus()
      })
    }

    // Determine WebSocket URL — dev uses proxy, prod same origin
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${wsProtocol}//${window.location.host}`
    const token = useAuthStore.getState().token ?? ''
    let url = `${wsBase}/ws/shell?target=${encodeURIComponent(target)}&token=${encodeURIComponent(token)}`
    if (cwd) {
      url += `&cwd=${encodeURIComponent(cwd)}`
    }
    if (shell) {
      url += `&shell=${encodeURIComponent(shell)}`
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      const cols = term.cols
      const rows = term.rows
      ws.send(`\x1b[resize:${cols}x${rows}`)
    }

    ws.onmessage = ev => {
      if (typeof ev.data === 'string') {
        term.write(ev.data)
      } else {
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

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\x1b[resize:${cols}x${rows}`)
      }
    })

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
      if (paneId) terminalRegistry.delete(paneId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, cwd, paneId])

  // Dynamically update font size / font family when settings change
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = terminalSettings.fontSize
    term.options.fontFamily = terminalSettings.fontFamily
    try {
      fitAddonRef.current?.fit()
    } catch {
      /* ignore */
    }
  }, [terminalSettings.fontSize, terminalSettings.fontFamily])

  // Dynamically update scrollback
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.scrollback = terminalSettings.scrollback
  }, [terminalSettings.scrollback])

  // Dynamically update background color
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = {
      ...term.options.theme,
      background: terminalSettings.backgroundColor ?? '#0d0d0d'
    }
  }, [terminalSettings.backgroundColor])

  const opacity = terminalSettings.backgroundOpacity ?? 1
  const bgImage = terminalSettings.backgroundImage

  return (
    <div className="w-full h-full relative overflow-hidden">
      {bgImage && (
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
          style={{
            backgroundImage: `url(${bgImage})`,
            opacity: 1 - opacity
          }}
        />
      )}
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden relative z-[1] px-[6px] py-1"
        style={{
          background: terminalSettings.backgroundColor ?? '#0d0d0d',
          opacity
        }}
      />
    </div>
  )
}
