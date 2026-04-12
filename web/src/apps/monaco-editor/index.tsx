/**
 * Code Editor — VS Code-like experience (modular architecture)
 *
 * Structure:
 *   stores/   — Zustand stores (editor, workspace, layout, search, ui)
 *   components/ — ActivityBar, Sidebar/, Editor/, StatusBar, CommandPalette, ContextMenu
 *   utils/    — language detection, monaco themes, tree helpers
 *   types.ts  — shared type definitions
 */

import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef } from 'react'
import { ConfirmDialog } from '@/components'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { VfsFilePickerModal } from '@/shell/FilePicker'
import type { VfsNode } from '../explorer/api'
import { vfsApi } from '../explorer/api'
// ── Components ──
import ActivityBar from './components/ActivityBar'
import CommandPalette from './components/CommandPalette'
import ContextMenu from './components/ContextMenu'
import EditorArea from './components/editor/EditorArea'
import StatusBar from './components/StatusBar'
import FileTree from './components/sidebar/FileTree'
import SearchPanel from './components/sidebar/SearchPanel'
// ── Stores ──
import { useEditorStore } from './stores/editor-store'
import { useLayoutStore } from './stores/layout-store'
import { useUiStore } from './stores/ui-store'
import { useWorkspaceStore } from './stores/workspace-store'

