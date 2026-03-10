/**
 * Streaming Assistant Service (SSE Support)
 *
 * Provides Server-Sent Events (SSE) streaming for real-time assistant responses.
 * Implements the streaming protocol defined in the SEPPA architecture.
 *
 * @module assistant/streaming
 * @version 1.0.0
 */

import type { Response } from 'express';
import type {
  ChatRequest,
  ToolCallResult,
  ResponseMetadata,
  SSEStartEvent,
  SSEContentEvent,
  SSEToolStartEvent,
  SSEToolEndEvent,
  SSEDoneEvent,
  SSEErrorEvent,
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
 * SSE helper for sending events.
 */
class SSEStream {
  private res: Response;
  private isClosed: boolean = false;

  constructor(res: Response) {
    this.res = res;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Handle client disconnect
    res.on('close', () => {
      this.isClosed = true;
    });
  }

  /**
   * Send an SSE event.
   */
  send(event: string, data: unknown): void {
    if (this.isClosed) {
      return;
    }

    const payload = JSON.stringify(data);
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${payload}\n\n`);
  }

  /**
   * Send start event.
   */
  start(data: SSEStartEvent['data']): void {
    this.send('start', data);
  }

  /**
   * Send content delta event.
   */
  content(delta: string): void {
    this.send('content', { delta });
  }

  /**
   * Send tool start event.
   */
  toolStart(data: SSEToolStartEvent['data']): void {
    this.send('tool_start', data);
  }

  /**
   * Send tool end event.
   */
  toolEnd(data: SSEToolEndEvent['data']): void {
    this.send('tool_end', data);
  }

  /**
   * Send done event.
   */
  done(data: SSEDoneEvent['data']): void {
    this.send('done', data);
  }

  /**
   * Send error event.
   */
  error(error: string, message?: string): void {
    this.send('error', { error, message });
  }

  /**
   * Close the stream.
   */
  close(): void {
    if (!this.isClosed) {
      this.res.end();
      this.isClosed = true;
    }
  }

  /**
   * Check if stream is closed.
   */
  get closed(): boolean {
    return this.isClosed;
  }
}

/**
 * Process a chat request with SSE streaming.
 *
 * @param request - Chat request from the client
 * @param res - Express response object
 * @param client - Claude client instance
 * @param config - Assistant configuration
 */
export async function streamChat(
  request: ChatRequest,
  res: Response,
  client: ClaudeClient,
  config: {
    maxHistoryMessages: number;
    maxToolIterations: number;
  }
): Promise<void> {
  const stream = new SSEStream(res);
  const startTime = Date.now();
  const toolCallResults: ToolCallResult[] = [];
  let conversationId: string | undefined;

  try {
    // Get or create conversation
    const conversation = await getOrCreateConversation(
      request.conversationId,
      request.userId,
      request.userAuthority,
      request.context
    );
    conversationId = conversation.id;

    // Get model from Claude client config
    const modelName = client.getModel();

    // Send start event
    stream.start({
      conversationId: conversation.id,
      model: modelName,
    });

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
      config.maxHistoryMessages
    );
    const claudeHistory = buildMessageHistory(
      historyMessages,
      config.maxHistoryMessages
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
    await addMessage(conversation.id, {
      role: 'user',
      content: request.message,
      timestamp: new Date().toISOString(),
    });

    // Main conversation loop with tool execution
    let iterations = 0;
    let fullTextContent = '';
    let response = await client.sendMessage(
      systemPrompt,
      claudeHistory,
      toolRegistry
    );

    // Stream initial content if any
    const initialText = client.extractTextContent(response);
    if (initialText && !stream.closed) {
      stream.content(initialText);
      fullTextContent += initialText;
    }

    // Tool execution loop
    while (
      client.requiresToolExecution(response) &&
      iterations < config.maxToolIterations &&
      !stream.closed
    ) {
      iterations++;

      // Extract tool use requests
      const toolUseRequests = client.extractToolUseRequests(response);
      const toolResults: ClaudeContentBlock[] = [];

      // Execute each tool with streaming updates
      for (const toolRequest of toolUseRequests) {
        if (stream.closed) {break;}

        // Send tool start event
        stream.toolStart({
          toolName: toolRequest.name,
          input: toolRequest.input,
        });

        const toolStartTime = Date.now();

        // Execute tool
        const result = await executeTool(
          toolRequest.name,
          toolRequest.input,
          executionContext
        );

        const durationMs = Date.now() - toolStartTime;

        // Track result
        const toolCallResult: ToolCallResult = {
          toolName: toolRequest.name,
          input: toolRequest.input,
          output: result.success ? result.data : { error: result.error },
          success: result.success,
          error: result.error,
          durationMs,
        };
        toolCallResults.push(toolCallResult);

        // Send tool end event
        if (!stream.closed) {
          stream.toolEnd({
            toolName: toolRequest.name,
            output: result.success ? result.data : { error: result.error },
            success: result.success,
            error: result.error,
            durationMs,
          });
        }

        // Create tool result block for Claude
        toolResults.push(
          client.createToolResultBlock(
            toolRequest.id,
            result.success ? result.data : { error: result.error },
            !result.success
          )
        );
      }

      if (stream.closed) {break;}

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
      response = await client.sendMessage(
        systemPrompt,
        claudeHistory,
        toolRegistry
      );

      // Stream new content
      const textDelta = client.extractTextContent(response);
      if (textDelta && !stream.closed) {
        stream.content(textDelta);
        fullTextContent += textDelta;
      }
    }

    // Extract final text response
    const finalText = fullTextContent || client.extractTextContent(response);

    // Store assistant message in conversation
    await addMessage(conversation.id, {
      role: 'assistant',
      content: finalText,
      toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
      timestamp: new Date().toISOString(),
    });

    // Update context based on tool results
    const contextUpdates = extractContextUpdates(finalText, toolCallResults);
    if (contextUpdates) {
      const newContext = mergeContext(conversation.context, contextUpdates);
      await updateContext(conversation.id, newContext);
    }

    // Build metadata
    const metadata: ResponseMetadata = {
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.inputTokens + response.usage.outputTokens,
      processingTimeMs: Date.now() - startTime,
      toolCallCount: toolCallResults.length,
    };

    // Generate suggested actions
    const suggestedActions = generateSuggestedActions(
      finalText,
      toolCallResults
    );

    // Send done event
    if (!stream.closed) {
      stream.done({
        conversationId: conversation.id,
        metadata,
        suggestedActions,
      });
    }

    console.log(
      `[Assistant Streaming] Response completed in ${metadata.processingTimeMs}ms ` +
        `(${toolCallResults.length} tools, ${response.usage.outputTokens} tokens)`
    );
  } catch (error) {
    console.error('[Assistant Streaming] Error:', error);

    if (!stream.closed) {
      stream.error(
        'Failed to process chat request',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  } finally {
    stream.close();
  }
}

/**
 * Generate suggested follow-up actions based on the response.
 */
function generateSuggestedActions(
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
  if (response.toLowerCase().includes('pending') && suggestions.length === 0) {
    suggestions.push('Show pending items');
  }

  if (response.toLowerCase().includes('voxel')) {
    suggestions.push('Explore nearby voxels');
  }

  return suggestions.length > 0 ? suggestions.slice(0, 3) : undefined;
}
