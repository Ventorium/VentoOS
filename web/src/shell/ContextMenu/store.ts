/**
 * Context Menu Store
 *
 * Shell-internal state for the right-click context menu.
 */

import { create } from 'zustand'

export interface MenuSeparator {
  type: 'separator'
}

export interface MenuItem {
  type?: 'item'
  id: string
  label: string
  /** e.g. "⌘K", "⌥⌘N" */
  shortcut?: string
  action?: () => void
  disabled?: boolean
  danger?: boolean
  submenu?: ContextMenuItems
}

export type ContextMenuItems = (MenuItem | MenuSeparator)[]

/** Anchor the menu relative to a point with directional preference */
export type ContextMenuAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface ContextMenuStore {
  visible: boolean
  x: number
  y: number
  items: ContextMenuItems
  compact: boolean
  anchor: ContextMenuAnchor

  show: (x: number, y: number, items: ContextMenuItems, options?: { compact?: boolean; anchor?: ContextMenuAnchor }) => void
  hide: () => void
}

export const useContextMenuStore = create<ContextMenuStore>(set => ({
  visible: false,
  x: 0,
  y: 0,
  items: [],
  compact: false,
  anchor: 'top-left' as ContextMenuAnchor,

  show(x, y, items, options) {
    set({ visible: true, x, y, items, compact: options?.compact ?? false, anchor: options?.anchor ?? 'top-left' })
  },

  hide() {
    set({ visible: false, items: [], compact: false })
  }
}))

/** Convenience hook: returns a right-click handler that shows the context menu. */
export function useContextMenu(itemsFactory: (e: React.MouseEvent) => ContextMenuItems) {
  const { show } = useContextMenuStore()

  return (e: React.MouseEvent) => {
    e.preventDefault()
    show(e.clientX, e.clientY, itemsFactory(e))
  }
}
