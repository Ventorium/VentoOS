import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import '@/assets/styles/app.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import { wsClient } from './api/ws'
import { registerBuiltinApps } from './apps/init'
import { useKeyboardStore } from './store/keyboard'
import { useSystemStore } from './store/system'

// Register built-in applications
registerBuiltinApps()

// Boot OS-level monitors (clock, battery, network, reduced-motion)
const cleanupSystemMonitors = useSystemStore.getState().initSystemMonitors()

// Register global keyboard shortcut handler
document.addEventListener('keydown', useKeyboardStore.getState().handleKeyDown)

// Connect WebSocket
wsClient.connect()

const root = createRoot(document.getElementById('root')!)
root.render(<App />)

// Cleanup on hot reload (Vite HMR)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupSystemMonitors()
    document.removeEventListener('keydown', useKeyboardStore.getState().handleKeyDown)
  })
}
