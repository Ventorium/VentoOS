/**
 * Editor Store — tabs, active tab, cursor position, editor references.
 */
import { create } from 'zustand'
import type { VfsNode } from '../../explorer/api'
import { vfsApi } from '../../explorer/api'
import type { FileTab } from '../types'
import { getLanguageFromFilename } from '../utils/language-detection'

let _untitledCounter = 0

interface EditorStore {
  tabs: FileTab[]
  activeTabId: string | null
  cursorLine: number
  cursorCol: number
  loadingFile: boolean

  // Computed
  getActiveTab: () => FileTab | null

  // Actions
  openFile: (mountId: string, node: VfsNode, revealPos?: { line: number; col: number }) => Promise<void>
  openNewUntitled: () => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabContent: (tabId: string, content: string) => void
  markTabSaved: (tabId: string, content: string) => void
  setCursorPos: (line: number, col: number) => void
  /** Pin a preview tab (make it permanent). */
  pinTab: (tabId: string) => void
  /** Reorder tabs via drag-and-drop. */
  moveTab: (fromIndex: number, toIndex: number) => void
}

function makeTabId(mountId: string, path: string) {
  return `${mountId}::${path}`
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  cursorLine: 1,
  cursorCol: 1,
  loadingFile: false,

  getActiveTab() {
    const { tabs, activeTabId } = get()
    return tabs.find(t => t.id === activeTabId) ?? null
  },

  async openFile(mountId, node, _revealPos) {
    const tabId = makeTabId(mountId, node.path)
    const { tabs } = get()
    const existing = tabs.find(t => t.id === tabId)

    if (existing) {
      set({ activeTabId: tabId })
      return
    }

    // Replace current preview tab if there is one
    const previewIdx = tabs.findIndex(t => t.isPreview)

    set({ loadingFile: true })
    try {
      const r = await vfsApi.readVfsFile(mountId, node.path, 16 * 1024 * 1024)
      const content = r.data.is_binary
        ? `// Binary file: ${node.name}\n// Cannot be displayed as text.`
        : (r.data.content ?? '')
      const newTab: FileTab = {
        id: tabId,
        mountId,
        node,
        content,
        savedContent: content,
        language: getLanguageFromFilename(node.name),
        isPreview: true
      }

      set(state => {
        let newTabs: FileTab[]
        if (previewIdx >= 0) {
          // Replace existing preview tab
          newTabs = [...state.tabs]
          newTabs[previewIdx] = newTab
        } else {
          newTabs = [...state.tabs, newTab]
        }
        return { tabs: newTabs, activeTabId: tabId, loadingFile: false }
      })
    } catch (e) {
      console.error('Open file failed:', e)
      set({ loadingFile: false })
    }
  },

  openNewUntitled() {
    const n = ++_untitledCounter
    const id = `untitled-${n}`
    const node: VfsNode = { name: `Untitled-${n}`, path: id, is_dir: false }
    const tab: FileTab = {
      id,
      mountId: '',
      node,
      content: '',
      savedContent: '',
      language: 'plaintext',
      isNew: true
    }
    set(state => ({
      tabs: [...state.tabs, tab],
      activeTabId: id
    }))
  },

  closeTab(tabId) {
    set(state => {
      const idx = state.tabs.findIndex(t => t.id === tabId)
      const next = state.tabs.filter(t => t.id !== tabId)
      let newActiveId = state.activeTabId
      if (state.activeTabId === tabId) {
        const newActive = next[Math.min(idx, next.length - 1)]
        newActiveId = newActive?.id ?? null
      }
      return { tabs: next, activeTabId: newActiveId }
    })
  },

  setActiveTab(tabId) {
    set({ activeTabId: tabId })
  },

  updateTabContent(tabId, content) {
    set(state => ({
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, content } : t))
    }))
  },

  markTabSaved(tabId, content) {
    set(state => ({
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, savedContent: content, content, isNew: false } : t))
    }))
  },

  setCursorPos(line, col) {
    set({ cursorLine: line, cursorCol: col })
  },

  pinTab(tabId) {
    set(state => ({
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, isPreview: false } : t))
    }))
  },

  moveTab(fromIndex, toIndex) {
    set(state => {
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    })
  }
}))
