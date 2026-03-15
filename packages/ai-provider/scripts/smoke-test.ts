import { createAIProvider } from '../src/factory.js'

process.env.SEPPA_PROVIDER = 'anthropic'
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'

const provider = createAIProvider()
console.log(provider.getLabel())
