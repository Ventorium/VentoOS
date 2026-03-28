/**
 * Launchpad Store
 *
 * Controls full-screen app launcher visibility and state.
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
    set(state => ({ isOpen: !state.isOpen, searchQuery: '' }))
  },

  setSearch(q) {
    set({ searchQuery: q })
  }
}))
