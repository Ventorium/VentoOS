/**
 * AI Assistant App — Agent API client & types
 *
 * AI is a system capability owned by the AI Assistant app.
 * Other components (Settings, AISidePanel) import from here.
 */

import type { ApiResponse } from '@/infra/api'
import { getAuthHeaders, handleUnauthorized, request } from '@/infra/api'

// ── Types ──────────────────────────────────────────────────────────────────

export type ProviderType = 'native' | 'open_ai_compatible'

export type ProviderVendor =
  | 'open_ai'
  | 'azure_open_ai'
  | 'anthropic'
  | 'gemini'
  | 'open_router'
  | 'ollama'
  | 'deep_seek'
  | 'silicon_flow'
  | 'groq'
  | 'custom'

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ProviderCapabilities {
  supports_streaming: boolean
  supports_tools: boolean
  supports_reasoning_control: boolean
  supports_connection_test: boolean
  supports_model_fetch: boolean
}

export interface ProviderTemplate {
  vendor: ProviderVendor
  provider_type: ProviderType
  name: string
  base_url: string
  default_model: string
  requires_api_key: boolean
  capabilities: ProviderCapabilities
}

export interface ProviderConfig {
  id: string
  name: string
  provider_type: ProviderType
  vendor: ProviderVendor
  api_key: string
  base_url: string
  default_model: string
  enabled: boolean
  capabilities?: ProviderCapabilities
}

export type ReasoningMode = 'off' | 'low' | 'medium' | 'high'

export interface ProviderProbeRequest {
  provider: ProviderConfig
  prompt?: string
  max_tokens?: number
  timeout_ms?: number
  reasoning_mode?: ReasoningMode
}

export interface ProviderProbeResult {
  success: boolean
  provider_name: string
  provider_vendor: ProviderVendor
  model: string
  latency_ms: number
  status_code?: number
  message: string
  response_preview?: string
}

export type AgentPresetKind =
  | 'general_assistant'
  | 'coding_assistant'
  | 'ops_assistant'
  | 'network_assistant'
  | 'custom'

export type AgentToolPolicyMode = 'all' | 'allow_list' | 'disabled'

export interface AgentBehaviorConfig {
  require_impact_for_destructive: boolean
  read_only_mode: boolean
  concise_output: boolean
  extra_rules: string[]
}

export interface AgentToolConfig {
  mode: AgentToolPolicyMode
  enabled_tools: string[]
  allow_bash: boolean
}

export interface AgentProfile {
  id: string
  name: string
  description: string
  preset_kind: AgentPresetKind
  is_builtin: boolean
  system_prompt: string
  behavior: AgentBehaviorConfig
  tool_config: AgentToolConfig
  default_provider_id?: string
  default_model?: string
  temperature: number
  max_tokens: number
  reasoning_mode: ReasoningMode
}

