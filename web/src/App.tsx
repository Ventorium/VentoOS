import { useEffect, useState } from 'react'
import { useThemeSync } from '@/hooks/useTheme'
import { wsClient } from '@/infra/ws'
import { useWindowStore } from '@/kernel'
import { authService, useAuthStore } from '@/services/auth'
import { useNotificationStore } from '@/services/notification'
import { notificationService } from '@/services/notification'
import { useSettingsStore } from '@/services/settings/store'
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
  const { token, locked, setInitialized } = useAuthStore()
  const [checking, setChecking] = useState(true)

  // On mount: check auth status from backend, auto-unlock if token is valid
  useEffect(() => {
    authService
      .checkStatus()
      .then(res => {
        setInitialized(res.initialized)
        if (res.initialized && token) {
          // Re-validate stored token, then connect WS and load backend state
          authService
            .revalidateToken()
            .then(valid => {
              if (valid) {
                wsClient.connect()
                notificationService.listenToBackendNotifications()
                // Load persisted state from backend
                useWindowStore.getState().loadFromBackend()
                useSettingsStore.getState().loadFromBackend()
                useNotificationStore.getState().loadFromBackend()
              }
            })
            .catch(() => useAuthStore.getState().lock())
        }
      })
      .catch(() => {
        // Backend not reachable — still show UI
      })
      .finally(() => {
        setChecking(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (checking) {
    return (
      <div className="vos-shell vos-flex-center">
        <div className="vos-loading-spinner" />
      </div>
    )
  }

  const showLockScreen = locked || !token

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: WebOS shell suppresses default browser context menu
    <div className="vos-shell" onContextMenu={e => e.preventDefault()}>
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
