import { createEmptyCustomProfile, draftFromTemplate } from './index'

describe('AI Assistant helpers', () => {
  test('draftFromTemplate copies provider template into editable draft', () => {
    const draft = draftFromTemplate({
      vendor: 'groq',
      provider_type: 'open_ai_compatible',
      name: 'Groq',
      base_url: 'https://api.groq.com/openai/v1',
      default_model: 'llama-3.1-8b-instant',
      requires_api_key: true,
      capabilities: {
        supports_streaming: true,
        supports_tools: true,
        supports_reasoning_control: true,
        supports_connection_test: true,
        supports_model_fetch: false
      }
    })

    expect(draft.name).toBe('Groq')
    expect(draft.vendor).toBe('groq')
    expect(draft.base_url).toBe('https://api.groq.com/openai/v1')
    expect(draft.enabled).toBe(true)
  })

  test('createEmptyCustomProfile returns editable custom profile defaults', () => {
    const profile = createEmptyCustomProfile()

    expect(profile.preset_kind).toBe('custom')
    expect(profile.is_builtin).toBe(false)
    expect(profile.tool_config.enabled_tools).toContain('bash')
    expect(profile.behavior.require_impact_for_destructive).toBe(true)
  })
})
