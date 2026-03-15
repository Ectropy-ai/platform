import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaProvider, OllamaError } from '../providers/ollama.provider.js'
import type { AICompletionRequest } from '../types.js'

const TEST_REQUEST: AICompletionRequest = {
  system: 'You are SEPPA.',
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 1024,
  temperature: 0.3,
}

describe('OllamaProvider', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('complete() returns AICompletionResponse shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: 'Hello from Ollama' },
        model: 'qwen2.5:7b-instruct-q4_K_M',
      }),
    })

    const provider = new OllamaProvider()
    const result = await provider.complete(TEST_REQUEST)

    expect(result).toEqual({
      text: 'Hello from Ollama',
      provider: 'ollama:qwen2.5:7b-instruct-q4_K_M',
      model: 'qwen2.5:7b-instruct-q4_K_M',
      usage: { inputTokens: null, outputTokens: null },
    })
  })

  it('complete() throws OllamaError on non-200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    const provider = new OllamaProvider()
    await expect(provider.complete(TEST_REQUEST)).rejects.toThrow(OllamaError)
    await expect(provider.complete(TEST_REQUEST)).rejects.toThrow(
      'Ollama error 500: Internal Server Error'
    )
  })

  it('stream() yields content from newline-delimited JSON', async () => {
    const lines = [
      JSON.stringify({ done: false, message: { content: 'Hello' } }),
      JSON.stringify({ done: false, message: { content: ' world' } }),
      JSON.stringify({ done: true, message: { content: '' } }),
    ].join('\n')

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines))
        controller.close()
      },
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    })

    const provider = new OllamaProvider()
    const chunks: string[] = []
    for await (const chunk of provider.stream(TEST_REQUEST)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hello', ' world'])
  })

  it('stream() stops when chunk.done === true', async () => {
    const lines = [
      JSON.stringify({ done: false, message: { content: 'partial' } }),
      JSON.stringify({ done: true, message: { content: '' } }),
      JSON.stringify({ done: false, message: { content: 'should not appear' } }),
    ].join('\n')

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines))
        controller.close()
      },
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    })

    const provider = new OllamaProvider()
    const chunks: string[] = []
    for await (const chunk of provider.stream(TEST_REQUEST)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['partial'])
  })

  it('healthCheck() true when model in tags list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'qwen2.5:7b-instruct-q4_K_M' },
          { name: 'llama3:8b' },
        ],
      }),
    })

    const provider = new OllamaProvider()
    const result = await provider.healthCheck()

    expect(result).toBe(true)
  })

  it('healthCheck() false when model absent from tags', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3:8b' }],
      }),
    })

    const provider = new OllamaProvider()
    const result = await provider.healthCheck()

    expect(result).toBe(false)
  })

  it('healthCheck() false when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    const provider = new OllamaProvider()
    const result = await provider.healthCheck()

    expect(result).toBe(false)
  })

  it('getLabel() returns "ollama:{model}"', () => {
    const provider = new OllamaProvider({ model: 'custom:model' })
    expect(provider.getLabel()).toBe('ollama:custom:model')
  })

  it('default baseUrl is "http://localhost:11434"', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: 'test' },
        model: 'qwen2.5:7b-instruct-q4_K_M',
      }),
    })

    const provider = new OllamaProvider()
    provider.complete(TEST_REQUEST)

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.any(Object)
    )
  })

  it('default model is "qwen2.5:7b-instruct-q4_K_M"', () => {
    const provider = new OllamaProvider()
    expect(provider.getLabel()).toBe('ollama:qwen2.5:7b-instruct-q4_K_M')
  })
})
