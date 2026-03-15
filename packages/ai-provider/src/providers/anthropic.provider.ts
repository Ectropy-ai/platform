import Anthropic from '@anthropic-ai/sdk'
import type { IAIProvider } from '../provider.interface.js'
import type { AICompletionRequest, AICompletionResponse } from '../types.js'

/** Default model used when none is specified */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

/**
 * Configuration for the Anthropic provider.
 */
export interface AnthropicProviderConfig {
  /** Anthropic API key — injected by the factory, never read from env */
  apiKey: string
  /** Model identifier. Defaults to claude-sonnet-4-20250514. */
  model?: string
}

/**
 * AI provider implementation backed by the Anthropic API.
 * Used for cloud deployments of SEPPA (Qullqa and all cloud ventures).
 */
export class AnthropicProvider implements IAIProvider {
  private readonly client: Anthropic
  private readonly model: string

  /**
   * @param config - Anthropic provider configuration
   */
  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.model = config.model ?? DEFAULT_MODEL
  }

  /**
   * Send a completion request to the Anthropic Messages API.
   * @param request - The completion request parameters
   * @returns Promise resolving to the normalized completion response
   */
  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.system,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    const text = textBlock && 'text' in textBlock ? textBlock.text : ''

    return {
      text,
      provider: this.getLabel(),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }

  /**
   * Stream a completion from the Anthropic Messages API.
   * Yields text delta strings as the model produces them.
   * @param request - The completion request parameters
   * @yields Individual text chunks from the model
   */
  async *stream(request: AICompletionRequest): AsyncGenerator<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.system,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text
      }
    }
  }

  /**
   * Returns the provider label for observability.
   * @returns Label in format "anthropic:{model}"
   */
  getLabel(): string {
    return `anthropic:${this.model}`
  }

  /**
   * Verify the Anthropic API is reachable and the model is available.
   * Sends a minimal request (max_tokens: 1) as a ping.
   * @returns true if healthy, false on any failure
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      })
      return true
    } catch {
      return false
    }
  }
}
