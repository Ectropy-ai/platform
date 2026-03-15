import type { IAIProvider } from '../provider.interface.js'
import type { AICompletionRequest, AICompletionResponse } from '../types.js'

/** Default Ollama server URL */
const DEFAULT_BASE_URL = 'http://localhost:11434'

/** Default model for JtC edge deployments */
const DEFAULT_MODEL = 'qwen2.5:7b-instruct-q4_K_M'

/**
 * Typed error for Ollama API failures.
 * Thrown on non-200 responses from the Ollama server.
 */
export class OllamaError extends Error {
  /**
   * @param status - HTTP status code from Ollama
   * @param body - Response body text
   */
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`Ollama error ${status}: ${body}`)
    this.name = 'OllamaError'
  }
}

/**
 * Configuration for the Ollama provider.
 */
export interface OllamaProviderConfig {
  /** Base URL of the Ollama server. Defaults to http://localhost:11434. */
  baseUrl?: string
  /** Model identifier. Defaults to qwen2.5:7b-instruct-q4_K_M. */
  model?: string
}

/**
 * AI provider implementation backed by a local Ollama server.
 * Used for JtC edge deployments (OnLogic Karbon 521) running
 * SEPPA fully air-gapped on the jobsite.
 */
export class OllamaProvider implements IAIProvider {
  private readonly baseUrl: string
  private readonly model: string

  /**
   * @param config - Optional Ollama provider configuration
   */
  constructor(config?: OllamaProviderConfig) {
    this.baseUrl = config?.baseUrl ?? DEFAULT_BASE_URL
    this.model = config?.model ?? DEFAULT_MODEL
  }

  /**
   * Send a completion request to the Ollama chat API.
   * @param request - The completion request parameters
   * @returns Promise resolving to the normalized completion response
   * @throws {OllamaError} On non-200 HTTP responses
   */
  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const messages = [
      { role: 'system' as const, content: request.system },
      ...request.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new OllamaError(response.status, body)
    }

    const data = (await response.json()) as {
      message: { content: string }
      model: string
    }

    return {
      text: data.message.content,
      provider: this.getLabel(),
      model: data.model,
      usage: {
        inputTokens: null,
        outputTokens: null,
      },
    }
  }

  /**
   * Stream a completion from the Ollama chat API.
   * Parses newline-delimited JSON and yields content chunks.
   * @param request - The completion request parameters
   * @yields Individual text chunks from the model
   */
  async *stream(request: AICompletionRequest): AsyncGenerator<string> {
    const messages = [
      { role: 'system' as const, content: request.system },
      ...request.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new OllamaError(response.status, body)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last partial line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        const chunk = JSON.parse(line) as {
          done: boolean
          message: { content: string }
        }
        if (chunk.done) return
        if (chunk.message.content) {
          yield chunk.message.content
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const chunk = JSON.parse(buffer) as {
        done: boolean
        message: { content: string }
      }
      if (!chunk.done && chunk.message.content) {
        yield chunk.message.content
      }
    }
  }

  /**
   * Returns the provider label for observability.
   * @returns Label in format "ollama:{model}"
   */
  getLabel(): string {
    return `ollama:${this.model}`
  }

  /**
   * Verify the Ollama server is reachable and the configured model is available.
   * Checks GET /api/tags and confirms the model appears in the list.
   * @returns true if healthy and model available, false on any failure
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (!response.ok) return false

      const data = (await response.json()) as {
        models: Array<{ name: string }>
      }
      return data.models.some((m) => m.name === this.model)
    } catch {
      return false
    }
  }
}
