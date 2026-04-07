/**
 * System-level API type definitions.
 *
 * App-specific types live in their own app directories (e.g. apps/ssh/api.ts).
 */

// ─── Generic wrapper ───────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthStatusData {
  initialized: boolean
  locked: boolean
}

export interface AuthLoginData {
  token: string
}

// ─── Process ───────────────────────────────────────────────────────────────

export type ProcessStatus = 'running' | 'suspended' | 'terminated'

export interface VProcess {
  pid: number
  app_id: string
  window_id: string
  status: ProcessStatus
  created_at: string
  context: Record<string, unknown>
}

export interface CreateProcessReq {
  app_id: string
  window_id: string
}

// ─── Desktop Settings ──────────────────────────────────────────────────────

export interface DesktopSettings {
  wallpaper: string
  theme_mode: string
  dock_icon_size: number
  dock_position: string
  dock_magnification: boolean
  dock_auto_hide: boolean
}

// ─── Window State DTO ──────────────────────────────────────────────────────

export interface WindowStateDTO {
  id: string
  app_id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  z_index: number
  status: string
  is_maximized: boolean
  tab_states?: unknown
  app_state?: Record<string, unknown>
}

// ─── Local Filesystem ──────────────────────────────────────────────────────

export interface LocalFsNode {
  name: string
  path: string
  is_dir: boolean
  size?: number
  modified?: string
}
