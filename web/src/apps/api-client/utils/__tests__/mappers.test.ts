import { describe, expect, it } from 'vitest'
import { mapCollectionTreeDto, mapEnvironmentDto, toEnvironmentPayload } from '../mappers'

describe('api client dto mappers', () => {
  it('maps environment dto from snake_case and legacy variables', () => {
    const environment = mapEnvironmentDto({
      id: 'env-1',
      name: 'Development',
      variables: [{ key: 'TOKEN', value: 'abc123', enabled: true }],
      is_global: true,
      sort_order: 2,
      created_at: '2026-04-22T10:00:00Z',
      updated_at: '2026-04-22T10:00:00Z'
    })

    expect(environment).toEqual({
      id: 'env-1',
      name: 'Development',
      variables: [
        {
          key: 'TOKEN',
          initialValue: 'abc123',
          currentValue: 'abc123',
          enabled: true,
          secret: false
        }
      ],
      isGlobal: true,
      sortOrder: 2,
      createdAt: '2026-04-22T10:00:00Z',
      updatedAt: '2026-04-22T10:00:00Z'
    })
  })

  it('maps collection tree dto from flattened backend shape', () => {
    const tree = mapCollectionTreeDto({
      id: 'col-1',
      name: 'Auth APIs',
      description: null,
      auth: null,
      headers: null,
      variables: [{ key: 'BASE_URL', value: 'https://api.example.com', enabled: true }],
      pre_request_script: null,
      test_script: null,
      sort_order: 0,
      created_at: '2026-04-22T10:00:00Z',
      updated_at: '2026-04-22T10:00:00Z',
      folders: [
        {
          id: 'folder-1',
          collection_id: 'col-1',
          parent_folder_id: null,
          name: 'Login',
          description: null,
          auth: null,
          headers: null,
          variables: null,
          pre_request_script: null,
          test_script: null,
          sort_order: 0,
          children: [],
          requests: [
            {
              id: 'req-1',
              collection_id: 'col-1',
              folder_id: 'folder-1',
              name: 'Sign In',
              method: 'POST',
              url: '{{BASE_URL}}/auth/login',
              params: null,
              headers: [],
              body: { type: 'json', content: '{"email":"demo@example.com"}' },
              auth: null,
              pre_request_script: null,
              test_script: null,
              variables: null,
              description: null,
              sort_order: 0,
              created_at: '2026-04-22T10:00:00Z',
              updated_at: '2026-04-22T10:00:00Z'
            }
          ]
        }
      ],
      requests: []
    })

    expect(tree.collection.id).toBe('col-1')
    expect(tree.collection.preRequestScript).toBeNull()
    expect(tree.collection.variables[0]).toEqual({
      key: 'BASE_URL',
      value: 'https://api.example.com',
      enabled: true
    })
    expect(tree.folders[0].folder.collectionId).toBe('col-1')
    expect(tree.folders[0].subFolders).toEqual([])
    expect(tree.folders[0].requests[0].folderId).toBe('folder-1')
    expect(tree.folders[0].requests[0].createdAt).toBe('2026-04-22T10:00:00Z')
  })

  it('serializes environment updates back to snake_case payloads', () => {
    const payload = toEnvironmentPayload({
      name: 'Production',
      isGlobal: false,
      sortOrder: 3,
      variables: [
        {
          key: 'TOKEN',
          initialValue: 'stored-token',
          currentValue: 'latest-token',
          enabled: true,
          secret: true
        }
      ]
    })

    expect(payload).toEqual({
      name: 'Production',
      is_global: false,
      sort_order: 3,
      variables: [
        {
          key: 'TOKEN',
          initialValue: 'stored-token',
          currentValue: 'latest-token',
          enabled: true,
          secret: true
        }
      ]
    })
  })
})