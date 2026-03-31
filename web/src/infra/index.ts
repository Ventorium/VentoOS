/**
 * Infrastructure Layer
 *
 * Layer 0: Zero business logic.
 * Provides HTTP client, WebSocket client, storage utilities, and logging.
 */

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
  VProcess
} from './api'
export { apiClient, configureApiClient } from './api'
export { createLogger } from './logger'
export { storageClearPrefix, storageGet, storageRemove, storageSet } from './storage'
export type {
  ClientMessage,
  ConnectionStatusPayload,
  NotificationPayload,
  ProcessUpdatePayload,
  ServerMessage,
  TaskUpdatePayload
} from './ws'
export { wsClient } from './ws'
