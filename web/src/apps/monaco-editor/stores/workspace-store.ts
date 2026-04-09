/**
 * Workspace Store — workspace root, file tree, file index for quick-open.
 */
import { create } from 'zustand'
import { vfsApi } from '../../explorer/api'
import type { DirEntry, QuickOpenItem, WorkspaceRoot } from '../types'
import { insertNodeAt, patchNode, removeNode } from '../utils/tree-helpers'

async function loadDirEntries(mountId: string, dirPath: string): Promise<DirEntry[]> {
  const r = await vfsApi.listVfsDir(mountId, dirPath, false)
  return [...r.data]
    .sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map(n => ({ name: n.name, path: n.path, is_dir: n.is_dir, children: n.is_dir ? [] : undefined }))
}

interface WorkspaceStore {
  workspace: WorkspaceRoot | null
  tree: DirEntry[]
  fileIndex: QuickOpenItem[]
  isIndexing: boolean

  // Actions
  setWorkspace: (ws: WorkspaceRoot | null) => void
  loadTree: (mountId: string, rootPath: string) => Promise<void>
  expandDir: (entry: DirEntry) => Promise<void>
  collapseDir: (path: string) => void
  patchTree: (targetPath: string, patch: Partial<DirEntry>) => void
  removeFromTree: (targetPath: string) => void
  insertIntoTree: (parentPath: string | null, entry: DirEntry) => void
  buildFullIndex: (mountId: string, rootPath: string) => Promise<void>
  addToIndex: (item: QuickOpenItem) => void
  removeFromIndex: (pathPrefix: string) => void
  cancelIndex: () => void
}

let _indexCancel = false

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  workspace: null,
  tree: [],
  fileIndex: [],
  isIndexing: false,

  setWorkspace(ws) {
    _indexCancel = true
    set({ workspace: ws, tree: [], fileIndex: [] })
  },

  async loadTree(mountId, rootPath) {
    try {
      const entries = await loadDirEntries(mountId, rootPath)
      set({ tree: entries })
    } catch (e) {
      console.error('Load tree failed:', e)
    }
  },

  async expandDir(entry) {
    const ws = get().workspace
    if (!ws) return

    // Toggle: if already expanded, collapse
    if (entry.expanded) {
      set(state => ({ tree: patchNode(state.tree, entry.path, { expanded: false }) }))
      return
    }

    set(state => ({ tree: patchNode(state.tree, entry.path, { expanded: true, loading: true }) }))
    try {
      const children = await loadDirEntries(ws.mountId, entry.path)
      set(state => ({ tree: patchNode(state.tree, entry.path, { children, loading: false }) }))
    } catch {
      set(state => ({ tree: patchNode(state.tree, entry.path, { loading: false }) }))
    }
  },

  collapseDir(path) {
    set(state => ({ tree: patchNode(state.tree, path, { expanded: false }) }))
  },

  patchTree(targetPath, patch) {
    set(state => ({ tree: patchNode(state.tree, targetPath, patch) }))
  },

  removeFromTree(targetPath) {
    set(state => ({ tree: removeNode(state.tree, targetPath) }))
  },

  insertIntoTree(parentPath, entry) {
    set(state => ({ tree: insertNodeAt(state.tree, parentPath, entry) }))
  },

  async buildFullIndex(mountId, rootPath) {
    set({ isIndexing: true })
    _indexCancel = false
    const index: QuickOpenItem[] = []
    const queue: string[] = [rootPath]
    const rootDepth = rootPath.split('/').filter(Boolean).length
    const MAX_FILES = 8000

    while (queue.length > 0 && index.length < MAX_FILES && !_indexCancel) {
      const dir = queue.shift()
      if (!dir) break
      const dirDepth = dir.split('/').filter(Boolean).length - rootDepth
      if (dirDepth > 8) continue
      try {
        const r = await vfsApi.listVfsDir(mountId, dir, false)
        for (const node of r.data) {
          if (_indexCancel) break
          if (node.is_dir) {
            queue.push(node.path)
          } else {
            const rel = node.path.startsWith(rootPath) ? node.path.slice(rootPath.length).replace(/^\//, '') : node.path
            index.push({ path: node.path, name: node.name, relativePath: rel, mountId })
          }
        }
      } catch {
        /* skip unreadable dirs */
      }
    }

    if (!_indexCancel) set({ fileIndex: index })
    set({ isIndexing: false })
  },

  addToIndex(item) {
    set(state => ({ fileIndex: [...state.fileIndex, item] }))
  },

  removeFromIndex(pathPrefix) {
    set(state => ({
      fileIndex: state.fileIndex.filter(f => !f.path.startsWith(pathPrefix))
    }))
  },

  cancelIndex() {
    _indexCancel = true
  }
}))