export default function MonacoEditorApp({ windowId, initialAppState }: AppComponentProps) {
  const initMountId = (initialAppState?.mountId as string) ?? ''
  const initNode = initialAppState?.node as VfsNode | undefined
  const initDirNode = initialAppState?.dirNode as VfsNode | undefined

  const { setTitle } = useWindowActions(windowId)
  const isMac = /Mac/.test(navigator.userAgent)

  // ── Store selectors ───────────────────────────────────────────────────
  const activeTab = useEditorStore(s => s.getActiveTab())
  const activeTabId = useEditorStore(s => s.activeTabId)
  const openFile = useEditorStore(s => s.openFile)
  const openNewUntitled = useEditorStore(s => s.openNewUntitled)
  const closeTab = useEditorStore(s => s.closeTab)
  const markTabSaved = useEditorStore(s => s.markTabSaved)

  const workspace = useWorkspaceStore(s => s.workspace)
  const setWorkspace = useWorkspaceStore(s => s.setWorkspace)
  const loadTree = useWorkspaceStore(s => s.loadTree)
  const buildFullIndex = useWorkspaceStore(s => s.buildFullIndex)
  const fileIndex = useWorkspaceStore(s => s.fileIndex)
  const isIndexing = useWorkspaceStore(s => s.isIndexing)
  const cancelIndex = useWorkspaceStore(s => s.cancelIndex)

  const { sidebarOpen, sidebarWidth, sidebarView } = useLayoutStore()
  const setSidebarOpen = useLayoutStore(s => s.setSidebarOpen)
  const setSidebarView = useLayoutStore(s => s.setSidebarView)
  const setSidebarWidth = useLayoutStore(s => s.setSidebarWidth)

  const { cmdPaletteOpen, ctxMenu, deleteTarget } = useUiStore()
  const openCmdPalette = useUiStore(s => s.openCmdPalette)
  const closeCmdPalette = useUiStore(s => s.closeCmdPalette)
  const hideCtxMenu = useUiStore(s => s.hideCtxMenu)
  const startRename = useUiStore(s => s.startRename)
  const startNewItem = useUiStore(s => s.startNewItem)
  const setDeleteTarget = useUiStore(s => s.setDeleteTarget)

  // ── Sidebar resize ────────────────────────────────────────────────────
  const resizingRef = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = e.clientX - resizeStartX.current
      setSidebarWidth(resizeStartW.current + delta)
    }
    const onUp = () => {
      resizingRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setSidebarWidth])

  // ── Window title sync ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab) setTitle(activeTab.node.name)
    else if (workspace) setTitle(`${workspace.name} — 代码编辑器`)
    else setTitle('代码编辑器')
  }, [activeTab, workspace, setTitle])

  // ── Save handler ──────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const tab = useEditorStore.getState().getActiveTab()
    if (!tab) return
    const content = tab.content
    if (content === tab.savedContent && !tab.isNew) return
    try {
      await vfsApi.writeVfsFile(tab.mountId, tab.node.path, content)
      markTabSaved(tab.id, content)
    } catch (e) {
      console.error('Save failed:', e)
    }
  }, [markTabSaved])

  // ── File open / folder open ───────────────────────────────────────────
  const handleOpenFile = useCallback(
    (result: VfsPickerResult) => {
      const name = result.path.split('/').filter(Boolean).pop() ?? result.path
      openFile(result.mountId, { name, path: result.path, is_dir: false })
    },
    [openFile]
  )

  const handleOpenDirectory = useCallback(
    async (result: VfsPickerResult) => {
      const name = result.path.split('/').filter(Boolean).pop() ?? (result.path || '/')
      cancelIndex()
      setWorkspace({ mountId: result.mountId, path: result.path, name })
      setSidebarOpen(true)
      setSidebarView('files')
      try {
        await loadTree(result.mountId, result.path)
        buildFullIndex(result.mountId, result.path)
      } catch (e) {
        console.error('Load workspace failed:', e)
      }
    },
    [cancelIndex, setWorkspace, setSidebarOpen, setSidebarView, loadTree, buildFullIndex]
  )

  // ── Refresh workspace ─────────────────────────────────────────────────
  const handleRefreshWorkspace = useCallback(async () => {
    if (!workspace) return
    try {
      await loadTree(workspace.mountId, workspace.path)
      buildFullIndex(workspace.mountId, workspace.path)
    } catch (e) {
      console.error('Refresh failed:', e)
    }
  }, [workspace, loadTree, buildFullIndex])

  // ── Delete confirmed ──────────────────────────────────────────────────
  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteTarget || !workspace) return
    const entry = deleteTarget
    setDeleteTarget(null)
    try {
      await vfsApi.deleteVfs(workspace.mountId, entry.path)
      useWorkspaceStore.getState().removeFromTree(entry.path)
      if (!entry.is_dir) {
        closeTab(`${workspace.mountId}::${entry.path}`)
        useWorkspaceStore.getState().removeFromIndex(entry.path)
      } else {
        useWorkspaceStore.getState().removeFromIndex(`${entry.path}/`)
      }
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }, [deleteTarget, workspace, setDeleteTarget, closeTab])

  // ── Menu registration ─────────────────────────────────────────────────
  const activeIsDirty = activeTab ? activeTab.content !== activeTab.savedContent : false

  const {
    showFilePicker,
    closeFilePicker,
    handleFilePickerConfirm,
    showDirPicker,
    closeDirPicker,
    handleDirPickerConfirm
  } = useFileOpenMenu({
    windowId,
    appId: 'monaco-editor',
    onOpenFile: handleOpenFile,
    onOpenDirectory: handleOpenDirectory,
    extraFileItems: [
      { id: 'new-file', label: '新建文件', shortcut: isMac ? '⌘N' : 'Ctrl+Alt+N', action: openNewUntitled },
      { type: 'separator' },
      { id: 'save', label: '保存', shortcut: isMac ? '⌘S' : 'Ctrl+S', action: handleSave, disabled: !activeIsDirty },
      { type: 'separator' },
      {
        id: 'close-tab',
        label: '关闭编辑器',
        shortcut: isMac ? '⌘W' : 'Alt+W',
        action: () => activeTabId && closeTab(activeTabId),
        disabled: !activeTabId
      }
    ]
  })

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // Alt+W close tab (browser-safe)
      if (e.altKey && !mod && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
      }
      // Ctrl+P quick open
      if (mod && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        openCmdPalette()
      }
      // Ctrl+Alt+N new file (browser-safe)
      if (mod && e.altKey && e.key === 'n') {
        e.preventDefault()
        openNewUntitled()
      }
      // Ctrl+S save
      if (mod && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, closeTab, openNewUntitled, openCmdPalette, handleSave])

  // ── Load initial state ────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (initDirNode && initMountId) {
      setWorkspace({ mountId: initMountId, path: initDirNode.path, name: initDirNode.name })
      loadTree(initMountId, initDirNode.path).then(() => {
        buildFullIndex(initMountId, initDirNode.path)
      })
    }
    if (initNode && initMountId) openFile(initMountId, initNode)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full overflow-hidden relative bg-[var(--vos-bg-window)]"
      style={{ userSelect: resizingRef.current ? 'none' : 'auto' }}
    >
      {/* ── Main row: ActivityBar + Sidebar + Editor ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Activity Bar ── */}
        <ActivityBar />

        {/* ── Sidebar + Resize Handle ── */}
        {sidebarOpen && (
          <>
            <div
              className="flex flex-col flex-shrink-0 overflow-hidden border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]"
              style={{
                width: sidebarWidth
              }}
            >
              {sidebarView === 'files' ? <FileTree onRefresh={handleRefreshWorkspace} /> : <SearchPanel />}
            </div>

            {/* ── Resize Handle ── */}
            <div
              className="w-[4px] cursor-col-resize bg-transparent shrink-0"
              onMouseDown={e => {
                e.preventDefault()
                resizingRef.current = true
                resizeStartX.current = e.clientX
                resizeStartW.current = sidebarWidth
              }}
            />
          </>
        )}

        {/* ── Editor Area ── */}
        <EditorArea />
      </div>

      {/* ── Status Bar — full-width at bottom ── */}
      <StatusBar />

      {/* ── Command Palette ── */}
      {cmdPaletteOpen && (
        <CommandPalette
          items={fileIndex}
          isIndexing={isIndexing}
          onSelect={item => {
            closeCmdPalette()
            openFile(item.mountId, { name: item.name, path: item.path, is_dir: false })
          }}
          onClose={closeCmdPalette}
        />
      )}

      {/* ── Context Menu ── */}
      {ctxMenu.visible && (
        <ContextMenu
          info={ctxMenu}
          hasWorkspace={!!workspace}
          onNewFile={p => {
            startNewItem(p || workspace?.path || '', false)
            hideCtxMenu()
          }}
          onNewFolder={p => {
            startNewItem(p || workspace?.path || '', true)
            hideCtxMenu()
          }}
          onRename={entry => {
            startRename(entry.path, entry.name)
            hideCtxMenu()
          }}
          onDelete={entry => {
            setDeleteTarget(entry)
            hideCtxMenu()
          }}
          onCopyPath={path => {
            navigator.clipboard?.writeText(path)
            hideCtxMenu()
          }}
          onRefresh={() => {
            handleRefreshWorkspace()
            hideCtxMenu()
          }}
          onClose={hideCtxMenu}
        />
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
        title={`删除${deleteTarget?.is_dir ? '文件夹' : '文件'}`}
        danger
        confirmText="删除"
      >
        确定要删除 <strong>{deleteTarget?.name}</strong>？此操作不可撤销。
      </ConfirmDialog>

      {/* ── VFS Pickers ── */}
      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
        )}
        {showDirPicker && (
          <VfsFilePickerModal mode="directory" onConfirm={handleDirPickerConfirm} onClose={closeDirPicker} />
        )}
      </AnimatePresence>
    </div>
  )
}
