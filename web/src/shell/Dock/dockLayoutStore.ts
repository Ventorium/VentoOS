/**
 * Dock Layout Store
 *
 * Manages the full dock layout: ordered list of items (apps and folders).
 * Replaces dockPinsStore for layout + ordering + folder support.
 * Persisted to backend storage under the 'system' app.
 */
import { create } from 'zustand'
import { createAppStorage } from '@/kernel'

export type DockAppItem = {
  type: 'app'
  appId: string
}

export type DockFolderItem = {
  type: 'folder'
  id: string
  name: string
  appIds: string[]
}

export type DockItem = DockAppItem | DockFolderItem

const LAYOUT_KEY = 'dock-layout'
const ALWAYS_PINNED = ['super-terminal']

const storage = createAppStorage('system')

function uid(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

async function persist(items: DockItem[]): Promise<void> {
  try {
    await storage.setJSON(LAYOUT_KEY, items)
  } catch {
    // ignore persistence errors
  }
}

interface DockLayoutState {
  items: DockItem[]
  loaded: boolean

  /** Initialize from storage, falling back to defaultAppIds on first run */
  load: (defaultAppIds: string[]) => Promise<void>

  /** Replace all items and persist */
  setItems: (items: DockItem[]) => void

  /** Move an item from one index to another (gap-based: gapIndex 0..N) */
  moveItem: (fromIndex: number, gapIndex: number) => void

  /** Create a new folder by merging the item at fromIndex onto the item at ontoIndex */
  createFolder: (fromIndex: number, ontoIndex: number) => void

  /** Add the app item at appIndex into the folder with folderId */
  addAppToFolder: (appIndex: number, folderId: string) => void

  /** Rename a folder */
  renameFolder: (folderId: string, name: string) => void

  /** Remove an app from a folder; dissolves folder if <=1 app remains */
  removeFromFolder: (folderId: string, appId: string) => void

  /** Reorder apps within a folder (gap-based) */
  reorderFolderApp: (folderId: string, fromIdx: number, gapIdx: number) => void

  /** Check if an app ID is present in the layout (pinned) */
  isPinned: (appId: string) => boolean

  /** Add an app to the dock */
  pin: (appId: string) => void

  /** Remove an app from the dock (or from its folder) */
  unpin: (appId: string) => void
}

export const useDockLayoutStore = create<DockLayoutState>((set, get) => ({
  items: [],
  loaded: false,

  async load(defaultAppIds: string[]) {
    try {
      const saved = await storage.getJSON<DockItem[]>(LAYOUT_KEY)
      if (saved && Array.isArray(saved) && saved.length > 0) {
        // Ensure always-pinned apps are present
        const allIds = new Set(
          saved.flatMap(i => (i.type === 'app' ? [i.appId] : i.appIds))
        )
        const extra: DockItem[] = ALWAYS_PINNED.filter(id => !allIds.has(id)).map(id => ({
          type: 'app',
          appId: id
        }))
        set({ items: [...saved, ...extra], loaded: true })
      } else {
        // First run: create flat app list from defaults
        const items: DockItem[] = defaultAppIds.map(id => ({ type: 'app', appId: id }))
        set({ items, loaded: true })
        await persist(items)
      }
    } catch {
      const items: DockItem[] = defaultAppIds.map(id => ({ type: 'app', appId: id }))
      set({ items, loaded: true })
    }
  },

  setItems(items: DockItem[]) {
    set({ items })
    persist(items)
  },

  moveItem(fromIndex: number, gapIndex: number) {
    const items = [...get().items]
    if (fromIndex < 0 || fromIndex >= items.length) return
    if (gapIndex === fromIndex || gapIndex === fromIndex + 1) return // no-op same position
    const [item] = items.splice(fromIndex, 1)
    const insertAt = gapIndex > fromIndex ? gapIndex - 1 : gapIndex
    items.splice(insertAt, 0, item)
    set({ items })
    persist(items)
  },

  createFolder(fromIndex: number, ontoIndex: number) {
    const items = [...get().items]
    if (fromIndex === ontoIndex) return
    const fromItem = items[fromIndex]
    const ontoItem = items[ontoIndex]
    if (!fromItem || !ontoItem) return

    const fromAppIds: string[] =
      fromItem.type === 'app' ? [fromItem.appId] : fromItem.appIds
    const ontoAppIds: string[] =
      ontoItem.type === 'app' ? [ontoItem.appId] : ontoItem.appIds

    const folder: DockFolderItem = {
      type: 'folder',
      id: uid(),
      name: '文件夹',
      appIds: [...ontoAppIds, ...fromAppIds]
    }

    // Remove both items (higher index first to avoid shifting)
    const hi = Math.max(fromIndex, ontoIndex)
    const lo = Math.min(fromIndex, ontoIndex)
    items.splice(hi, 1)
    items.splice(lo, 1)
    items.splice(lo, 0, folder)

    set({ items })
    persist(items)
  },

  addAppToFolder(appIndex: number, folderId: string) {
    const items = [...get().items]
    const appItem = items[appIndex]
    if (!appItem || appItem.type !== 'app') return

    const folderIndex = items.findIndex(
      i => i.type === 'folder' && (i as DockFolderItem).id === folderId
    )
    if (folderIndex < 0) return

    const folder = items[folderIndex] as DockFolderItem
    const updatedFolder: DockFolderItem = {
      ...folder,
      appIds: [...folder.appIds, appItem.appId]
    }

    items.splice(appIndex, 1)
    const adjustedFolderIndex = appIndex < folderIndex ? folderIndex - 1 : folderIndex
    items[adjustedFolderIndex] = updatedFolder

    set({ items })
    persist(items)
  },

  renameFolder(folderId: string, name: string) {
    const items = get().items.map(i =>
      i.type === 'folder' && i.id === folderId ? { ...i, name } : i
    )
    set({ items })
    persist(items)
  },

  removeFromFolder(folderId: string, appId: string) {
    const items = [...get().items]
    const folderIndex = items.findIndex(
      i => i.type === 'folder' && (i as DockFolderItem).id === folderId
    )
    if (folderIndex < 0) return

    const folder = items[folderIndex] as DockFolderItem
    const newAppIds = folder.appIds.filter(id => id !== appId)

    if (newAppIds.length === 0) {
      items.splice(folderIndex, 1)
    } else if (newAppIds.length === 1) {
      items.splice(folderIndex, 1, { type: 'app', appId: newAppIds[0] })
    } else {
      items[folderIndex] = { ...folder, appIds: newAppIds }
    }

    set({ items })
    persist(items)
  },

  reorderFolderApp(folderId: string, fromIdx: number, gapIdx: number) {
    const items = [...get().items]
    const folderIndex = items.findIndex(
      i => i.type === 'folder' && (i as DockFolderItem).id === folderId
    )
    if (folderIndex < 0) return

    const folder = items[folderIndex] as DockFolderItem
    if (fromIdx === gapIdx || fromIdx + 1 === gapIdx) return

    const appIds = [...folder.appIds]
    const [moved] = appIds.splice(fromIdx, 1)
    const insertAt = gapIdx > fromIdx ? gapIdx - 1 : gapIdx
    appIds.splice(insertAt, 0, moved)

    items[folderIndex] = { ...folder, appIds }
    set({ items })
    persist(items)
  },

  isPinned(appId: string) {
    const { items, loaded } = get()
    if (!loaded) return true
    return items.some(
      i =>
        (i.type === 'app' && i.appId === appId) ||
        (i.type === 'folder' && i.appIds.includes(appId))
    )
  },

  pin(appId: string) {
    const items = [...get().items, { type: 'app' as const, appId }]
    set({ items })
    persist(items)
  },

  unpin(appId: string) {
    if (ALWAYS_PINNED.includes(appId)) return
    const items = get()
      .items.map(i => {
        if (i.type === 'folder') {
          const newIds = i.appIds.filter(id => id !== appId)
          if (newIds.length === 0) return null
          if (newIds.length === 1) return { type: 'app' as const, appId: newIds[0] }
          return { ...i, appIds: newIds }
        }
        return i.type === 'app' && i.appId === appId ? null : i
      })
      .filter(Boolean) as DockItem[]
    set({ items })
    persist(items)
  }
}))
