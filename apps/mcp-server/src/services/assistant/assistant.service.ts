/**
 * Assistant Service
 *
 * Main orchestration service for the Claude-powered assistant.
 * Handles the conversation loop, tool execution, and response generation.
 *
 * @module assistant/assistant.service
 * @version 1.0.0
 */

import type {
  ChatRequest,
  ChatResponse,
  AssistantConfig,
  ToolCallResult,
  ConversationMessage,
  ToolExecutionContext,
} from './types.js';
import { ClaudeClient, type ClaudeContentBlock } from './claude-client.js';
import { toolRegistry } from './tool-registry.js';
import { executeTool } from './tool-executor.js';
import { generateSystemPrompt } from './system-prompt.js';
import {
  getOrCreateConversation,
  addMessage,
  getRecentMessages,
  updateContext,
} from './conversation-store-redis.js';
import {
  buildMessageHistory,
  enrichUserMessage,
  extractContextUpdates,
  mergeContext,
} from './context-builder.js';

/**
 * Assistant service configuration with defaults.
 */
const DEFAULT_CONFIG: Omit<AssistantConfig, 'apiKey'> = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  maxHistoryMessages: 20,
  maxToolIterations: 10,
  timeoutMs: 30000,
};

/**
 * Assistant Service class.
 *
 * Orchestrates the conversation flow between the user and Claude,
 * including tool execution and context management.
 */
export class AssistantService {
  private client: ClaudeClient;
  private config: AssistantConfig;

