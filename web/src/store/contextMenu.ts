/**
 * Context Menu Store
 *
 * Global right-click context menu system.
 * Any component can call `showContextMenu(x, y, items)` to trigger a menu.
 */
import type { ReactNode } from 'react'
import { create } from 'zustand'

export interface MenuSeparator {
  type: 'separator'
}

export interface MenuItem {
  type?: 'item'
  id: string
  label: string
  icon?: ReactNode
  /** e.g. "⌘K", "⌥⌘N" */
  shortcut?: string
  action?: () => void
  disabled?: boolean
  danger?: boolean
  /** Nested submenu */
  submenu?: ContextMenuItems
}

export type ContextMenuItems = (MenuItem | MenuSeparator)[]

interface ContextMenuStore {
  visible: boolean
  x: number
  y: number
  items: ContextMenuItems

  show: (x: number, y: number, items: ContextMenuItems) => void
  hide: () => void
}

export const useContextMenuStore = create<ContextMenuStore>(set => ({
  visible: false,
  x: 0,
  y: 0,
  items: [],

  show(x, y, items) {
    set({ visible: true, x, y, items })
  },

  hide() {
    set({ visible: false, items: [] })
  }
}))

/** Convenience hook: returns a function to show the context menu on right-click */
export function useContextMenu(itemsFactory: (e: React.MouseEvent) => ContextMenuItems) {
  const { show } = useContextMenuStore()

  return (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    show(e.clientX, e.clientY, itemsFactory(e))
  }
}
