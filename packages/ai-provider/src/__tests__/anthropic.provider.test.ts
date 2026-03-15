import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Anthropic SDK before importing the provider
const mockCreate = vi.fn()
const mockStream = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: mockStream,
      }
    },
  }
})

import { AnthropicProvider } from '../providers/anthropic.provider.js'
import type { AICompletionRequest } from '../types.js'

const TEST_REQUEST: AICompletionRequest = {
  system: 'You are SEPPA.',
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 1024,
  temperature: 0.3,
}

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('complete() returns AICompletionResponse shape', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello back' }],
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    const result = await provider.complete(TEST_REQUEST)

    expect(result).toEqual({
      text: 'Hello back',
      provider: 'anthropic:claude-sonnet-4-20250514',
      model: 'claude-sonnet-4-20250514',
      usage: { inputTokens: 10, outputTokens: 5 },
    })
  })

  it('complete() maps usage.input_tokens correctly', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 42, output_tokens: 17 },
    })

    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    const result = await provider.complete(TEST_REQUEST)

    expect(result.usage.inputTokens).toBe(42)
    expect(result.usage.outputTokens).toBe(17)
  })

  it('stream() yields string chunks', async () => {
    const events = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
    ]

    mockStream.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) {
          yield event
        }
      },
    })

    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    const chunks: string[] = []
    for await (const chunk of provider.stream(TEST_REQUEST)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hello', ' world'])
  })

  it('healthCheck() returns true on mocked success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '' }],
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    const result = await provider.healthCheck()

    expect(result).toBe(true)
  })

  it('healthCheck() returns false on mocked API error', async () => {
    mockCreate.mockRejectedValue(new Error('API error'))

    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    const result = await provider.healthCheck()

    expect(result).toBe(false)
  })

  it('healthCheck() returns false on mocked network failure', async () => {
    mockCreate.mockRejectedValue(new TypeError('fetch failed'))

    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    const result = await provider.healthCheck()

    expect(result).toBe(false)
  })

  it('getLabel() returns "anthropic:{model}"', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-haiku-4-5-20251001',
    })
    expect(provider.getLabel()).toBe('anthropic:claude-haiku-4-5-20251001')
  })

  it('default model is "claude-sonnet-4-20250514"', () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    expect(provider.getLabel()).toBe('anthropic:claude-sonnet-4-20250514')
  })
})