export interface ToolCall {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

export interface AgentMessage {
  role: MessageRole
  content?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ChatSession {
  id: string
  title: string
  provider_id?: string
  model?: string
  system_prompt?: string
  agent_profile_id?: string
  messages: AgentMessage[]
  created_at: string
  updated_at: string
}

export interface ChatRequest {
  session_id?: string
  message: string
  provider_id?: string
  model?: string
  system_prompt?: string
  agent_profile_id?: string
}

export interface ChatResponse {
  session_id: string
  message: AgentMessage
}

export interface AgentConfig {
  default_provider_id?: string
  default_model?: string
  default_agent_profile_id?: string
  default_system_prompt: string
  max_iterations: number
  tools_enabled: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: unknown
  risk_level: RiskLevel
}

export type StreamEvent =
  | { type: 'content_delta'; content: string }
  | { type: 'tool_call_start'; id: string; name: string; arguments: string }
  | { type: 'tool_result'; id: string; name: string; content: string; success: boolean }
  | { type: 'message_complete'; message: AgentMessage }
  | { type: 'error'; message: string }
  | { type: 'done'; session_id: string }

export type ChannelKind = 'qq' | 'ding_talk' | 'feishu' | 'we_com' | 'telegram'

export interface ChannelConfig {
  id: string
  name: string
  kind: ChannelKind
  enabled: boolean
  default_agent_profile_id?: string
  auto_route_agent: boolean
  webhook_url?: string
  bot_user_id?: string
  credentials: Record<string, unknown>
}

// ── API ─────────────────────────────────────────────────────────────────────

export const agentApi = {
  // Sessions
  getAgentSessions: () => request<ApiResponse<ChatSession[]>>('GET', '/api/agent/sessions'),
  getAgentSession: (id: string) => request<ApiResponse<ChatSession>>('GET', `/api/agent/sessions/${id}`),
  deleteAgentSession: (id: string) => request<ApiResponse<null>>('DELETE', `/api/agent/sessions/${id}`),
  agentChat: (body: ChatRequest) => request<ApiResponse<ChatResponse>>('POST', '/api/agent/chat', body),

  // Config
  getAgentConfig: () => request<ApiResponse<AgentConfig>>('GET', '/api/agent/config'),
  updateAgentConfig: (body: AgentConfig) => request<ApiResponse<unknown>>('PUT', '/api/agent/config', body),

  // Providers
  getAgentProviders: () => request<ApiResponse<ProviderConfig[]>>('GET', '/api/agent/providers'),
  getAgentProviderTemplates: () => request<ApiResponse<ProviderTemplate[]>>('GET', '/api/agent/providers/templates'),
  getAgentProvider: (id: string) => request<ApiResponse<ProviderConfig>>('GET', `/api/agent/providers/${id}`),
  createAgentProvider: (body: ProviderConfig) =>
    request<ApiResponse<ProviderConfig>>('POST', '/api/agent/providers', body),
  updateAgentProvider: (id: string, body: ProviderConfig) =>
    request<ApiResponse<ProviderConfig>>('PUT', `/api/agent/providers/${id}`, body),
  deleteAgentProvider: (id: string) => request<ApiResponse<null>>('DELETE', `/api/agent/providers/${id}`),
  testAgentProvider: (body: ProviderProbeRequest) =>
    request<ApiResponse<ProviderProbeResult>>('POST', '/api/agent/providers/test', body),

  // Profiles
  getAgentProfiles: () => request<ApiResponse<AgentProfile[]>>('GET', '/api/agent/profiles'),
  getAgentProfile: (id: string) => request<ApiResponse<AgentProfile>>('GET', `/api/agent/profiles/${id}`),
  createAgentProfile: (body: AgentProfile) => request<ApiResponse<AgentProfile>>('POST', '/api/agent/profiles', body),
  updateAgentProfile: (id: string, body: AgentProfile) =>
    request<ApiResponse<AgentProfile>>('PUT', `/api/agent/profiles/${id}`, body),
  deleteAgentProfile: (id: string) => request<ApiResponse<null>>('DELETE', `/api/agent/profiles/${id}`),

  // Tools
  getAgentTools: () => request<ApiResponse<ToolDefinition[]>>('GET', '/api/agent/tools'),

  // Channels
  agentListChannels: () => request<ApiResponse<ChannelConfig[]>>('GET', '/api/agent/channels'),
  agentGetChannel: (id: string) => request<ApiResponse<ChannelConfig>>('GET', `/api/agent/channels/${id}`),
  agentCreateChannel: (channel: Omit<ChannelConfig, 'id'> & { id?: string }) =>
    request<ApiResponse<ChannelConfig>>('POST', '/api/agent/channels', channel),
  agentUpdateChannel: (id: string, channel: Partial<ChannelConfig>) =>
    request<ApiResponse<ChannelConfig>>('PUT', `/api/agent/channels/${id}`, { ...channel, id }),
  agentDeleteChannel: (id: string) => request<ApiResponse<{ deleted: boolean }>>('DELETE', `/api/agent/channels/${id}`),

  // Stream
  agentChatStream: async function* (body: ChatRequest): AsyncGenerator<StreamEvent> {
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' }

    const response = await fetch('/api/agent/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      handleUnauthorized(response)
      throw new Error(`HTTP ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data === '[DONE]') return
          try {
            yield JSON.parse(data) as StreamEvent
          } catch {
            // Skip malformed events
          }
        }
      }
    }
  }
}
