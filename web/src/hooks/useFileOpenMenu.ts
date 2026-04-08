/**
 * useFileOpenMenu — Shared hook for registering a "File → Open" menu
 *
 * Provides:
 * - A "文件" → "打开" menu item registered on mount
 * - A state to control showing the VFS file picker modal
 * - Ctrl/Cmd+O keyboard shortcut
 * - A callback when a file is selected from the picker
 */
import { useCallback, useEffect, useState } from 'react'
import { registerAppMenus, unregisterAppMenus, openWindow } from '@/kernel'
import type { AppMenuGroup } from '@/kernel'

interface UseFileOpenMenuOptions {
  /** The window ID used for menu registration */
  windowId: string
  /** The app ID to open new windows for */
  appId: string
  /** Additional menu groups to include alongside the "文件" group */
  extraMenus?: AppMenuGroup[]
  /** Extra items to add to the "文件" menu (after 打开) */
  extraFileItems?: AppMenuGroup['items']
}

interface UseFileOpenMenuResult {
  /** Whether the file picker is visible */
  showFilePicker: boolean
  /** Open the file picker */
  openFilePicker: () => void
  /** Close the file picker */
  closeFilePicker: () => void
  /** Call from VfsFilePickerModal onConfirm */
  handleFilePickerConfirm: (result: { path: string; mountId: string }) => void
}

export function useFileOpenMenu({
  windowId,
  appId,
  extraMenus,
  extraFileItems
}: UseFileOpenMenuOptions): UseFileOpenMenuResult {
  const [showFilePicker, setShowFilePicker] = useState(false)

  const openFilePicker = useCallback(() => setShowFilePicker(true), [])
  const closeFilePicker = useCallback(() => setShowFilePicker(false), [])

  const handleFilePickerConfirm = useCallback(
    (result: { path: string; mountId: string }) => {
      setShowFilePicker(false)
      // Extract file name from path
      const name = result.path.split('/').filter(Boolean).pop() ?? result.path
      openWindow(appId, {
        title: name,
        appState: {
          mountId: result.mountId,
          node: { path: result.path, name, is_dir: false }
        }
      })
    },
    [appId]
  )

  // Register menus
  useEffect(() => {
    const isMac = /Mac/.test(navigator.userAgent)
    const fileMenu: AppMenuGroup = {
      id: 'file',
      label: '文件',
      items: [
        {
          id: 'open',
          label: '打开…',
          shortcut: isMac ? '⌘O' : 'Ctrl+O',
          action: openFilePicker
        },
        ...(extraFileItems ?? [])
      ]
    }
    registerAppMenus(windowId, [fileMenu, ...(extraMenus ?? [])])
    return () => unregisterAppMenus(windowId)
  }, [windowId, openFilePicker, extraMenus, extraFileItems])

  // Keyboard shortcut: Cmd/Ctrl + O
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        openFilePicker()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openFilePicker])

  return { showFilePicker, openFilePicker, closeFilePicker, handleFilePickerConfirm }
}
