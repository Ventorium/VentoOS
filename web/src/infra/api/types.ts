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
  accent_color?: string | null
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

// ─── Notifications ────────────────────────────────────────────────────────

export interface NotificationDTO {
  id: string
  title: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  source: 'system' | 'connection' | 'task' | 'agent' | 'app'
  read: boolean
  action_url: string | null
  task_id: string | null
  created_at: string
}

export interface CreateNotificationReq {
  title: string
  message: string
  level?: string
  source?: string
  dedup_key?: string
}

// ─── Network ────────────────────────────────────────────────────────

export interface NetworkInterfaceDTO {
  name: string
  if_type: string
  ip: string
  netmask: string
  gateway: string
  dns: string[]
  mac: string
  status: string
}

// ─── System Settings ────────────────────────────────────────────────

export interface SystemSettings {
  sound_alert_volume: number
  sound_notif_volume: number
  sound_alert_muted: boolean
  sound_notif_muted: boolean
  sound_alert_type: string
  sound_notif_type: string
  lockscreen_enabled: boolean
  lockscreen_idle_minutes: number
  location_enabled: boolean
}
