# @ectropy/ai-provider

## Purpose

Unified AI provider abstraction for the SEPPA assistant service across the LuhTech portfolio. This package enables JtC edge servers to run SEPPA locally via Ollama (fully air-gapped, offline-capable) while cloud deployments like Qullqa use the Anthropic API. Adding a new provider requires implementing a single interface with zero changes to calling code.

## Providers

| Provider   | `SEPPA_PROVIDER` | Primary env vars                        |
| ---------- | ---------------- | --------------------------------------- |
| Anthropic  | `anthropic`      | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`  |
| Ollama     | `ollama`         | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`       |

## Usage

```typescript
import { createAIProvider } from '@ectropy/ai-provider'

// Factory reads SEPPA_PROVIDER env var and returns the configured provider
const provider = createAIProvider()

// Non-streaming completion
const response = await provider.complete({
  system: 'You are SEPPA, a construction intelligence assistant.',
  messages: [{ role: 'user', content: 'What is a load-bearing wall?' }],
  maxTokens: 1024,
  temperature: 0.3,
})

console.log(response.text)
```

## Environment Variables

| Variable           | Provider   | Required | Default                            |
| ------------------ | ---------- | -------- | ---------------------------------- |
| `SEPPA_PROVIDER`   | All        | No       | `anthropic`                        |
| `ANTHROPIC_API_KEY`| Anthropic  | Yes      | —                                  |
| `ANTHROPIC_MODEL`  | Anthropic  | No       | `claude-sonnet-4-20250514`     |
| `OLLAMA_BASE_URL`  | Ollama     | No       | `http://localhost:11434`           |
| `OLLAMA_MODEL`     | Ollama     | No       | `qwen2.5:7b-instruct-q4_K_M`      |

## Adding a New Provider

1. Create `src/providers/your-provider.ts` implementing `IAIProvider`
2. Add a case to the `switch` in `src/factory.ts`
3. Document env vars in this README
4. Add `src/__tests__/your-provider.test.ts`
