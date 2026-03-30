/**
 * Window Manager
 *
 * Orchestrates window lifecycle: open, close, focus, minimize, maximize.
 *
 * This is the ONLY place where window operations interact with the backend
 * process API. Shell components call these functions — they do NOT touch
 * the window store or process API directly.
 *
 * Communication flow:
 *   1. Direct function call (this file) — core window/process flow
 *   2. SystemChannel.notify() — optional UI broadcast (Dock, TopBar, etc.)
 */

import { apiClient } from '@/infra/api'
import { createLogger } from '@/infra/logger'
import { systemChannel } from '../channel'
import { useAppStore } from '../apps/store'
import { useWindowStore } from './store'
import type { WindowInstance, WindowOpenOptions } from './types'

const logger = createLogger('kernel/window')

// ─── ID generation ─────────────────────────────────────────────────────────

let _idCounter = 0
function generateWindowId(): string {
  return `win-${Date.now()}-${++_idCounter}`
}

// ─── Position calculation ──────────────────────────────────────────────────

function calculatePosition(
  existingCount: number,
  options?: WindowOpenOptions,
): Pick<WindowInstance, 'x' | 'y' | 'width' | 'height'> {
  const offset = (existingCount % 10) * 26
  return {
    x: options?.x ?? 120 + offset,
    y: options?.y ?? 80 + offset,
    width: options?.width ?? 1000,
    height: options?.height ?? 680,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Open a new window for an application.
 *
 * If the app is `multiWindow: false` and a window already exists,
 * the existing window is focused and its ID is returned.
 *
 * Returns the new (or existing) window ID.
 */
export async function openWindow(appId: string, options?: WindowOpenOptions): Promise<string> {
  const manifest = useAppStore.getState().getApp(appId)
  if (!manifest) throw new Error(`Unknown app: ${appId}`)

  // Single-window apps: focus existing window
  if (!manifest.multiWindow) {
    const existing = useWindowStore.getState().getWindowsByApp(appId)
    if (existing.length > 0) {
      await focusWindow(existing[0].id)
      return existing[0].id
    }
  }

  const windowId = generateWindowId()
  const { windows, nextZIndex } = useWindowStore.getState()

  // Determine window size from manifest defaults or options
  const pos = calculatePosition(windows.length, {
    width: options?.width ?? manifest.defaultSize?.width,
    height: options?.height ?? manifest.defaultSize?.height,
    ...options,
  })

  const newWindow: WindowInstance = {
    id: windowId,
    appId,
    title: options?.title ?? manifest.name,
    ...pos,
    zIndex: nextZIndex,
    isMaximized: false,
    isMinimized: false,
    isFocused: true,
    appState: options?.appState,
  }

  // 1. Add window to UI store
  useWindowStore.getState()._addWindow(newWindow)

  // 2. Create backend process (fire-and-forget; update processId when resolved)
  apiClient
    .createProcess({ app_id: appId, window_id: windowId })
    .then(res => {
      if (res.data?.pid) {
        useWindowStore.getState()._setProcessId(windowId, res.data.pid)
        systemChannel.notify('process:created', {
          pid: res.data.pid,
          windowId,
          appId,
        })
      }
    })
    .catch(err => {
      logger.warn('Failed to create backend process (continuing without PID)', err)
    })

  // 3. Lifecycle: onActivate for the first window of this app
  if (manifest.lifecycle?.onActivate) {
    const wasEmpty = windows.filter(w => w.appId === appId).length === 0
    if (wasEmpty) {
      try {
        await manifest.lifecycle.onActivate()
      } catch (err) {
        logger.warn(`onActivate failed for ${appId}`, err)
      }
    }
  }

  // 4. Broadcast
  systemChannel.notify('window:opened', { windowId, appId })
  logger.info('Opened window', { windowId, appId })

  return windowId
}

/**
 * Close a window.
 * Calls the lifecycle `onBeforeWindowClose` hook which can cancel the close.
 * Terminates the backend process.
 */
export async function closeWindow(windowId: string): Promise<void> {
  const win = useWindowStore.getState().getWindow(windowId)
  if (!win) return

  const manifest = useAppStore.getState().getApp(win.appId)

  // 1. Lifecycle: allow app to cancel
  if (manifest?.lifecycle?.onBeforeWindowClose) {
    try {
      const canClose = await manifest.lifecycle.onBeforeWindowClose(windowId)
      if (!canClose) return
    } catch (err) {
      logger.warn('onBeforeWindowClose threw unexpectedly', err)
    }
  }

  // 2. Terminate backend process
  if (win.processId !== undefined) {
    apiClient.terminateProcess(win.processId).catch(err => {
      logger.warn('Failed to terminate backend process', err)
    })
  }

  // 3. Remove from UI store
  useWindowStore.getState()._removeWindow(windowId)

  // 4. Broadcast
  systemChannel.notify('window:closed', { windowId, appId: win.appId })

  // 5. Lifecycle: onDeactivate if no windows left
  if (manifest?.lifecycle?.onDeactivate) {
    const remaining = useWindowStore.getState().getWindowsByApp(win.appId)
    if (remaining.length === 0) {
      try {
        await manifest.lifecycle.onDeactivate()
      } catch (err) {
        logger.warn(`onDeactivate failed for ${win.appId}`, err)
      }
    }
  }

  logger.info('Closed window', { windowId })
}

/**
 * Bring a window to the front and mark it as focused.
 * Suspends no window (the backend may optimize non-focused windows).
 */
export async function focusWindow(windowId: string): Promise<void> {
  const { nextZIndex } = useWindowStore.getState()
  const win = useWindowStore.getState().getWindow(windowId)
  if (!win) return

  useWindowStore.getState()._focusWindow(windowId, nextZIndex)

  systemChannel.notify('window:focused', { windowId, appId: win.appId })
}

/**
 * Minimize a window. Suspends the backend process.
 */
export async function minimizeWindow(windowId: string): Promise<void> {
  const win = useWindowStore.getState().getWindow(windowId)
  if (!win) return

  // Suspend backend process (optional optimization)
  if (win.processId !== undefined) {
    apiClient.suspendProcess(win.processId).catch(err => {
      logger.warn('Failed to suspend backend process', err)
    })
  }

  useWindowStore.getState()._minimizeWindow(windowId)
  systemChannel.notify('window:minimized', { windowId })

  // Auto-focus the next topmost visible window
  const { windows } = useWindowStore.getState()
  const visible = windows.filter(w => w.id !== windowId && !w.isMinimized)
  if (visible.length > 0) {
    const top = visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
    await focusWindow(top.id)
  }
}

/**
 * Restore a minimized window and focus it.
 */
export async function restoreWindow(windowId: string): Promise<void> {
  const win = useWindowStore.getState().getWindow(windowId)
  if (!win) return

  // Resume backend process
  if (win.processId !== undefined) {
    apiClient.resumeProcess(win.processId).catch(err => {
      logger.warn('Failed to resume backend process', err)
    })
  }

  useWindowStore.getState()._restoreWindowState(windowId)
  await focusWindow(windowId)
  systemChannel.notify('window:restored', { windowId })
}

/**
 * Toggle between maximized and normal window state.
 */
export function toggleMaximize(windowId: string): void {
  useWindowStore.getState()._toggleMaximize(windowId)
}

/** Close all open windows. */
export async function closeAllWindows(): Promise<void> {
  const { windows } = useWindowStore.getState()
  await Promise.all(windows.map(w => closeWindow(w.id)))
}
