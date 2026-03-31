import { useEffect } from 'react'
import { useThemeSync } from '@/hooks/useTheme'
import { authService, useAuthStore } from '@/services/auth'
import AISidePanel from '@/shell/AISidePanel'
import CommandPalette from '@/shell/CommandPalette'
import ContextMenu from '@/shell/ContextMenu'
import Desktop from '@/shell/Desktop'
import Dock from '@/shell/Dock'
import Launchpad from '@/shell/Launchpad'
import LoginScreen from '@/shell/LoginScreen'
import NotificationCenter from '@/shell/NotificationCenter'
import NotificationToast from '@/shell/NotificationToast'
import TaskCenter from '@/shell/TaskCenter'
import TopBar from '@/shell/TopBar'
import WindowManager from '@/shell/WindowManager'

function App() {
  useThemeSync()
  const { token, initialized, locked, setInitialized } = useAuthStore()

  // On mount: check auth status from backend, auto-unlock if token is valid
  useEffect(() => {
    authService
      .checkStatus()
      .then(res => {
        setInitialized(res.initialized)
        if (res.initialized && token) {
          // Re-validate stored token
          authService.revalidateToken().catch(() => useAuthStore.getState().lock())
        }
      })
      .catch(() => {
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
          <AISidePanel />
        </>
      )}
    </div>
  )
}

export default App
