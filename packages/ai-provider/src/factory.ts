import type { IAIProvider } from './provider.interface.js'
import { AnthropicProvider } from './providers/anthropic.provider.js'
import { OllamaProvider } from './providers/ollama.provider.js'

/**
 * Creates and returns the configured AI provider.
 * Reads SEPPA_PROVIDER environment variable to determine which provider to use.
 * Call once at service startup and inject the result.
 *
 * @throws Error if SEPPA_PROVIDER is an invalid value
 * @throws Error if required env vars are missing (e.g. ANTHROPIC_API_KEY for anthropic)
 * @returns Configured IAIProvider instance
 */
export function createAIProvider(): IAIProvider {
  const providerName = process.env.SEPPA_PROVIDER ?? 'anthropic'

  switch (providerName) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is required when SEPPA_PROVIDER is "anthropic"'
        )
      }
      const model = process.env.ANTHROPIC_MODEL || undefined
      return new AnthropicProvider({ apiKey, model })
    }

    case 'ollama': {
      const baseUrl = process.env.OLLAMA_BASE_URL || undefined
      const model = process.env.OLLAMA_MODEL || undefined
      return new OllamaProvider({ baseUrl, model })
    }

    default:
      throw new Error(
        `Invalid SEPPA_PROVIDER: "${providerName}". Valid values: "anthropic", "ollama"`
      )
  }
}
