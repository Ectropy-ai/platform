/**
 * SEPPA AI Provider — Edge Server Integration
 *
 * Singleton AI provider instance for the edge-server.
 * Initialised once at startup via createAIProvider() from @ectropy/ai-provider.
 *
 * On JtC Karbon 521 edge deployments, SEPPA_PROVIDER=ollama routes all AI
 * calls through the local Ollama server (qwen2.5:7b-instruct-q4_K_M).
 * Data never leaves the jobsite.
 *
 * On cloud deployments, SEPPA_PROVIDER=anthropic (default) routes through
 * the Anthropic API.
 *
 * Usage:
 *   import { aiProvider } from './ai.js'
 *   const response = await aiProvider.complete({ ... })
 */

import { createAIProvider } from '@ectropy/ai-provider'
import type { IAIProvider } from '@ectropy/ai-provider'

/**
 * Singleton AI provider instance.
 * Configured by SEPPA_PROVIDER environment variable at startup.
 * Inject this into route handlers and services that need AI capabilities.
 */
export const aiProvider: IAIProvider = createAIProvider()
