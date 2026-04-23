import type { AuthConfig, BodyConfig, HttpMethod, KeyValueItem } from '../types'

type RuntimeVariable = {
  key: string
  value?: string
  initialValue?: string
  currentValue?: string
  enabled?: boolean
}

type VariableScopes = {
  global?: RuntimeVariable[]
  environment?: RuntimeVariable[]
  collection?: RuntimeVariable[]
  folder?: RuntimeVariable[]
  request?: RuntimeVariable[]
}

type PrepareRequestInput = {
  method: HttpMethod
  url: string
  headers?: KeyValueItem[]
  body?: BodyConfig
  auth?: AuthConfig
  collectionVariables?: RuntimeVariable[]
  folderVariables?: RuntimeVariable[]
  requestVariables?: RuntimeVariable[]
}

type PrepareRequestContext = {
  globalVariables?: RuntimeVariable[]
  activeEnvironmentVariables?: RuntimeVariable[]
}

type PreparedRequest = {
  method: HttpMethod
  url: string
  headers: KeyValueItem[]
  body?: BodyConfig
}

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_.$-]+)\s*\}\}/g

function isEnabled(variable: RuntimeVariable) {
  return variable.enabled !== false && Boolean(variable.key)
}

function getVariableValue(variable: RuntimeVariable) {
  return variable.currentValue ?? variable.value ?? variable.initialValue ?? ''
}

function withResolvedText(value: string | undefined, variables: Record<string, string>) {
  if (!value) return value ?? ''

  return value.replace(TEMPLATE_PATTERN, (full, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : full
  })
}

function withResolvedHeaders(headers: KeyValueItem[] | undefined, variables: Record<string, string>) {
  return (headers ?? [])
    .filter(header => header.enabled !== false && Boolean(header.key))
    .map(header => ({
      ...header,
      key: withResolvedText(header.key, variables),
      value: withResolvedText(header.value, variables)
    }))
}

function withResolvedBody(body: BodyConfig | undefined, variables: Record<string, string>) {
  if (!body) {
    return undefined
  }

  if (body.params) {
    return {
      ...body,
      params: body.params.map(param => ({
        ...param,
        key: withResolvedText(param.key, variables),
        value: withResolvedText(param.value, variables)
      }))
    }
  }

  if (body.content == null) {
    return body
  }

  return {
    ...body,
    content: withResolvedText(body.content, variables)
  }
}

function upsertHeader(headers: KeyValueItem[], nextHeader: KeyValueItem) {
  const existingIndex = headers.findIndex(header => header.key.toLowerCase() === nextHeader.key.toLowerCase())
  if (existingIndex >= 0) {
    const nextHeaders = [...headers]
    nextHeaders[existingIndex] = nextHeader
    return nextHeaders
  }

  return [...headers, nextHeader]
}

function appendQueryValue(url: string, key: string, value: string) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

function applyAuth(
  url: string,
  headers: KeyValueItem[],
  auth: AuthConfig | undefined,
  variables: Record<string, string>
) {
  if (!auth || auth.type === 'none' || auth.type === 'inherit') {
    return { url, headers }
  }

  if (auth.type === 'basic') {
    const username = withResolvedText(auth.username, variables)
    const password = withResolvedText(auth.password, variables)
    const encoded = typeof btoa === 'function' ? btoa(`${username}:${password}`) : `${username}:${password}`

    return {
      url,
      headers: upsertHeader(headers, { key: 'Authorization', value: `Basic ${encoded}`, enabled: true })
    }
  }

  if (auth.type === 'bearer') {
    const token = withResolvedText(auth.token, variables)
    if (!token) {
      return { url, headers }
    }

    return {
      url,
      headers: upsertHeader(headers, { key: 'Authorization', value: `Bearer ${token}`, enabled: true })
    }
  }

  if (auth.type === 'api-key') {
    const key = withResolvedText(auth.key, variables)
    const value = withResolvedText(auth.value, variables)
    if (!key || !value) {
      return { url, headers }
    }

    if (auth.addTo === 'query') {
      return { url: appendQueryValue(url, key, value), headers }
    }

    return {
      url,
      headers: upsertHeader(headers, { key, value, enabled: true })
    }
  }

  return { url, headers }
}

export function buildVariableMap(scopes: VariableScopes) {
  const map: Record<string, string> = {}

  for (const scope of [scopes.global, scopes.environment, scopes.collection, scopes.folder, scopes.request]) {
    for (const variable of scope ?? []) {
      if (!isEnabled(variable)) {
        continue
      }

      map[variable.key] = getVariableValue(variable)
    }
  }

  return map
}

export function prepareHttpRequest(input: PrepareRequestInput, context: PrepareRequestContext = {}): PreparedRequest {
  const variables = buildVariableMap({
    global: context.globalVariables,
    environment: context.activeEnvironmentVariables,
    collection: input.collectionVariables,
    folder: input.folderVariables,
    request: input.requestVariables
  })

  const resolvedUrl = withResolvedText(input.url, variables)
  const resolvedHeaders = withResolvedHeaders(input.headers, variables)
  const resolvedBody = withResolvedBody(input.body, variables)
  const authResult = applyAuth(resolvedUrl, resolvedHeaders, input.auth, variables)

  return {
    method: input.method,
    url: authResult.url,
    headers: authResult.headers,
    body: resolvedBody
  }
}