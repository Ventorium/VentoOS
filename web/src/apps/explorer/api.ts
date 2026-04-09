/**
 * Explorer App — VFS API client & types
 *
 * VFS is a system capability owned by the Explorer app.
 * Other components (FilePicker, file-viewer, clipboard) import from here.
 */

import type { ApiResponse } from '@/infra/api'
import { getAuthHeaders, handleUnauthorized, request } from '@/infra/api'

// ── Types ──────────────────────────────────────────────────────────────────

export type VfsSourceKind = 'local' | 'sftp' | 'ftp' | 'smb' | 's3' | 'webdav'

export interface LocalMountConfig {
  enabled: boolean
  mount_point: string
}

export interface VfsMount {
  id: string
  name: string
  kind: VfsSourceKind
  root: string
  connection_id?: string
  group?: string
  local_mount?: LocalMountConfig
}

export interface CreateVfsMountReq {
  name: string
  kind: VfsSourceKind
  root: string
  connection_id?: string
  group?: string
  local_mount?: LocalMountConfig
}

export interface VfsNode {
  name: string
  path: string
  is_dir: boolean
  size?: number
  modified?: string
  permissions?: string
}

export interface VfsFileContent {
  path: string
  size: number
  content: string
  is_binary: boolean
  truncated: boolean
}

export interface ArchiveEntry {
  path: string
  size: number
  compressed_size?: number
  is_dir: boolean
  modified?: string
  encrypted?: boolean
}

export interface ArchiveListResult {
  entries: ArchiveEntry[]
  password_required: boolean
  error?: string
}

export interface VfsWriteReq {
  path: string
  content: string
}

export interface WebDavServerSettings {
  enabled: boolean
  username: string
  password: string
  exposed_mounts: string[]
}

// ── API ─────────────────────────────────────────────────────────────────────

export const vfsApi = {
  // Mounts
  getVfsMounts: () => request<ApiResponse<VfsMount[]>>('GET', '/api/vfs/mounts'),
  createVfsMount: (body: CreateVfsMountReq) => request<ApiResponse<VfsMount>>('POST', '/api/vfs/mounts', body),
  updateVfsMount: (id: string, body: CreateVfsMountReq) =>
    request<ApiResponse<VfsMount>>('PUT', `/api/vfs/mounts/${id}`, body),
  testVfsMountConnection: (body: CreateVfsMountReq) =>
    request<ApiResponse<{ success: boolean; message: string }>>('POST', '/api/vfs/mounts/test-connection', body),
  getVfsMount: (id: string) => request<ApiResponse<VfsMount>>('GET', `/api/vfs/mounts/${id}`),
  deleteVfsMount: (id: string) => request<ApiResponse<null>>('DELETE', `/api/vfs/mounts/${id}`),

  // File operations
  listVfsDir: (id: string, path?: string, showHidden?: boolean) => {
    const params = new URLSearchParams({ path: path ?? '/' })
    if (showHidden) params.set('show_hidden', 'true')
    return request<ApiResponse<VfsNode[]>>('GET', `/api/vfs/mounts/${id}/ls?${params}`)
  },
  readVfsFile: (id: string, path: string, maxBytes?: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ path })
    if (maxBytes) params.set('max_bytes', String(maxBytes))
    return request<ApiResponse<VfsFileContent>>('GET', `/api/vfs/mounts/${id}/read?${params}`, undefined, { signal })
  },
  readVfsFileRaw: async (id: string, path: string): Promise<Blob> => {
    const headers = getAuthHeaders()
    const params = new URLSearchParams({ path })
    const res = await fetch(`/api/vfs/mounts/${id}/raw?${params}`, { headers })
    if (!res.ok) {
      handleUnauthorized(res)
      throw new Error(`HTTP ${res.status}`)
    }
    return res.blob()
  },
  moveVfsFile: (id: string, src: string, dest: string) =>
    request<ApiResponse<unknown>>('POST', `/api/vfs/mounts/${id}/move`, { src, dest }),
  copyVfsFile: (id: string, src: string, dest: string) =>
    request<ApiResponse<unknown>>('POST', `/api/vfs/mounts/${id}/copy`, { src, dest }),
  mkdirVfs: (mountId: string, path: string) =>
    request<ApiResponse<unknown>>('POST', `/api/vfs/mounts/${mountId}/mkdir`, { path }),
  deleteVfs: (mountId: string, path: string) =>
    request<ApiResponse<unknown>>('POST', `/api/vfs/mounts/${mountId}/delete`, { path }),
  writeVfsFile: (mountId: string, path: string, content: string) =>
    request<ApiResponse<unknown>>('POST', `/api/vfs/mounts/${mountId}/write`, { path, content }),
  uploadVfsFile: async (mountId: string, path: string, file: File): Promise<ApiResponse<unknown>> => {
    const headers = getAuthHeaders()
    const formData = new FormData()
    formData.append('path', path)
    formData.append('file', file)
    const res = await fetch(`/api/vfs/mounts/${mountId}/upload`, {
      method: 'POST',
      headers,
      body: formData
    })
    if (!res.ok) {
      handleUnauthorized(res)
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status}`)
    }
    return res.json() as Promise<ApiResponse<unknown>>
  },
  statVfs: (mountId: string, path: string) =>
    request<ApiResponse<VfsNode>>('GET', `/api/vfs/mounts/${mountId}/stat?path=${encodeURIComponent(path)}`),
  searchVfs: (mountId: string, path: string, query: string, maxResults?: number) => {
    const params = new URLSearchParams({ path, query })
    if (maxResults) params.set('max_results', String(maxResults))
    return request<ApiResponse<VfsNode[]>>('GET', `/api/vfs/mounts/${mountId}/search?${params}`)
  },

  // Archive
  listArchiveContents: (mountId: string, path: string, password?: string) => {
    const params = new URLSearchParams({ path })
    if (password) params.set('password', password)
    return request<ApiResponse<ArchiveListResult>>('GET', `/api/vfs/mounts/${mountId}/archive/list?${params}`)
  },

  // WebDAV
  getWebDavServerSettings: () => request<ApiResponse<WebDavServerSettings>>('GET', '/api/vfs/webdav-server/settings'),
  updateWebDavServerSettings: (body: WebDavServerSettings) =>
    request<ApiResponse<WebDavServerSettings>>('PUT', '/api/vfs/webdav-server/settings', body),

  // Local FUSE mount
  localMountVfs: (id: string) =>
    request<ApiResponse<{ mounted: boolean; mount_point: string | null; error: string | null }>>(
      'POST',
      `/api/vfs/mounts/${id}/local-mount`
    ),
  localUnmountVfs: (id: string) =>
    request<ApiResponse<{ unmounted: boolean }>>('DELETE', `/api/vfs/mounts/${id}/local-mount`),
  localMountStatus: (id: string) =>
    request<ApiResponse<{ mounted: boolean; mount_point: string | null; error: string | null }>>(
      'GET',
      `/api/vfs/mounts/${id}/local-mount`
    )
}
