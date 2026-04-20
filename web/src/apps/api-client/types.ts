export interface Collection {
  id: string
  name: string
  description?: string | null
  auth?: AuthConfig | null
  headers?: KeyValueItem[] | null
  variables?: KeyValueItem[] | null
  preRequestScript?: string | null
  testScript?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Folder {
  id: string
  collectionId: string
  parentFolderId?: string | null
  name: string
  description?: string | null
  auth?: AuthConfig | null
  headers?: KeyValueItem[] | null
  variables?: KeyValueItem[] | null
  preRequestScript?: string | null
  testScript?: string | null
  sortOrder: number
}

export interface ApiRequest {
  id: string
  collectionId: string
  folderId?: string | null
  name: string
  method: HttpMethod
  url: string
  params?: KeyValueItem[] | null
  headers?: KeyValueItem[] | null
  body?: BodyConfig | null
  auth?: AuthConfig | null
  preRequestScript?: string | null
  testScript?: string | null
  variables?: KeyValueItem[] | null
  description?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface KeyValueItem {
  key: string
  value: string
  enabled: boolean
  description?: string
}

export interface BodyConfig {
  type: 'none' | 'json' | 'text' | 'form-urlencoded' | 'form-data' | 'binary' | 'xml'
  content?: string
  contentType?: string
  params?: KeyValueItem[]
}

export interface AuthConfig {
  type: 'none' | 'inherit' | 'basic' | 'bearer' | 'api-key'
  username?: string
  password?: string
  token?: string
  key?: string
  value?: string
  addTo?: 'header' | 'query'
}

export interface Environment {
  id: string
  name: string
  variables: KeyValueItem[]
  isGlobal: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface HistoryEntry {
  id: string
  request: Record<string, unknown>
  response?: Record<string, unknown> | null
  durationMs?: number | null
  starred: boolean
  createdAt: string
}

export interface ProxyResponse {
  status: number
  statusText: string
  headers: KeyValueItem[]
  body: string
  durationMs: number
  sizeBytes: number
}

export interface CollectionTree {
  collection: Collection
  folders: FolderTree[]
  requests: ApiRequest[]
}

export interface FolderTree {
  folder: Folder
  subFolders: FolderTree[]
  requests: ApiRequest[]
}

export interface RequestTab {
  id: string
  requestId?: string
  name: string
  method: HttpMethod
  url: string
  request: Partial<ApiRequest>
  isDirty: boolean
}
