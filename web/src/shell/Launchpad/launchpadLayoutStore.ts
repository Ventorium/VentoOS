/**
 * Launchpad Layout Store
 *
 * Manages the full launchpad layout: ordered items (apps and folders).
 * Supports drag-to-reorder and folder creation/management.
 * Persisted to backend storage.
 */
import { create } from 'zustand'
import { createAppStorage } from '@/kernel'

export type LaunchpadAppItem = {
  type: 'app'
  appId: string
}

export type LaunchpadFolderItem = {
  type: 'folder'
  id: string
  name: string
  appIds: string[]
}

export type LaunchpadItem = LaunchpadAppItem | LaunchpadFolderItem

const LAYOUT_KEY = 'launchpad-layout'
const storage = createAppStorage('system')

function uid(): string {
  return `lf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

async function persist(items: LaunchpadItem[]): Promise<void> {
  try {
    await storage.setJSON(LAYOUT_KEY, items)
  } catch {
    // ignore
  }
}

interface LaunchpadLayoutState {
  items: LaunchpadItem[]
  loaded: boolean

  load: (defaultAppIds: string[]) => Promise<void>
  setItems: (items: LaunchpadItem[]) => void

  /** Move item from one index to another (gap-based: 0..N) */
  moveItem: (fromIndex: number, gapIndex: number) => void

  /** Create folder by merging fromIndex onto ontoIndex */
  createFolder: (fromIndex: number, ontoIndex: number) => void

  /** Add app at appIndex into folder with folderId */
  addAppToFolder: (appIndex: number, folderId: string) => void

  /** Rename a folder */
  renameFolder: (folderId: string, name: string) => void

  /** Dissolve a folder (expand apps back to flat list) */
  dissolveFolder: (folderId: string) => void

  /** Reorder apps inside a folder (gap-based) */
  reorderFolderApp: (folderId: string, fromIdx: number, gapIdx: number) => void
}

export const useLaunchpadLayoutStore = create<LaunchpadLayoutState>((set, get) => ({
  items: [],
  loaded: false,

  async load(defaultAppIds: string[]) {
    try {
      const saved = await storage.getJSON<LaunchpadItem[]>(LAYOUT_KEY)
      if (saved && Array.isArray(saved) && saved.length > 0) {
        // Merge in any newly installed apps not yet in the layout
        const layoutIds = new Set(saved.flatMap(i => (i.type === 'app' ? [i.appId] : i.appIds)))
        const newApps: LaunchpadItem[] = defaultAppIds
          .filter(id => !layoutIds.has(id))
          .map(id => ({ type: 'app', appId: id }))
        set({ items: [...saved, ...newApps], loaded: true })
      } else {
        const items: LaunchpadItem[] = defaultAppIds.map(id => ({ type: 'app', appId: id }))
        set({ items, loaded: true })
        await persist(items)
      }
    } catch {
      const items: LaunchpadItem[] = defaultAppIds.map(id => ({ type: 'app', appId: id }))
      set({ items, loaded: true })
    }
  },

  setItems(items) {
    set({ items })
    persist(items)
  },

  moveItem(fromIndex, gapIndex) {
    const items = [...get().items]
    if (fromIndex < 0 || fromIndex >= items.length) return
    if (gapIndex === fromIndex || gapIndex === fromIndex + 1) return
    const [item] = items.splice(fromIndex, 1)
    const insertAt = gapIndex > fromIndex ? gapIndex - 1 : gapIndex
    items.splice(insertAt, 0, item)
    set({ items })
    persist(items)
  },

  createFolder(fromIndex, ontoIndex) {
    const items = [...get().items]
    if (fromIndex === ontoIndex) return
    const fromItem = items[fromIndex]
    const ontoItem = items[ontoIndex]
    if (!fromItem || !ontoItem) return

    const fromAppIds = fromItem.type === 'app' ? [fromItem.appId] : fromItem.appIds
    const ontoAppIds = ontoItem.type === 'app' ? [ontoItem.appId] : ontoItem.appIds

    const folder: LaunchpadFolderItem = {
      type: 'folder',
      id: uid(),
      name: '文件夹',
      appIds: [...ontoAppIds, ...fromAppIds]
    }

    const hi = Math.max(fromIndex, ontoIndex)
    const lo = Math.min(fromIndex, ontoIndex)
    items.splice(hi, 1)
    items.splice(lo, 1)
    items.splice(lo, 0, folder)

    set({ items })
    persist(items)
  },

  addAppToFolder(appIndex, folderId) {
    const items = [...get().items]
    const appItem = items[appIndex]
    if (!appItem || appItem.type !== 'app') return

    const folderIndex = items.findIndex(i => i.type === 'folder' && (i as LaunchpadFolderItem).id === folderId)
    if (folderIndex < 0) return

    const folder = items[folderIndex] as LaunchpadFolderItem
    const updatedFolder: LaunchpadFolderItem = {
      ...folder,
      appIds: [...folder.appIds, appItem.appId]
    }

    items.splice(appIndex, 1)
    const adjustedFolderIndex = appIndex < folderIndex ? folderIndex - 1 : folderIndex
    items[adjustedFolderIndex] = updatedFolder

    set({ items })
    persist(items)
  },

  renameFolder(folderId, name) {
    const items = get().items.map(i => (i.type === 'folder' && i.id === folderId ? { ...i, name } : i))
    set({ items })
    persist(items)
  },

  dissolveFolder(folderId) {
    const items: LaunchpadItem[] = []
    for (const item of get().items) {
      if (item.type === 'folder' && item.id === folderId) {
        for (const appId of item.appIds) items.push({ type: 'app', appId })
      } else {
        items.push(item)
      }
    }
    set({ items })
    persist(items)
  },

  reorderFolderApp(folderId, fromIdx, gapIdx) {
    const items = get().items.map(item => {
      if (item.type !== 'folder' || item.id !== folderId) return item
      const appIds = [...item.appIds]
      if (fromIdx < 0 || fromIdx >= appIds.length) return item
      if (gapIdx === fromIdx || gapIdx === fromIdx + 1) return item
      const [app] = appIds.splice(fromIdx, 1)
      const insertAt = gapIdx > fromIdx ? gapIdx - 1 : gapIdx
      appIds.splice(insertAt, 0, app)
      return { ...item, appIds }
    })
    set({ items })
    persist(items)
  }
}))
