/**
 * Window Types
 *
 * Core data shapes for the window management system.
 */

export interface WindowInstance {
  /** Unique window ID generated client-side */
  id: string
  /** App ID this window belongs to */
  appId: string
  /** Window title */
  title: string
  /** Position */
  x: number
  y: number
  /** Size */
  width: number
  height: number
  /** Stacking order */
  zIndex: number
  /** UI state flags */
  isMaximized: boolean
  isMinimized: boolean
  isFocused: boolean
  /** Saved bounds before maximize (for restore) */
  restoreBounds?: { x: number; y: number; width: number; height: number }
  /** Backend process ID (assigned by Rust ProcessManager) */
  processId?: number
  /** Application-specific state, serialized as JSON for persistence */
  appState?: Record<string, unknown>
}

export interface WindowOpenOptions {
  title?: string
  x?: number
  y?: number
  width?: number
  height?: number
  appState?: Record<string, unknown>
}
