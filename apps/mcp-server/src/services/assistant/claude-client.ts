/**
 * Claude API Client
 *
 * Wrapper around the Anthropic SDK for Claude API interactions.
 * Handles message sending, tool use responses, and error handling.
 *
 * @module assistant/claude-client
 * @version 1.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AssistantConfig, ClaudeTool } from './types.js';

/**
 * Message format for Claude API.
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

/**
 * Content block types in Claude messages.
 */
export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

/**
 * Response from Claude API.
 */
export interface ClaudeResponse {
  /** Response ID */
  id: string;

  /** Stop reason */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

  /** Content blocks in the response */
  content: ClaudeContentBlock[];

  /** Usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };

  /** Model used */
  model: string;
}

/**
 * Tool use request from Claude.
 */
export interface ToolUseRequest {
  /** Tool use block ID */
  id: string;

  /** Tool name to execute */
  name: string;

  /** Input parameters */
  input: Record<string, unknown>;
}

/**
 * Claude API client wrapper.
 */
export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: Pick<AssistantConfig, 'apiKey' | 'model' | 'maxTokens'>) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
  }

  /**
   * Send a message to Claude with optional tools.
   *
   * @param systemPrompt - System prompt for context
   * @param messages - Conversation messages
   * @param tools - Available tools
   * @returns Claude's response
   */
  async sendMessage(
    systemPrompt: string,
    messages: ClaudeMessage[],
    tools?: ClaudeTool[]
  ): Promise<ClaudeResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
        })),
      });

      return {
        id: response.id,
        stopReason: this.mapStopReason(response.stop_reason),
        content: response.content.map((block: Anthropic.Messages.ContentBlock) =>
          this.mapContentBlock(block)
        ),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (error: unknown) {
      if (error instanceof Anthropic.APIError) {
        throw new ClaudeAPIError(
          `Claude API error: ${error.message}`,
          error.status,
          error.error
        );
      }
      throw error;
    }
  }

  /**
   * Extract tool use requests from a response.
   *
   * @param response - Claude response
   * @returns Array of tool use requests
   */
  extractToolUseRequests(response: ClaudeResponse): ToolUseRequest[] {
    return response.content
      .filter(
        (block): block is Extract<ClaudeContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use'
      )
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input,
      }));
  }

  /**
   * Extract text content from a response.
   *
   * @param response - Claude response
   * @returns Combined text content
   */
  extractTextContent(response: ClaudeResponse): string {
    return response.content
      .filter(
        (block): block is Extract<ClaudeContentBlock, { type: 'text' }> =>
          block.type === 'text'
      )
      .map((block) => block.text)
      .join('\n');
  }

  /**
   * Create a tool result content block.
   *
   * @param toolUseId - ID of the tool use block
   * @param result - Result content (will be JSON stringified if object)
   * @param isError - Whether the result is an error
   * @returns Tool result content block
   */
  createToolResultBlock(
    toolUseId: string,
    result: unknown,
    isError = false
  ): ClaudeContentBlock {
    const content =
      typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      is_error: isError,
    };
  }

  /**
   * Get the configured model name.
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Check if response requires tool execution.
   */
  requiresToolExecution(response: ClaudeResponse): boolean {
    return response.stopReason === 'tool_use';
  }

  /**
   * Map Anthropic stop reason to our format.
   */
  private mapStopReason(reason: string | null): ClaudeResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }

  /**
   * Map Anthropic content block to our format.
   */
  private mapContentBlock(
    block: Anthropic.Messages.ContentBlock
  ): ClaudeContentBlock {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }
    // Fallback for unknown types
    return { type: 'text', text: '[Unknown content block]' };
  }
}

/**
 * Custom error class for Claude API errors.
 */
export class ClaudeAPIError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly _details?: unknown
  ) {
    super(message);
    this.name = 'ClaudeAPIError';
  }
}
