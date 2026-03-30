/**
 * Launchpad Store
 *
 * Shell-internal state for the full-screen app launcher.
 */

import { create } from 'zustand'

interface LaunchpadStore {
  isOpen: boolean
  searchQuery: string

  open: () => void
  close: () => void
  toggle: () => void
  setSearch: (q: string) => void
}

export const useLaunchpadStore = create<LaunchpadStore>(set => ({
  isOpen: false,
  searchQuery: '',

  open() {
    set({ isOpen: true, searchQuery: '' })
  },

  close() {
    set({ isOpen: false, searchQuery: '' })
  },

  toggle() {
    set(s => ({ isOpen: !s.isOpen, searchQuery: '' }))
  },

  setSearch(q) {
    set({ searchQuery: q })
  },
}))
