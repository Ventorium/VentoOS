import type {
  ApiRequest,
  Collection,
  CollectionTree,
  Environment,
  EnvironmentVariable,
  Folder,
  FolderTree,
  KeyValueItem
} from '../types'

type RecordValue = Record<string, unknown>

type LegacyEnvironmentVariable = {
  key?: string
  value?: string
  enabled?: boolean
}

type PartialEnvironmentVariable = {
  key?: string
  initialValue?: string
  currentValue?: string
  enabled?: boolean
  secret?: boolean
}

function asRecord(value: unknown): RecordValue {
  return typeof value === 'object' && value !== null ? (value as RecordValue) : {}
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function mapKeyValueList(value: unknown): KeyValueItem[] | null {
  if (!Array.isArray(value)) {
    return value == null ? null : []
  }

  return value.map(item => {
    const record = asRecord(item)
    return {
      key: String(record.key ?? ''),
      value: String(record.value ?? ''),
      enabled: record.enabled !== false,
      description: record.description == null ? undefined : String(record.description),
      dataType: record.dataType as KeyValueItem['dataType']
    }
  })
}

export function normalizeEnvironmentVariables(value: unknown): EnvironmentVariable[] {
  return asArray<LegacyEnvironmentVariable | PartialEnvironmentVariable>(value)
    .map(item => {
      const currentValue = item.currentValue ?? item.value ?? item.initialValue ?? ''
      const initialValue = item.initialValue ?? item.value ?? currentValue

      return {
        key: String(item.key ?? ''),
        initialValue: String(initialValue),
        currentValue: String(currentValue),
        enabled: item.enabled !== false,
        secret: item.secret === true
      }
    })
    .filter(item => item.key)
}

function mapCollectionDto(value: unknown): Collection {
  const dto = asRecord(value)

  return {
    id: String(dto.id ?? ''),
    name: String(dto.name ?? ''),
    description: dto.description == null ? null : String(dto.description),
    auth: (dto.auth as Collection['auth']) ?? null,
    headers: mapKeyValueList(dto.headers),
    variables: mapKeyValueList(dto.variables),
    preRequestScript: dto.pre_request_script == null ? null : String(dto.pre_request_script),
    testScript: dto.test_script == null ? null : String(dto.test_script),
    sortOrder: Number(dto.sort_order ?? 0),
    createdAt: String(dto.created_at ?? ''),
    updatedAt: String(dto.updated_at ?? '')
  }
}

function mapFolderDto(value: unknown): Folder {
  const dto = asRecord(value)

  return {
    id: String(dto.id ?? ''),
    collectionId: String(dto.collection_id ?? ''),
    parentFolderId: dto.parent_folder_id == null ? null : String(dto.parent_folder_id),
    name: String(dto.name ?? ''),
    description: dto.description == null ? null : String(dto.description),
    auth: (dto.auth as Folder['auth']) ?? null,
    headers: mapKeyValueList(dto.headers),
    variables: mapKeyValueList(dto.variables),
    preRequestScript: dto.pre_request_script == null ? null : String(dto.pre_request_script),
    testScript: dto.test_script == null ? null : String(dto.test_script),
    sortOrder: Number(dto.sort_order ?? 0)
  }
}

function mapRequestDto(value: unknown): ApiRequest {
  const dto = asRecord(value)

  return {
    id: String(dto.id ?? ''),
    collectionId: String(dto.collection_id ?? ''),
    folderId: dto.folder_id == null ? null : String(dto.folder_id),
    name: String(dto.name ?? ''),
    method: String(dto.method ?? 'GET') as ApiRequest['method'],
    url: String(dto.url ?? ''),
    params: mapKeyValueList(dto.params),
    headers: mapKeyValueList(dto.headers),
    body: (dto.body as ApiRequest['body']) ?? null,
    auth: (dto.auth as ApiRequest['auth']) ?? null,
    preRequestScript: dto.pre_request_script == null ? null : String(dto.pre_request_script),
    testScript: dto.test_script == null ? null : String(dto.test_script),
    variables: mapKeyValueList(dto.variables),
    description: dto.description == null ? null : String(dto.description),
    sortOrder: Number(dto.sort_order ?? 0),
    createdAt: String(dto.created_at ?? ''),
    updatedAt: String(dto.updated_at ?? '')
  }
}

function mapFolderTreeDto(value: unknown): FolderTree {
  const dto = asRecord(value)

  return {
    folder: mapFolderDto(dto.folder ?? dto),
    subFolders: asArray(dto.children ?? dto.subFolders).map(child => mapFolderTreeDto(child)),
    requests: asArray(dto.requests).map(request => mapRequestDto(request))
  }
}

export function mapCollectionTreeDto(value: unknown): CollectionTree {
  const dto = asRecord(value)

  return {
    collection: mapCollectionDto(dto.collection ?? dto),
    folders: asArray(dto.folders).map(folder => mapFolderTreeDto(folder)),
    requests: asArray(dto.requests).map(request => mapRequestDto(request))
  }
}

export function mapEnvironmentDto(value: unknown): Environment {
  const dto = asRecord(value)

  return {
    id: String(dto.id ?? ''),
    name: String(dto.name ?? ''),
    variables: normalizeEnvironmentVariables(dto.variables),
    isGlobal: Boolean(dto.is_global),
    sortOrder: Number(dto.sort_order ?? 0),
    createdAt: String(dto.created_at ?? ''),
    updatedAt: String(dto.updated_at ?? '')
  }
}

export function toEnvironmentPayload(environment: Partial<Environment>) {
  return {
    ...(environment.name !== undefined ? { name: environment.name } : {}),
    ...(environment.isGlobal !== undefined ? { is_global: environment.isGlobal } : {}),
    ...(environment.sortOrder !== undefined ? { sort_order: environment.sortOrder } : {}),
    ...(environment.variables !== undefined ? { variables: environment.variables } : {})
  }
}