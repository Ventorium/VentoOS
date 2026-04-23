import { describe, expect, it } from 'vitest'
import type { AuthConfig, BodyConfig, KeyValueItem } from '../../types'
import { buildVariableMap, prepareHttpRequest } from '../runtime'

interface EnvironmentVariable {
  key: string
  initialValue: string
  currentValue?: string
  enabled: boolean
  secret?: boolean
}

describe('api client runtime utils', () => {
  it('merges variable scopes with request priority', () => {
    const variables = buildVariableMap({
      global: [
        { key: 'BASE_URL', initialValue: 'https://global.example.com', enabled: true },
        { key: 'TOKEN', initialValue: 'global-token', enabled: true }
      ],
      environment: [
        { key: 'BASE_URL', initialValue: 'https://env.example.com', enabled: true },
        { key: 'TOKEN', initialValue: 'env-token', enabled: true }
      ],
      collection: [{ key: 'TOKEN', initialValue: 'collection-token', enabled: true }],
      folder: [{ key: 'TOKEN', initialValue: 'folder-token', enabled: true }],
      request: [{ key: 'TOKEN', initialValue: 'request-token', enabled: true }]
    })

    expect(variables.BASE_URL).toBe('https://env.example.com')
    expect(variables.TOKEN).toBe('request-token')
  })

  it('resolves templates and injects bearer authorization from variables', () => {
    const headers: KeyValueItem[] = [{ key: 'X-Trace', value: '{{TRACE_ID}}', enabled: true }]
    const body: BodyConfig = {
      type: 'json',
      content: '{"token":"{{TOKEN}}","endpoint":"{{BASE_URL}}/users"}'
    }
    const auth: AuthConfig = { type: 'bearer', token: '{{TOKEN}}' }

    const prepared = prepareHttpRequest(
      {
        method: 'POST',
        url: '{{BASE_URL}}/login',
        headers,
        body,
        auth,
        requestVariables: [{ key: 'TRACE_ID', initialValue: 'trace-001', enabled: true }]
      },
      {
        globalVariables: [{ key: 'BASE_URL', initialValue: 'https://global.example.com', enabled: true }],
        activeEnvironmentVariables: [{ key: 'TOKEN', initialValue: 'token-from-env', enabled: true }]
      }
    )

    expect(prepared.url).toBe('https://global.example.com/login')
    expect(prepared.headers).toEqual([
      { key: 'X-Trace', value: 'trace-001', enabled: true },
      { key: 'Authorization', value: 'Bearer token-from-env', enabled: true }
    ])
    expect(prepared.body).toEqual({
      type: 'json',
      content: '{"token":"token-from-env","endpoint":"https://global.example.com/users"}'
    })
  })

  it('adds api key auth to query string when configured', () => {
    const prepared = prepareHttpRequest(
      {
        method: 'GET',
        url: 'https://example.com/messages?limit=10',
        auth: { type: 'api-key', key: 'api_key', value: '{{API_KEY}}', addTo: 'query' }
      },
      {
        activeEnvironmentVariables: [{ key: 'API_KEY', initialValue: 'secret-key', enabled: true }]
      }
    )

    expect(prepared.url).toBe('https://example.com/messages?limit=10&api_key=secret-key')
    expect(prepared.headers).toEqual([])
  })
})