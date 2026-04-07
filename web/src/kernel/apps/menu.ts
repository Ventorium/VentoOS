/**
 * App Menu & Tray Type Definitions
 *
 * Defines the menu model that applications register with the system.
 * TopBar renders menus for the focused window's app; Tray icons live in the system area.
 */
import type { ReactNode } from 'react'

// ─── Menu Item ─────────────────────────────────────────────────────────────

export interface AppMenuItem {
  id: string
  label: string
  shortcut?: string // e.g. '⌘N', '⌘,', 'Ctrl+S'
  disabled?: boolean
  hidden?: boolean
  danger?: boolean
  checked?: boolean // For toggle-style items
  action?: () => void
  children?: AppMenuItem[] // Submenu
}

export type AppMenuSeparator = { type: 'separator' }

export type AppMenuEntry = AppMenuItem | AppMenuSeparator

// ─── Menu Group (top-level menu bar item) ──────────────────────────────────

export interface AppMenuGroup {
  id: string // e.g. 'file', 'edit', 'view', 'app'
  label: string // e.g. '文件', '编辑', '视图'
  items: AppMenuEntry[]
}

// ─── Tray ──────────────────────────────────────────────────────────────────

export interface AppTrayConfig {
  icon?: ReactNode // Defaults to app icon if omitted
  tooltip?: string
  onClick?: () => void
  items?: AppMenuEntry[] // Context-menu items
  /** Badge text displayed on the tray icon (e.g. "32%", "4") */
  badge?: string
  /** Badge color */
  badgeColor?: string
  /** Whether the tray is visible. Default true. */
  visible?: boolean
  /** Custom render for the entire tray button content */
  render?: () => ReactNode
  /** Priority for ordering. Higher = more left. Default 0 */
  priority?: number
}
