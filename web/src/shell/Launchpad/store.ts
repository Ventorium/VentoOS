/**
 * Launchpad Store
 *
 * Shell-internal state for the full-screen app launcher.
 */

import { create } from 'zustand'

interface LaunchpadStore {
  isOpen: boolean
  searchQuery: string
  openFolderName: string | null

  open: () => void
  close: () => void
  toggle: () => void
  setSearch: (q: string) => void
  openFolder: (name: string) => void
  closeFolder: () => void
}

export const useLaunchpadStore = create<LaunchpadStore>(set => ({
  isOpen: false,
  searchQuery: '',
  openFolderName: null,

  open() {
    set({ isOpen: true, searchQuery: '', openFolderName: null })
  },

  close() {
    set({ isOpen: false, searchQuery: '', openFolderName: null })
  },

  toggle() {
    set(s => ({ isOpen: !s.isOpen, searchQuery: '', openFolderName: null }))
  },

  setSearch(q) {
    set({ searchQuery: q })
  },

  openFolder(name) {
    set({ openFolderName: name })
  },

  closeFolder() {
    set({ openFolderName: null })
  }
}))
