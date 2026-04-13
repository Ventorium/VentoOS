import type { ApiResponse } from '@/infra/api'
import { request } from '@/infra/api/client'

export interface Dependency {
  id: string
  name: string
  description: string
  installed: boolean
  platform: 'macos' | 'linux' | 'windows' | 'all'
  install_command: string | null
  homepage: string | null
}

export interface InstallResult {
  success: boolean
  output: string
  dependency: Dependency
}

export interface FuseCheckResult {
  available: boolean
  platform: string
  dependencies: Dependency[]
}

export const depsApi = {
  list: (category?: string) =>
    request<ApiResponse<Dependency[]>>(
      'GET',
      category ? `/api/dependencies?category=${category}` : '/api/dependencies'
    ),

  install: (id: string) => request<ApiResponse<InstallResult>>('POST', `/api/dependencies/install?id=${id}`),

  checkFuse: () => request<ApiResponse<FuseCheckResult>>('GET', '/api/dependencies/check-fuse')
}
