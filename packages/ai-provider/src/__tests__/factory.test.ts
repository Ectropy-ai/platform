import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the SDK so AnthropicProvider can be constructed without real credentials
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(),
        stream: vi.fn(),
      }
    },
  }
})

import { createAIProvider } from '../factory.js'
import { AnthropicProvider } from '../providers/anthropic.provider.js'
import { OllamaProvider } from '../providers/ollama.provider.js'

describe('createAIProvider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns AnthropicProvider for SEPPA_PROVIDER=anthropic', () => {
    vi.stubEnv('SEPPA_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-key')

    const provider = createAIProvider()
    expect(provider).toBeInstanceOf(AnthropicProvider)
  })

  it('returns AnthropicProvider when SEPPA_PROVIDER unset', () => {
    vi.stubEnv('SEPPA_PROVIDER', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-key')

    // When empty string, it falls through to default
    // We need to delete the env var to truly test "unset"
    delete process.env.SEPPA_PROVIDER
    const provider = createAIProvider()
    expect(provider).toBeInstanceOf(AnthropicProvider)
  })

  it('returns OllamaProvider for SEPPA_PROVIDER=ollama', () => {
    vi.stubEnv('SEPPA_PROVIDER', 'ollama')

    const provider = createAIProvider()
    expect(provider).toBeInstanceOf(OllamaProvider)
  })

  it('throws on invalid SEPPA_PROVIDER value', () => {
    vi.stubEnv('SEPPA_PROVIDER', 'openai')

    expect(() => createAIProvider()).toThrow(
      'Invalid SEPPA_PROVIDER: "openai"'
    )
  })

  it('throws when anthropic selected + ANTHROPIC_API_KEY is not set', () => {
    vi.stubEnv('SEPPA_PROVIDER', 'anthropic')
    delete process.env.ANTHROPIC_API_KEY

    expect(() => createAIProvider()).toThrow('ANTHROPIC_API_KEY is required')
  })

  it('throw message names the invalid value clearly', () => {
    vi.stubEnv('SEPPA_PROVIDER', 'azure')

    expect(() => createAIProvider()).toThrow(
      'Invalid SEPPA_PROVIDER: "azure". Valid values: "anthropic", "ollama"'
    )
  })
})
