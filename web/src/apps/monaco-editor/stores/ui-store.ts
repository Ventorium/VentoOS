/**
 * UI Store — transient UI state (context menu, command palette, rename, new item, delete dialog).
 */
import { create } from 'zustand'
import type { ContextMenuInfo, DirEntry, NewItemState } from '../types'

interface UiStore {
  cmdPaletteOpen: boolean
  ctxMenu: ContextMenuInfo
  renamingPath: string | null
  renameValue: string
  newItem: NewItemState | null
  deleteTarget: DirEntry | null

  openCmdPalette: () => void
  closeCmdPalette: () => void
  showCtxMenu: (x: number, y: number, entry: DirEntry | null) => void
  hideCtxMenu: () => void
  startRename: (path: string, currentName: string) => void
  setRenameValue: (v: string) => void
  cancelRename: () => void
  startNewItem: (parentPath: string, isDir: boolean) => void
  setNewItemValue: (v: string) => void
  cancelNewItem: () => void
  setDeleteTarget: (entry: DirEntry | null) => void
}

const EMPTY_CTX: ContextMenuInfo = { visible: false, x: 0, y: 0, entry: null }

export const useUiStore = create<UiStore>()(set => ({
  cmdPaletteOpen: false,
  ctxMenu: EMPTY_CTX,
  renamingPath: null,
  renameValue: '',
  newItem: null,
  deleteTarget: null,

  openCmdPalette() {
    set({ cmdPaletteOpen: true })
  },
  closeCmdPalette() {
    set({ cmdPaletteOpen: false })
  },

  showCtxMenu(x, y, entry) {
    set({ ctxMenu: { visible: true, x, y, entry } })
  },
  hideCtxMenu() {
    set({ ctxMenu: EMPTY_CTX })
  },

  startRename(path, currentName) {
    set({ renamingPath: path, renameValue: currentName })
  },
  setRenameValue(v) {
    set({ renameValue: v })
  },
  cancelRename() {
    set({ renamingPath: null, renameValue: '' })
  },

  startNewItem(parentPath, isDir) {
    set({ newItem: { parentPath, isDir, value: '' } })
  },
  setNewItemValue(v) {
    set(state => ({ newItem: state.newItem ? { ...state.newItem, value: v } : null }))
  },
  cancelNewItem() {
    set({ newItem: null })
  },

  setDeleteTarget(entry) {
    set({ deleteTarget: entry })
  }
}))
