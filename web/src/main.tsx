import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import '@/assets/styles/app.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import { builtinManifests } from './apps/index'
import { bootKernel, registerApps } from '@/kernel'
import { useAuthStore } from '@/services/auth'
import { useKeyboardStore } from '@/services/keyboard'
import { useSystemStore } from '@/services/system'

// Boot kernel: configure API client with auth callbacks + connect WebSocket
const cleanupKernel = bootKernel({
  tokenProvider: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().lock(),
})

// Register built-in applications
registerApps(builtinManifests)

// Boot OS-level monitors (clock, battery, network, reduced-motion)
const cleanupSystemMonitors = useSystemStore.getState().initSystemMonitors()

// Register global keyboard shortcut handler
document.addEventListener('keydown', useKeyboardStore.getState().handleKeyDown)

const root = createRoot(document.getElementById('root')!)
root.render(<App />)

// Cleanup on hot reload (Vite HMR)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupKernel()
    cleanupSystemMonitors()
    document.removeEventListener('keydown', useKeyboardStore.getState().handleKeyDown)
  })
}
