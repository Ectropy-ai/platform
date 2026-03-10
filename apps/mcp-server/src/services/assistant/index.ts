/**
 * Assistant Service - Barrel Exports
 *
 * @module assistant
 * @version 1.0.0
 */

// Types
export type {
  ChatRequest,
  ChatResponse,
  ChatContext,
  AssistantMessage,
  ToolCallResult,
  Conversation,
  ConversationMessage,
  ClaudeTool,
  ToolExecutor,
  ToolExecutionContext,
  ToolExecutionResult,
  AssistantConfig,
  AuthorityLevel,
  ResponseMetadata,
} from './types.js';

export { AUTHORITY_NAMES, DEFAULT_ASSISTANT_CONFIG } from './types.js';

// Main service
export {
  AssistantService,
  getAssistantService,
  resetAssistantService,
} from './assistant.service.js';

// Claude client
export {
  ClaudeClient,
  ClaudeAPIError,
  type ClaudeMessage,
  type ClaudeContentBlock,
  type ClaudeResponse,
  type ToolUseRequest,
} from './claude-client.js';

// Tool registry
export {
  toolRegistry,
  getToolsByCategory,
  getTool,
  getToolNames,
  getToolRegistrySummary,
} from './tool-registry.js';

// Tool executor
export {
  executeTool,
  executeToolCalls,
  getAvailableToolNames,
} from './tool-executor.js';

// System prompt
export { generateSystemPrompt, getContextSummary } from './system-prompt.js';

// Conversation store (Redis-backed with in-memory fallback)
export {
  createConversation,
  getConversation,
  getOrCreateConversation,
  addMessage,
  getRecentMessages,
  listConversations,
  deleteConversation,
  updateContext,
  getStoreStats,
  clearAllConversations,
  pruneConversations,
  initializeConversationStore,
  isRedisAvailable,
} from './conversation-store-redis.js';

// Context builder
export {
  buildMessageHistory,
  buildContextSummary,
  enrichUserMessage,
  extractContextUpdates,
  mergeContext,
  validateContext,
  estimateTokens,
  trimToTokenBudget,
} from './context-builder.js';
