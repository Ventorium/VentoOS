import type { BodyConfig, HttpMethod, KeyValueItem } from '../types'

export interface ParsedCurl {
  url: string
  method: HttpMethod
  headers: KeyValueItem[]
  body?: BodyConfig
  auth?: { type: 'basic'; username: string; password: string }
}

function tokenizeCurl(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuote: '"' | "'" | null = null
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (escaped) {
      current += ch
      escaped = false
      continue
    }

    if (ch === '\\') {
      // Shell line-continuation: \ followed by newline (or \r\n) should be ignored
      if (i + 1 < input.length && (input[i + 1] === '\n' || input[i + 1] === '\r')) {
        if (input[i + 1] === '\r' && i + 2 < input.length && input[i + 2] === '\n') {
          i += 2 // skip \r\n
        } else {
          i++ // skip \n
        }
        continue
      }
      escaped = true
      current += ch
      continue
    }

    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null
      }
      current += ch
      continue
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch
      current += ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function unquote(str: string): string {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1)
  }
  return str
}

export function parseCurl(input: string): ParsedCurl | null {
  const trimmed = input.trim()
  if (!trimmed.toLowerCase().startsWith('curl')) {
    return null
  }

  const tokens = tokenizeCurl(trimmed)
  let i = 1 // skip 'curl'

  let url = ''
  let method: HttpMethod = 'GET'
  const headers: KeyValueItem[] = []
  let bodyContent = ''
  let bodyType: BodyConfig['type'] = 'none'
  let auth: ParsedCurl['auth']
  let isFormData = false
  let formParams: KeyValueItem[] = []

  while (i < tokens.length) {
    const tok = tokens[i]

    if (tok === '-X' || tok === '--request') {
      i++
      method = (tokens[i] ?? 'GET').toUpperCase() as HttpMethod
    } else if (tok === '-H' || tok === '--header') {
      i++
      const h = unquote(tokens[i] ?? '')
      const colonIdx = h.indexOf(':')
      if (colonIdx > 0) {
        const key = h.slice(0, colonIdx).trim()
        const value = h.slice(colonIdx + 1).trim()
        headers.push({ key, value, enabled: true })
      }
    } else if (tok === '-d' || tok === '--data' || tok === '--data-raw') {
      i++
      const data = unquote(tokens[i] ?? '')
      if (bodyContent) {
        bodyContent += '&' + data
      } else {
        bodyContent = data
      }
      bodyType = 'text'
      if (!method || method === 'GET') {
        method = 'POST'
      }
    } else if (tok === '--data-binary') {
      i++
      const data = unquote(tokens[i] ?? '')
      if (data.startsWith('@')) {
        bodyContent = data
        bodyType = 'binary'
      } else {
        if (bodyContent) {
          bodyContent += '&' + data
        } else {
          bodyContent = data
        }
        bodyType = 'text'
      }
      if (!method || method === 'GET') {
        method = 'POST'
      }
    } else if (tok === '--data-urlencode') {
      i++
      const data = encodeURIComponent(unquote(tokens[i] ?? ''))
      if (bodyContent) {
        bodyContent += '&' + data
      } else {
        bodyContent = data
      }
      bodyType = 'text'
      if (!method || method === 'GET') {
        method = 'POST'
      }
    } else if (tok === '--json') {
      i++
      bodyContent = unquote(tokens[i] ?? '')
      bodyType = 'json'
      headers.push({ key: 'Content-Type', value: 'application/json', enabled: true })
      if (!method || method === 'GET') {
        method = 'POST'
      }
    } else if (tok === '-F' || tok === '--form') {
      i++
      isFormData = true
      const f = unquote(tokens[i] ?? '')
      const eqIdx = f.indexOf('=')
      if (eqIdx > 0) {
        const key = f.slice(0, eqIdx).trim()
        const value = f.slice(eqIdx + 1).trim()
        formParams.push({ key, value, enabled: true })
      }
      if (!method || method === 'GET') {
        method = 'POST'
      }
    } else if (tok === '-u' || tok === '--user') {
      i++
      const creds = unquote(tokens[i] ?? '')
      const colonIdx = creds.indexOf(':')
      if (colonIdx > 0) {
        auth = { type: 'basic', username: creds.slice(0, colonIdx), password: creds.slice(colonIdx + 1) }
      } else {
        auth = { type: 'basic', username: creds, password: '' }
      }
    } else if (tok.startsWith('-')) {
      // Unknown flag, skip its value if it looks like it has one
      i++
      const next = tokens[i]
      if (next && !next.startsWith('-') && !next.startsWith('http') && !next.startsWith("'http") && !next.startsWith('"http')) {
        i++
        continue
      }
      continue
    } else {
      const unquoted = unquote(tok)
      if (unquoted.startsWith('http')) {
        url = unquoted
      }
    }

    i++
  }

  // Infer body type from Content-Type header, or default curl behavior
  const ctHeader = headers.find(h => h.key.toLowerCase() === 'content-type')
  if (ctHeader) {
    const ct = ctHeader.value.toLowerCase()
    if (ct.includes('application/json')) bodyType = 'json'
    else if (ct.includes('application/x-www-form-urlencoded')) bodyType = 'form-urlencoded'
    else if (ct.includes('multipart/form-data')) bodyType = 'form-data'
    else if (ct.includes('application/xml') || ct.includes('text/xml')) bodyType = 'xml'
    else if (ct.includes('text/plain')) bodyType = 'text'
  } else if (bodyContent && bodyType === 'text') {
    // curl defaults to form-urlencoded when -d is used without Content-Type
    bodyType = 'form-urlencoded'
    headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true })
  }

  let body: BodyConfig | undefined
  if (isFormData && formParams.length > 0) {
    body = { type: 'form-data', params: formParams }
  } else if (bodyContent) {
    body = { type: bodyType, content: bodyContent }
  }

  return {
    url,
    method,
    headers,
    body,
    auth
  }
}

