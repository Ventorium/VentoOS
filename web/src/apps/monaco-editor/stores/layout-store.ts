/**
 * Layout Store — sidebar width, active sidebar view, panel visibility.
 */
import { create } from 'zustand'
import type { SidebarView } from '../types'

interface LayoutStore {
  sidebarOpen: boolean
  sidebarView: SidebarView
  sidebarWidth: number

  toggleSidebar: (view?: SidebarView) => void
  setSidebarView: (view: SidebarView) => void
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
}

export const useLayoutStore = create<LayoutStore>()(set => ({
  sidebarOpen: true,
  sidebarView: 'files',
  sidebarWidth: 240,

  toggleSidebar(view) {
    set(state => {
      if (view && view !== state.sidebarView) {
        return { sidebarView: view, sidebarOpen: true }
      }
      return { sidebarOpen: !state.sidebarOpen }
    })
  },

  setSidebarView(view) {
    set({ sidebarView: view })
  },

  setSidebarOpen(open) {
    set({ sidebarOpen: open })
  },

  setSidebarWidth(width) {
    set({ sidebarWidth: Math.max(160, Math.min(520, width)) })
  }
}))
