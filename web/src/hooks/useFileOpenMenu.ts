/**
 * useFileOpenMenu — Shared hook for registering a "File → Open" menu
 *
 * Provides:
 * - A "文件" → "打开" menu item registered on mount
 * - A state to control showing the VFS file picker modal
 * - Ctrl/Cmd+O keyboard shortcut
 * - Optional "打开文件夹" menu item (when onOpenDirectory is provided)
 *
 * Behavior:
 * - If `onOpenFile` is provided: calls it with the picked file (in-place open in current window)
 * - If `onOpenFile` is NOT provided: opens a new window with the file (legacy behavior)
 * - If `onOpenDirectory` is provided: adds "打开文件夹…" item and calls the callback on confirm
 */
import { useCallback, useEffect, useState } from 'react'
import type { AppMenuGroup } from '@/kernel'
import { openWindow, registerAppMenus, unregisterAppMenus } from '@/kernel'
import type { VfsPickerResult } from '@/shell/FilePicker'

export type { VfsPickerResult }

interface UseFileOpenMenuOptions {
  /** The window ID used for menu registration */
  windowId: string
  /** The app ID to open new windows for (used when onOpenFile is not provided) */
  appId: string
  /**
   * If provided, called with the selected file — opens it in the current window.
   * If not provided, a new window is opened (legacy behavior).
   */
  onOpenFile?: (result: VfsPickerResult) => void
  /**
   * If provided, adds a "打开文件夹…" menu item and calls this with the selected directory.
   */
  onOpenDirectory?: (result: VfsPickerResult) => void
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
  handleFilePickerConfirm: (result: VfsPickerResult) => void
  /** Whether the directory picker is visible */
  showDirPicker: boolean
  /** Close the directory picker */
  closeDirPicker: () => void
  /** Call from VfsFilePickerModal (mode=directory) onConfirm */
  handleDirPickerConfirm: (result: VfsPickerResult) => void
}

export function useFileOpenMenu({
  windowId,
  appId,
  onOpenFile,
  onOpenDirectory,
  extraMenus,
  extraFileItems
}: UseFileOpenMenuOptions): UseFileOpenMenuResult {
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [showDirPicker, setShowDirPicker] = useState(false)

  const openFilePicker = useCallback(() => setShowFilePicker(true), [])
  const closeFilePicker = useCallback(() => setShowFilePicker(false), [])
  const closeDirPicker = useCallback(() => setShowDirPicker(false), [])

  const handleFilePickerConfirm = useCallback(
    (result: VfsPickerResult) => {
      setShowFilePicker(false)
      if (onOpenFile) {
        // In-place open: caller handles loading in current window
        onOpenFile(result)
      } else {
        // Legacy: open a new window
        const name = result.path.split('/').filter(Boolean).pop() ?? result.path
        openWindow(appId, {
          title: name,
          appState: {
            mountId: result.mountId,
            node: { path: result.path, name, is_dir: false }
          }
        })
      }
    },
    [appId, onOpenFile]
  )

  const handleDirPickerConfirm = useCallback(
    (result: VfsPickerResult) => {
      setShowDirPicker(false)
      onOpenDirectory?.(result)
    },
    [onOpenDirectory]
  )

  // Register menus
  useEffect(() => {
    const isMac = /Mac/.test(navigator.userAgent)
    const fileItems: AppMenuGroup['items'] = [
      {
        id: 'open',
        label: '打开…',
        shortcut: isMac ? '⌘O' : 'Ctrl+O',
        action: openFilePicker
      }
    ]
    if (onOpenDirectory) {
      fileItems.push({
        id: 'open-folder',
        label: '打开文件夹…',
        shortcut: isMac ? '⌘⇧O' : 'Ctrl+Shift+O',
        action: () => setShowDirPicker(true)
      })
    }
    if (extraFileItems) {
      fileItems.push(...extraFileItems)
    }
    const fileMenu: AppMenuGroup = {
      id: 'file',
      label: '文件',
      items: fileItems
    }
    registerAppMenus(windowId, [fileMenu, ...(extraMenus ?? [])])
    return () => unregisterAppMenus(windowId)
  }, [windowId, openFilePicker, onOpenDirectory, extraMenus, extraFileItems])

  // Keyboard shortcut: Cmd/Ctrl + O → open file
  // Cmd/Ctrl + Shift + O → open folder (if supported)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'o') {
        e.preventDefault()
        openFilePicker()
      } else if (onOpenDirectory && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        setShowDirPicker(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openFilePicker, onOpenDirectory])

  return {
    showFilePicker,
    openFilePicker,
    closeFilePicker,
    handleFilePickerConfirm,
    showDirPicker,
    closeDirPicker,
    handleDirPickerConfirm
  }
}