export function toCurl(opts: {
  url: string
  method: HttpMethod
  headers?: KeyValueItem[]
  body?: BodyConfig
  auth?: { type: string; username?: string; password?: string; token?: string }
}): string {
  const { url, method, headers = [], body, auth } = opts

  let cmd = 'curl'

  if (method !== 'GET') {
    cmd += ` -X ${method}`
  }

  const enabledHeaders = headers.filter(h => h.enabled && h.key)
  for (const h of enabledHeaders) {
    cmd += ` \\\n  -H '${h.key}: ${h.value}'`
  }

  if (auth) {
    if (auth.type === 'basic' && auth.username) {
      const creds = auth.password ? `${auth.username}:${auth.password}` : auth.username
      cmd += ` \\\n  -u '${creds}'`
    } else if (auth.type === 'bearer' && auth.token) {
      cmd += ` \\\n  -H 'Authorization: Bearer ${auth.token}'`
    } else if (auth.type === 'api-key' && auth.key && auth.value) {
      if (auth.addTo === 'query') {
        const sep = url.includes('?') ? '&' : '?'
        // Don't mutate the original cmd display; just show a comment
        cmd += ` \\\n  # API Key would be appended to URL: ${url}${sep}${auth.key}=${auth.value}`
      } else {
        cmd += ` \\\n  -H '${auth.key}: ${auth.value}'`
      }
    }
  }

  if (body) {
    switch (body.type) {
      case 'json':
        if (body.content) {
          cmd += ` \\\n  -d '${body.content.replace(/'/g, "'\\''")}'`
        }
        break
      case 'text':
      case 'xml':
        if (body.content) {
          cmd += ` \\\n  -d '${body.content.replace(/'/g, "'\\''")}'`
        }
        break
      case 'form-urlencoded':
        if (body.params && body.params.length > 0) {
          for (const p of body.params.filter(p => p.enabled && p.key)) {
            cmd += ` \\\n  -d '${p.key}=${p.value}'`
          }
        } else if (body.content) {
          cmd += ` \\\n  -d '${body.content.replace(/'/g, "'\\''")}'`
        }
        break
      case 'form-data':
        if (body.params && body.params.length > 0) {
          for (const p of body.params.filter(p => p.enabled && p.key)) {
            const val = p.dataType === 'file' ? '@file' : p.value
            cmd += ` \\\n  -F '${p.key}=${val}'`
          }
        }
        break
      case 'binary':
        cmd += ` \\\n  --data-binary '@file'`
        break
      default:
        break
    }
  }

  cmd += ` \\\n  '${url}'`

  return cmd
}
