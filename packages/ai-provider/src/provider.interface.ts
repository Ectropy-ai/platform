import type { AICompletionRequest, AICompletionResponse } from './types.js'

/**
 * Unified interface for all AI model providers.
 * Implement this interface to add a new provider.
 * All methods must be safe to call from async contexts.
 */
export interface IAIProvider {
  /**
   * Send a completion request and return the full response.
   * Use for structured output and non-streaming contexts.
   * @param request - The completion request parameters
   * @returns Promise resolving to the completion response
   */
  complete(request: AICompletionRequest): Promise<AICompletionResponse>

  /**
   * Send a streaming completion request.
   * Yields text chunks as the model produces them.
   * Use for SEPPA chat with SSE streaming to the client.
   * @param request - The completion request parameters
   * @yields Individual text chunks from the model
   */
  stream(request: AICompletionRequest): AsyncGenerator<string>

  /**
   * Returns a human-readable label for observability.
   * Format: "{provider-name}:{model-identifier}"
   * @returns Provider and model label string
   * @example "anthropic:claude-sonnet-4-20250514"
   * @example "ollama:qwen2.5:7b-instruct-q4_K_M"
   */
  getLabel(): string

  /**
   * Verify provider is reachable and model is available.
   * Must never throw — all errors caught internally.
   * @returns true if healthy, false if any check fails
   */
  healthCheck(): Promise<boolean>
}
