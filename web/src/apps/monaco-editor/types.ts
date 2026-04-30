import type { VfsNode } from '../explorer/api'

// ─── File Tab ────────────────────────────────────────────────────────────────

export interface FileTab {
  id: string
  mountId: string
  node: VfsNode
  content: string
  savedContent: string
  language: string
  isNew?: boolean
  /** Preview mode: tab replaced when another file is single-clicked */
  isPreview?: boolean
  /** Read-only mode (e.g. from archive preview) */
  readOnly?: boolean
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export interface WorkspaceRoot {
  mountId: string
  path: string
  name: string
}

// ─── File Tree ───────────────────────────────────────────────────────────────

export interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  children?: DirEntry[]
  expanded?: boolean
  loading?: boolean
}

// ─── Quick Open ──────────────────────────────────────────────────────────────

export interface QuickOpenItem {
  path: string
  name: string
  relativePath: string
  mountId: string
}

// ─── Context Menu ────────────────────────────────────────────────────────────

export interface ContextMenuInfo {
  visible: boolean
  x: number
  y: number
  entry: DirEntry | null
}

// ─── New Item ────────────────────────────────────────────────────────────────

export interface NewItemState {
  parentPath: string
  isDir: boolean
  value: string
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchMatch {
  line: number
  col: number
  preview: string
}

export interface SearchResult {
  file: QuickOpenItem
  matches: SearchMatch[]
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export type SidebarView = 'files' | 'search'

// ─── Activity Bar Item ───────────────────────────────────────────────────────

export interface ActivityBarItem {
  id: SidebarView
  icon: React.ReactNode
  title: string
}