  constructor(config?: Partial<AssistantConfig>) {
    const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required for AssistantService'
      );
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey,
    };

    this.client = new ClaudeClient({
      apiKey: this.config.apiKey,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
    });
  }

  /**
   * Process a chat request and generate a response.
   *
   * @param request - Chat request from the client
   * @returns Chat response with assistant message and tool results
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const toolCallResults: ToolCallResult[] = [];

    try {
      // Get or create conversation
      const conversation = await getOrCreateConversation(
        request.conversationId,
        request.userId,
        request.userAuthority,
        request.context
      );

      // Build execution context for tools
      const executionContext: ToolExecutionContext = {
        userId: request.userId,
        userAuthority: request.userAuthority,
        projectId:
          request.context?.projectId || conversation.context?.projectId,
        conversationId: conversation.id,
      };

      // Generate system prompt
      const systemPrompt = generateSystemPrompt(
        request.userAuthority,
        request.userName,
        conversation.context
      );

      // Build message history
      const historyMessages = await getRecentMessages(
        conversation.id,
        this.config.maxHistoryMessages
      );
      const claudeHistory = buildMessageHistory(
        historyMessages,
        this.config.maxHistoryMessages
      );

      // Enrich user message with context
      const enrichedMessage = enrichUserMessage(
        request.message,
        conversation.context
      );

      // Add user message to history
      claudeHistory.push({
        role: 'user',
        content: enrichedMessage,
      });

      // Store user message in conversation
      const userMessage: ConversationMessage = {
        role: 'user',
        content: request.message,
        timestamp: new Date().toISOString(),
      };
      await addMessage(conversation.id, userMessage);

      // Main conversation loop with tool execution
      let iterations = 0;
      let response = await this.client.sendMessage(
        systemPrompt,
        claudeHistory,
        toolRegistry
      );

      while (
        this.client.requiresToolExecution(response) &&
        iterations < this.config.maxToolIterations
      ) {
        iterations++;

        // Extract tool use requests
        const toolUseRequests = this.client.extractToolUseRequests(response);

        // Execute each tool
        const toolResults: ClaudeContentBlock[] = [];

        for (const toolRequest of toolUseRequests) {
          console.log(`[Assistant] Executing tool: ${toolRequest.name}`);

          const result = await executeTool(
            toolRequest.name,
            toolRequest.input,
            executionContext
          );

          // Track result for response
          toolCallResults.push({
            toolName: toolRequest.name,
            input: toolRequest.input,
            output: result.success ? result.data : { error: result.error },
            success: result.success,
            error: result.error,
            durationMs: result.metadata?.executionTimeMs as number | undefined,
          });

          // Create tool result block for Claude
          toolResults.push(
            this.client.createToolResultBlock(
              toolRequest.id,
              result.success ? result.data : { error: result.error },
              !result.success
            )
          );
        }

        // Add assistant's tool use response to history
        claudeHistory.push({
          role: 'assistant',
          content: response.content,
        });

        // Add tool results to history
        claudeHistory.push({
          role: 'user',
          content: toolResults,
        });

        // Continue conversation with tool results
        response = await this.client.sendMessage(
          systemPrompt,
          claudeHistory,
          toolRegistry
        );
      }

      // Extract final text response
      const textContent = this.client.extractTextContent(response);

      // Store assistant message in conversation
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: textContent,
        toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
        timestamp: new Date().toISOString(),
      };
      await addMessage(conversation.id, assistantMessage);

      // Update context based on tool results
      const contextUpdates = extractContextUpdates(
        textContent,
        toolCallResults
      );
      if (contextUpdates) {
        const newContext = mergeContext(conversation.context, contextUpdates);
        await updateContext(conversation.id, newContext);
      }

      // Build response
      const chatResponse: ChatResponse = {
        conversationId: conversation.id,
        message: {
          role: 'assistant',
          content: textContent,
          toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
        },
        suggestedActions: this.generateSuggestedActions(
          textContent,
          toolCallResults
        ),
        metadata: {
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.inputTokens + response.usage.outputTokens,
          processingTimeMs: Date.now() - startTime,
          toolCallCount: toolCallResults.length,
        },
      };

      console.log(
        `[Assistant] Response generated in ${chatResponse.metadata?.processingTimeMs}ms ` +
          `(${toolCallResults.length} tools, ${response.usage.outputTokens} tokens)`
      );

      return chatResponse;
    } catch (error) {
      console.error('[Assistant] Error processing chat:', error);

      throw error;
    }
  }

  /**
   * Generate suggested follow-up actions based on the response.
   */
  private generateSuggestedActions(
    response: string,
    toolResults: ToolCallResult[]
  ): string[] | undefined {
    const suggestions: string[] = [];

    // Analyze tool results for suggestions
    for (const result of toolResults) {
      if (!result.success) {
        continue;
      }

      const data = result.output as Record<string, unknown>;

      // Suggest approval if pending decisions found
      if (result.toolName === 'get_user_pending_actions' && data.totalPending) {
        if ((data.totalPending as number) > 0) {
          suggestions.push('Review pending decisions');
        }
      }

      // Suggest inspection follow-up
      if (result.toolName === 'request_inspection') {
        suggestions.push('Check inspection schedule');
      }

      // Suggest consequence tracking after decision capture
      if (result.toolName === 'capture_decision') {
        suggestions.push('Track potential consequences');
      }
    }

    // Add generic suggestions based on response content
    if (
      response.toLowerCase().includes('pending') &&
      suggestions.length === 0
    ) {
      suggestions.push('Show pending items');
    }

    if (response.toLowerCase().includes('voxel')) {
      suggestions.push('Explore nearby voxels');
    }

    return suggestions.length > 0 ? suggestions.slice(0, 3) : undefined;
  }

  /**
   * Get service status and configuration.
   */
  getStatus(): {
    model: string;
    maxToolIterations: number;
    toolCount: number;
  } {
    return {
      model: this.config.model,
      maxToolIterations: this.config.maxToolIterations,
      toolCount: toolRegistry.length,
    };
  }

  /**
   * Get the Claude client instance for streaming support.
   */
  getClaudeClient(): ClaudeClient {
    return this.client;
  }
}

/**
 * Create a singleton instance of the assistant service.
 */
let assistantInstance: AssistantService | null = null;

/**
 * Get or create the assistant service instance.
 */
export function getAssistantService(): AssistantService {
  if (!assistantInstance) {
    assistantInstance = new AssistantService();
  }
  return assistantInstance;
}

/**
 * Reset the assistant service instance (for testing).
 */
export function resetAssistantService(): void {
  assistantInstance = null;
}
