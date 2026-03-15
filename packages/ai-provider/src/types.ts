/**
 * Request parameters for an AI completion call.
 * Provider-agnostic — the factory and providers handle
 * mapping to provider-specific formats.
 */
export interface AICompletionRequest {
  /** System prompt establishing SEPPA context and persona */
  system: string
  /** Full message history in provider-agnostic format */
  messages: AIMessage[]
  /**
   * Max tokens to generate.
   * Must be explicitly set by caller — no silent defaults.
   * Recommended: 1024 for general use, 512 for simple queries.
   */
  maxTokens: number
  /**
   * Temperature 0.0–1.0.
   * SEPPA construction queries: 0.3 for determinism.
   * Creative/exploratory queries: 0.7.
   */
  temperature: number
}

/**
 * A single message in the conversation history.
 */
export interface AIMessage {
  /** The role of the message author */
  role: 'user' | 'assistant'
  /** The text content of the message */
  content: string
}

/**
 * Response from an AI completion call.
 * Normalized across all providers.
 */
export interface AICompletionResponse {
  /** The generated text content */
  text: string
  /** Provider label — matches getLabel() output */
  provider: string
  /** Model identifier as returned by the provider */
  model: string
  /** Token usage. null if provider does not report them. */
  usage: {
    inputTokens: number | null
    outputTokens: number | null
  }
}
