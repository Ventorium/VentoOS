/**
 * Infrastructure Layer
 *
 * Layer 0: Zero business logic.
 * Provides HTTP client, WebSocket client, storage utilities, and logging.
 */

export { apiClient, configureApiClient } from './api'
export type {
  ApiResponse,
  AuthLoginData,
  AuthStatusData,
  CreatePortMappingReq,
  CreateProcessReq,
  CreateServiceExposureReq,
  CreateSshServerReq,
  PortMapping,
  ProcessStatus,
  ServiceExposure,
  SshServer,
  VProcess,
} from './api'

export { wsClient } from './ws'
export type {
  ClientMessage,
  ConnectionStatusPayload,
  NotificationPayload,
  ProcessUpdatePayload,
  ServerMessage,
  TaskUpdatePayload,
} from './ws'

export { storageGet, storageRemove, storageSet, storageClearPrefix } from './storage'
export { createLogger } from './logger'
