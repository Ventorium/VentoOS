/**
 * Super Terminal — Shared types
 */

// ── SSH Server ─────────────────────────────────────────────────────────────

export type SshAuthMethod =
  | { type: 'password'; credential_id?: string | null }
  | {
      type: 'private_key'
      key_path?: string | null
      credential_id?: string | null
      passphrase_credential_id?: string | null
    }
  | { type: 'agent' }

export type JumpHost =
  | { type: 'existing'; server_id: string }
  | {
      type: 'manual'
      host: string
      port?: number
      username: string
      auth_method: SshAuthMethod
      password?: string
      private_key?: string
    }

export interface ProxyConfig {
  enabled: boolean
  address: string
}

export interface SshServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_method: SshAuthMethod
  group?: string
  tags: string[]
  remark?: string
  os_type?: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  connect_timeout_ms: number
  heartbeat_ms: number
  default_path?: string
  init_script?: string
  jump_host?: JumpHost
  proxy?: ProxyConfig
  created_at: string
  updated_at: string
  last_connected_at?: string
}

export interface CreateSshServerReq {
  name: string
  host: string
  port?: number
  username: string
  auth_method: SshAuthMethod
  group?: string
  tags?: string[]
  remark?: string
  connect_timeout_ms?: number
  heartbeat_ms?: number
  default_path?: string
  init_script?: string
  jump_host?: JumpHost
  proxy?: ProxyConfig
  password?: string
  private_key?: string
}

// ── Port Mapping ───────────────────────────────────────────────────────────

export interface PortMapping {
  id: string
  name: string
  ssh_server_id: string
  remote_host: string
  remote_port: number
  local_port: number
  auto_start: boolean
  remark?: string
  status: 'stopped' | 'starting' | 'active' | 'error'
  created_at: string
}

export interface CreatePortMappingReq {
  name: string
  ssh_server_id: string
  remote_host: string
  remote_port: number
  local_port: number
  auto_start?: boolean
  remark?: string
}

// ── Service Exposure ───────────────────────────────────────────────────────

export interface ServiceExposure {
  id: string
  name: string
  source_type: 'local' | 'ssh'
  ssh_server_id?: string
  source_host: string
  source_port: number
  public_port: number
  public_url?: string
  basic_auth_enabled: boolean
  basic_auth_username?: string
  status: 'stopped' | 'starting' | 'active' | 'error'
  created_at: string
}

export interface CreateServiceExposureReq {
  name: string
  source_type: 'local' | 'ssh'
  ssh_server_id?: string
  source_host: string
  source_port: number
  public_port: number
  basic_auth_enabled: boolean
  basic_auth_username?: string
  basic_auth_password?: string
  ssh_command?: string
}

// ── SSH Config Import ──────────────────────────────────────────────────────

export interface SshConfigHost {
  alias: string
  hostname: string | null
  user: string | null
  port: number | null
  identity_file: string | null
  auto_detected_key: string | null
  proxy_jump: string | null
}

export interface SshKeyFile {
  name: string
  path: string
  is_public: boolean
}

// ── Shell Detection ────────────────────────────────────────────────────────

export interface DetectedShell {
  name: string
  path: string
  is_default: boolean
}

// ── Custom Commands ────────────────────────────────────────────────────────

export interface CustomCommand {
  id: string
  name: string
  command: string
  description?: string
}

// ── Terminal Settings ──────────────────────────────────────────────────────

export interface TerminalSettings {
  shell?: string
  fontSize: number
  fontFamily: string
  scrollback: number
  theme: 'dark' | 'light' | 'custom'
  backgroundColor?: string
  backgroundImage?: string
  backgroundOpacity?: number
}

export const defaultTerminalSettings: TerminalSettings = {
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
  scrollback: 5000,
  theme: 'dark',
  backgroundOpacity: 1
}

// ── Navigation ─────────────────────────────────────────────────────────────

export type NavTab = 'local-terminal' | 'ssh-servers' | 'port-mapping' | 'public-access'

// ── Session Tab ────────────────────────────────────────────────────────────

export interface SessionTab {
  id: string
  serverId: string
  serverName: string
  title: string
}

// ── Public Access Provider ─────────────────────────────────────────────────

export interface PublicAccessProvider {
  id: string
  name: string
  description: string
  command: (localAddr: string) => string
}

export const publicAccessProviders: PublicAccessProvider[] = [
  {
    id: 'pinggy',
    name: 'Pinggy',
    description: '免费 HTTP/HTTPS 隧道，支持二维码访问',
    command: (addr: string) =>
      `ssh -p 443 -R0:${addr} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null qr@free.pinggy.io`
  },
  {
    id: 'localhost-run',
    name: 'localhost.run',
    description: '免费 SSH 隧道，无需注册',
    command: (addr: string) =>
      `ssh -R 80:${addr} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null nokey@localhost.run`
  },
  {
    id: 'serveo',
    name: 'Serveo',
    description: '免费 SSH 隧道，支持自定义域名',
    command: (addr: string) =>
      `ssh -R 80:${addr} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null serveo.net`
  }
]
