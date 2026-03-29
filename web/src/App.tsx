import CommandPalette from '@/components/CommandPalette'
import ContextMenu from '@/components/ContextMenu'
import Desktop from '@/components/Desktop'
import Dock from '@/components/Dock'
import Launchpad from '@/components/Launchpad'
import LoginScreen from '@/components/LoginScreen'
import NotificationCenter from '@/components/NotificationCenter'
import NotificationToast from '@/components/NotificationToast'
import TaskCenter from '@/components/TaskCenter'
import TopBar from '@/components/TopBar'
import WindowManager from '@/components/WindowManager'
import { useThemeSync } from '@/hooks/useTheme'
import { useAuthStore } from '@/store/auth'
import { useEffect } from 'react'
import { api } from './api/client'

function App() {
  useThemeSync()
  const { token, initialized, locked, setInitialized, unlock } = useAuthStore()

  // On mount: check auth status from backend, auto-unlock if token is valid
  useEffect(() => {
    api.authStatus().then(res => {
      setInitialized(res.data.initialized)
      // If not initialized, skip lock screen — setup mode
      if (!res.data.initialized) {
        // Auto-setup with no password needed (will be prompted in LoginScreen)
      } else if (token) {
        // Re-validate stored token
        api.health()
          .then(() => unlock(token))
          .catch(() => useAuthStore.getState().lock())
      }
    }).catch(() => {
      // Backend not reachable — still show UI
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showLockScreen = locked || !token

  return (
    <div className="vos-shell">
      {showLockScreen ? (
        <LoginScreen />
      ) : (
        <>
          <Desktop />
          <TopBar />
          <WindowManager />
          <Dock />
          <NotificationCenter />
          <TaskCenter />
          <CommandPalette />
          <ContextMenu />
          <Launchpad />
          <NotificationToast />
        </>
      )}
    </div>
  )
}

export default App
