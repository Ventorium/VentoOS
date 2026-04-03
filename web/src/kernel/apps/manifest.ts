/**
 * AppManifest — Complete application declaration type
 *
 * Every app (built-in or third-party) declares a manifest.
 * This is the contract between the OS and the application.
 */

import type { ComponentType } from 'react'

// ─── Component props passed to every app ───────────────────────────────────

export interface AppComponentProps {
  /** The window instance ID this component is rendered in */
  windowId: string
  /** The backend process ID (assigned by Rust ProcessManager) */
  processId: number
  /** Application state restored from persistence (if any) */
  initialAppState?: Record<string, unknown>
}

// ─── Permissions ───────────────────────────────────────────────────────────

export type AppPermission =
  | 'network' // External network connections
  | 'storage' // Access to app data directory
  | 'connections' // Access to connection manager
  | 'shell' // Execute shell commands
  | 'notifications' // Send system notifications
  | 'clipboard' // Access clipboard
  | 'ipc' // Cross-app IPC messaging

// ─── Lifecycle hooks ───────────────────────────────────────────────────────

export interface AppLifecycle {
  /** Called when the app opens its first window (initialize resources) */
  onActivate?: () => Promise<void> | void
  /** Called when all app windows are closed (release resources) */
  onDeactivate?: () => Promise<void> | void
  /** Called before a window closes. Return false to cancel. */
  onBeforeWindowClose?: (windowId: string) => Promise<boolean> | boolean
  /** Called after install */
  onInstall?: () => Promise<void> | void
  /** Called before uninstall. keepData = true means preserve app data dir. */
  onUninstall?: (keepData: boolean) => Promise<void> | void
  /** Called after update (for data migrations) */
  onUpdate?: (fromVersion: string, toVersion: string) => Promise<void> | void
}

// ─── Full manifest ─────────────────────────────────────────────────────────

export interface AppManifest {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** Unique app ID, e.g. 'kubernetes', 'database' */
  id: string
  /** Display name */
  name: string
  /** Semantic version, e.g. '1.0.0' */
  version: string

  // ── Author ────────────────────────────────────────────────────────────────
  author: {
    name: string
    email?: string
    url?: string
  }
  homepage?: string
  repository?: string
  license?: string

  // ── Display ───────────────────────────────────────────────────────────────
  /**
   * Icon for Dock/Launchpad.
   * Built-in apps pass a ReactNode; external apps pass an image URL string.
   */
  icon: React.ReactNode | string
  description?: string
  /** Preview screenshots for an app store */
  thumbnails?: string[]
  categories?: string[]

  // ── File associations ─────────────────────────────────────────────────────
  /**
   * File extensions this app can open, e.g. ['db', 'sqlite', 'sqlite3'].
   * Used by Explorer to show "Open with" dialog when double-clicking files.
   */
  fileAssociations?: string[]

  // ── Window behavior ───────────────────────────────────────────────────────
  /** Allow multiple simultaneous windows */
  multiWindow: boolean
  defaultSize?: { width: number; height: number }
  minSize?: { width: number; height: number }

  // ── Permissions ───────────────────────────────────────────────────────────
  permissions?: AppPermission[]

  // ── System requirements ───────────────────────────────────────────────────
  minSystemVersion?: string
  /** App needs a persistent data directory under ~/Library/.../apps/{id}/ */
  requiresDataDir?: boolean

  // ── Loading ───────────────────────────────────────────────────────────────
  /**
   * Lazy-load factory for the app's React component.
   * @example () => import('./KubernetesApp')
   */
  component: () => Promise<{ default: ComponentType<AppComponentProps> }>
  /** App has a corresponding Rust AppPlugin that exposes API routes */
  hasBackendPlugin?: boolean
  /** Hide from Dock (still launchable via other apps) */
  hidden?: boolean

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  lifecycle?: AppLifecycle
}
