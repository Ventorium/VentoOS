import { FolderOpen } from 'lucide-react'
import { useCallback } from 'react'
import { Spinner } from '@/components'
import { vfsApi } from '../../../explorer/api'
import { useEditorStore } from '../../stores/editor-store'
import { useUiStore } from '../../stores/ui-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import type { DirEntry } from '../../types'
import FileTreeNode, { NewItemInput } from './FileTreeNode'
import FileTreeToolbar from './FileTreeToolbar'

interface Props {
  onRefresh: () => void
}

export default function FileTree({ onRefresh }: Props) {
  const workspace = useWorkspaceStore(s => s.workspace)
  const tree = useWorkspaceStore(s => s.tree)
  const expandDir = useWorkspaceStore(s => s.expandDir)
  const patchTree = useWorkspaceStore(s => s.patchTree)
  const insertIntoTree = useWorkspaceStore(s => s.insertIntoTree)
  const addToIndex = useWorkspaceStore(s => s.addToIndex)

  const activeTab = useEditorStore(s => s.getActiveTab())
  const openFile = useEditorStore(s => s.openFile)
  const pinTab = useEditorStore(s => s.pinTab)

  const { renamingPath, renameValue, newItem, showCtxMenu } = useUiStore()
  const setRenameValue = useUiStore(s => s.setRenameValue)
  const cancelRename = useUiStore(s => s.cancelRename)
  const startNewItem = useUiStore(s => s.startNewItem)
  const setNewItemValue = useUiStore(s => s.setNewItemValue)
  const cancelNewItem = useUiStore(s => s.cancelNewItem)

  const handleSelectFile = useCallback(
    (entry: DirEntry) => {
      if (!workspace || entry.is_dir) return
      openFile(workspace.mountId, { name: entry.name, path: entry.path, is_dir: false })
    },
    [workspace, openFile]
  )

  const handleDoubleClick = useCallback(
    (entry: DirEntry) => {
      // Double-click pins a preview tab
      const tab = useEditorStore.getState().tabs.find(t => t.node.path === entry.path)
      if (tab) pinTab(tab.id)
    },
    [pinTab]
  )

  const handleNewItemConfirm = useCallback(
    async (parentPath: string, isDir: boolean, name: string) => {
      if (!workspace || !name.trim()) {
        cancelNewItem()
        return
      }
      const base = parentPath || workspace.path
      const newPath = `${base.replace(/\/$/, '')}/${name.trim()}`
      cancelNewItem()
      try {
        if (isDir) {
          await vfsApi.mkdirVfs(workspace.mountId, newPath)
          insertIntoTree(base === workspace.path ? null : base, {
            name: name.trim(),
            path: newPath,
            is_dir: true,
            children: [],
            expanded: false
          })
        } else {
          await vfsApi.writeVfsFile(workspace.mountId, newPath, '')
          insertIntoTree(base === workspace.path ? null : base, { name: name.trim(), path: newPath, is_dir: false })
          await openFile(workspace.mountId, { name: name.trim(), path: newPath, is_dir: false })
        }
        const rel = newPath.startsWith(workspace.path)
          ? newPath.slice(workspace.path.length).replace(/^\//, '')
          : newPath
        if (!isDir) addToIndex({ path: newPath, name: name.trim(), relativePath: rel, mountId: workspace.mountId })
      } catch (e) {
        console.error('Create failed:', e)
      }
    },
    [workspace, cancelNewItem, insertIntoTree, openFile, addToIndex]
  )

  const handleRenameConfirm = useCallback(
    async (entry: DirEntry, newName: string) => {
      cancelRename()
      if (!workspace || !newName.trim() || newName === entry.name) return
      const dir = entry.path.split('/').slice(0, -1).join('/')
      const newPath = `${dir}/${newName.trim()}`
      try {
        await vfsApi.moveVfsFile(workspace.mountId, entry.path, newPath)
        patchTree(entry.path, { name: newName.trim(), path: newPath })
        // Update any open tabs
        const { tabs } = useEditorStore.getState()
        for (const t of tabs) {
          if (t.node.path === entry.path) {
            useEditorStore.setState(state => ({
              tabs: state.tabs.map(tab =>
                tab.node.path === entry.path
                  ? {
                      ...tab,
                      node: { ...tab.node, name: newName.trim(), path: newPath },
                      id: `${workspace.mountId}::${newPath}`
                    }
                  : tab
              )
            }))
          }
        }
      } catch (e) {
        console.error('Rename failed:', e)
      }
    },
    [workspace, cancelRename, patchTree]
  )

  if (!workspace) {
    return (
      <>
        <div className="px-3 py-1.5 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--vos-text-tertiary)]">
            资源管理器
          </span>
        </div>
        <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
          <FolderOpen size={28} className="text-[var(--vos-text-tertiary)] opacity-40" />
          <p className="text-xs leading-5 text-[var(--vos-text-tertiary)]">
            通过「文件 → 打开文件夹」
            <br />
            打开项目
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <FileTreeToolbar
        workspaceName={workspace.name}
        onNewFile={() => startNewItem(workspace.path, false)}
        onNewFolder={() => startNewItem(workspace.path, true)}
        onRefresh={onRefresh}
      />
      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={e => {
          if ((e.target as HTMLElement).closest('[role="button"]')) return
          e.preventDefault()
          showCtxMenu(e.clientX, e.clientY, null)
        }}
      >
        {/* Root-level new item input */}
        {newItem && newItem.parentPath === workspace.path && (
          <NewItemInput
            depth={0}
            isDir={newItem.isDir}
            value={newItem.value}
            onChange={setNewItemValue}
            onConfirm={() => handleNewItemConfirm(newItem.parentPath, newItem.isDir, newItem.value)}
            onCancel={cancelNewItem}
          />
        )}
        {tree.length === 0 && !newItem ? (
          <div className="flex justify-center py-6">
            <Spinner size={14} />
          </div>
        ) : (
          tree.map(entry => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              activeFilePath={activeTab?.node.path ?? null}
              renamingPath={renamingPath}
              renameValue={renameValue}
              newItem={newItem}
              onSelect={handleSelectFile}
              onExpand={expandDir}
              onContextMenu={(e, en) => showCtxMenu(e.clientX, e.clientY, en)}
              onRenameChange={setRenameValue}
              onRenameConfirm={handleRenameConfirm}
              onRenameCancel={cancelRename}
              onNewItemChange={setNewItemValue}
              onNewItemConfirm={handleNewItemConfirm}
              onNewItemCancel={cancelNewItem}
              onDoubleClick={handleDoubleClick}
            />
          ))
        )}
      </div>
    </>
  )
}
