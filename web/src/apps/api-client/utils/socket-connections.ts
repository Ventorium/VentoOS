import type { MqttConnection, WebSocketConnection } from '../types'

function normalizePath(path: string) {
  const trimmedPath = path.trim()

  if (trimmedPath.length === 0) {
    return ''
  }

  return trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`
}

export function buildSocketUrl(connection: Pick<WebSocketConnection, 'scheme' | 'host' | 'port' | 'path'>) {
  const host = connection.host.trim()
  if (!connection.scheme || host.length === 0) {
    return ''
  }

  const portPart = typeof connection.port === 'number' ? `:${connection.port}` : ''
  return `${connection.scheme}://${host}${portPart}${normalizePath(connection.path)}`
}

export function buildMqttBrokerUrl(connection: Pick<MqttConnection, 'scheme' | 'host' | 'port' | 'path'>) {
  const host = connection.host.trim()
  if (!connection.scheme || host.length === 0) {
    return ''
  }

  const portPart = typeof connection.port === 'number' ? `:${connection.port}` : ''
  const pathPart = connection.scheme === 'ws' || connection.scheme === 'wss' ? normalizePath(connection.path) : ''
  return `${connection.scheme}://${host}${portPart}${pathPart}`
}

export function withNormalizedPath(path: string) {
  return normalizePath(path)
}