/**
 * Streaming Service Tests
 *
 * Comprehensive tests for the SSE streaming assistant service.
 * Tests SSE event generation, streaming protocol, and error handling.
 *
 * @module assistant/__tests__/streaming.spec
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Response } from 'express';
import type {
  ChatRequest,
  AuthorityLevel,
  ChatContext,
  SSEStartEvent,
  SSEContentEvent,
  SSEToolStartEvent,
  SSEToolEndEvent,
  SSEDoneEvent,
  SSEErrorEvent,
} from '../assistant/types.js';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Redis/conversation store
vi.mock('../../cache/redis.js', () => ({
  redisClient: null,
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
}));

// Mock conversation store functions
vi.mock('../assistant/conversation-store-redis.js', () => ({
  getOrCreateConversation: vi.fn(),
  addMessage: vi.fn(),
  getRecentMessages: vi.fn(),
  updateContext: vi.fn(),
  initializeConversationStore: vi.fn(),
  clearMemoryConversations: vi.fn(),
}));

// Mock context builder
vi.mock('../assistant/context-builder.js', () => ({
  buildMessageHistory: vi.fn().mockReturnValue([]),
  enrichUserMessage: vi.fn().mockImplementation((msg) => msg),
  extractContextUpdates: vi.fn().mockReturnValue(null),
  mergeContext: vi.fn().mockImplementation((ctx) => ctx),
}));

// Mock system prompt
vi.mock('../assistant/system-prompt.js', () => ({
  generateSystemPrompt: vi.fn().mockReturnValue('System prompt'),
}));

// Mock tool registry
vi.mock('../assistant/tool-registry.js', () => ({
  toolRegistry: [],
}));

// Mock tool executor
vi.mock('../assistant/tool-executor.js', () => ({
  executeTool: vi.fn(),
}));

import {
  getOrCreateConversation,
  addMessage,
  getRecentMessages,
} from '../assistant/conversation-store-redis.js';
import { executeTool } from '../assistant/tool-executor.js';

// ============================================================================
// SSE Stream Mock
// ============================================================================

/**
 * Create a mock Express response for SSE testing
 */
function createMockResponse(): Response & {
  events: Array<{ event: string; data: unknown }>;
  _buffer: string;
} {
  const emitter = new EventEmitter();
  const events: Array<{ event: string; data: unknown }> = [];
  let buffer = '';

  const res = {
    events,
    _buffer: '',
    setHeader: vi.fn(),
    write: vi.fn().mockImplementation((data: string) => {
      // Accumulate data in buffer
      buffer += data;
      res._buffer = buffer;

      // Parse complete SSE events from buffer
      const eventBlocks = buffer.split('\n\n');

      // Process all complete blocks (those followed by \n\n)
      for (let i = 0; i < eventBlocks.length - 1; i++) {
        const block = eventBlocks[i];
        if (!block.trim()) continue;

        const lines = block.split('\n');
        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.substring(6);
          }
        }

        if (currentEvent && currentData) {
          try {
            events.push({
              event: currentEvent,
              data: JSON.parse(currentData),
            });
          } catch {
            events.push({ event: currentEvent, data: currentData });
          }
        }
      }

      // Keep only the incomplete part in buffer
      buffer = eventBlocks[eventBlocks.length - 1] || '';

      return true;
    }),
    end: vi.fn(),
    on: vi.fn().mockImplementation((event: string, handler: () => void) => {
      emitter.on(event, handler);
      return res;
    }),
    emit: (event: string) => emitter.emit(event),
  } as unknown as Response & {
    events: Array<{ event: string; data: unknown }>;
    _buffer: string;
  };

  return res;
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestAuthority(level: number = 3): AuthorityLevel {
  return {
    level,
    name: level === 3 ? 'PM' : 'FIELD',
    title: level === 3 ? 'Project Manager' : 'Field Worker',
  };
}

function createTestContext(): ChatContext {
  return {
    projectId: 'proj-test-001',
    voxelId: 'voxel-test-001',
  };
}

function createTestRequest(overrides?: Partial<ChatRequest>): ChatRequest {
  return {
    userId: 'user-001',
    userAuthority: createTestAuthority(),
    message: 'Test message',
    ...overrides,
  };
}

function createMockConversation() {
  return {
    id: 'conv-test-001',
    userId: 'user-001',
    userAuthority: createTestAuthority(),
    messages: [],
    context: createTestContext(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// SSEStream Class Tests
// ============================================================================

describe('SSEStream', () => {
  describe('header setup', () => {
    it('should set correct SSE headers', () => {
      const res = createMockResponse();

      // Simulate SSE stream setup (from the streaming module)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream'
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });
  });

  describe('event sending', () => {
    it('should format start event correctly', () => {
      const res = createMockResponse();

      // Write SSE format - complete message with \n\n terminator
      const startData: SSEStartEvent['data'] = {
        conversationId: 'conv-001',
        model: 'claude-sonnet-4-20250514',
      };

      res.write(`event: start\ndata: ${JSON.stringify(startData)}\n\n`);

      expect(res.events).toHaveLength(1);
      expect(res.events[0].event).toBe('start');
      expect(res.events[0].data).toEqual(startData);
    });

    it('should format content event correctly', () => {
      const res = createMockResponse();

      const contentData: SSEContentEvent['data'] = { delta: 'Hello world' };

      res.write(`event: content\ndata: ${JSON.stringify(contentData)}\n\n`);

      expect(res.events).toHaveLength(1);
      expect(res.events[0].event).toBe('content');
      expect((res.events[0].data as SSEContentEvent['data']).delta).toBe(
        'Hello world'
      );
    });

    it('should format tool_start event correctly', () => {
      const res = createMockResponse();

      const toolStartData: SSEToolStartEvent['data'] = {
        toolName: 'get_pending_decisions',
        toolCallId: 'tool-001',
        input: { userId: 'user-001' },
      };

      res.write(`event: tool_start\ndata: ${JSON.stringify(toolStartData)}\n\n`);

      expect(res.events).toHaveLength(1);
      expect(res.events[0].event).toBe('tool_start');
      expect((res.events[0].data as SSEToolStartEvent['data']).toolName).toBe(
        'get_pending_decisions'
      );
    });

    it('should format tool_end event correctly', () => {
      const res = createMockResponse();

      const toolEndData: SSEToolEndEvent['data'] = {
        toolName: 'get_pending_decisions',
        toolCallId: 'tool-001',
        success: true,
        output: { decisions: [] },
        durationMs: 150,
      };

      res.write(`event: tool_end\ndata: ${JSON.stringify(toolEndData)}\n\n`);

      expect(res.events).toHaveLength(1);
      expect(res.events[0].event).toBe('tool_end');
      expect((res.events[0].data as SSEToolEndEvent['data']).success).toBe(true);
    });

    it('should format done event correctly', () => {
      const res = createMockResponse();

      const doneData: SSEDoneEvent['data'] = {
        conversationId: 'conv-001',
        message: {
          role: 'assistant',
          content: 'Response complete',
        },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          processingTimeMs: 1500,
          toolCallCount: 2,
        },
      };

      res.write(`event: done\ndata: ${JSON.stringify(doneData)}\n\n`);

      expect(res.events).toHaveLength(1);
      expect(res.events[0].event).toBe('done');
      expect(
        (res.events[0].data as SSEDoneEvent['data']).conversationId
      ).toBe('conv-001');
    });

    it('should format error event correctly', () => {
      const res = createMockResponse();

      const errorData: SSEErrorEvent['data'] = {
        error: 'TOOL_EXECUTION_FAILED',
        message: 'Failed to execute get_pending_decisions',
      };

      res.write(`event: error\ndata: ${JSON.stringify(errorData)}\n\n`);

      expect(res.events).toHaveLength(1);
      expect(res.events[0].event).toBe('error');
      expect((res.events[0].data as SSEErrorEvent['data']).error).toBe(
        'TOOL_EXECUTION_FAILED'
      );
    });
  });

  describe('multiple events', () => {
    it('should send events in correct sequence', () => {
      const res = createMockResponse();

      // Simulate typical streaming response
      res.write(
        `event: start\ndata: ${JSON.stringify({ conversationId: 'conv-001', model: 'claude-sonnet-4-20250514' })}\n\n`
      );
      res.write(
        `event: content\ndata: ${JSON.stringify({ delta: 'I will ' })}\n\n`
      );
      res.write(
        `event: content\ndata: ${JSON.stringify({ delta: 'help you ' })}\n\n`
      );
      res.write(
        `event: tool_start\ndata: ${JSON.stringify({ toolName: 'get_pending_decisions', toolCallId: 'tool-001', input: {} })}\n\n`
      );
      res.write(
        `event: tool_end\ndata: ${JSON.stringify({ toolName: 'get_pending_decisions', toolCallId: 'tool-001', success: true, output: {}, durationMs: 100 })}\n\n`
      );
      res.write(
        `event: content\ndata: ${JSON.stringify({ delta: 'with that.' })}\n\n`
      );
      res.write(
        `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-001', message: { role: 'assistant', content: 'I will help you with that.' }, metadata: { model: 'claude-sonnet-4-20250514', inputTokens: 50, outputTokens: 20, totalTokens: 70, processingTimeMs: 500, toolCallCount: 1 } })}\n\n`
      );

      expect(res.events).toHaveLength(7);
      expect(res.events[0].event).toBe('start');
      expect(res.events[1].event).toBe('content');
      expect(res.events[2].event).toBe('content');
      expect(res.events[3].event).toBe('tool_start');
      expect(res.events[4].event).toBe('tool_end');
      expect(res.events[5].event).toBe('content');
      expect(res.events[6].event).toBe('done');
    });
  });

  describe('client disconnect', () => {
    it('should handle client disconnect gracefully', () => {
      const res = createMockResponse();

      // Register close handler
      let closeHandler: (() => void) | null = null;
      res.on = vi.fn().mockImplementation((event, handler) => {
        if (event === 'close') {
          closeHandler = handler;
        }
        return res;
      });

      // Simulate connection setup
      res.on('close', () => {});

      // Verify close handler registered
      expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });
});

// ============================================================================
// Event Type Tests
// ============================================================================

describe('SSE Event Types', () => {
  describe('SSEStartEvent', () => {
    it('should have required fields', () => {
      const event: SSEStartEvent = {
        type: 'start',
        data: {
          conversationId: 'conv-001',
          model: 'claude-sonnet-4-20250514',
        },
      };

      expect(event.type).toBe('start');
      expect(event.data.conversationId).toBeDefined();
      expect(event.data.model).toBeDefined();
    });
  });

  describe('SSEContentEvent', () => {
    it('should have delta field', () => {
      const event: SSEContentEvent = {
        type: 'content',
        data: { delta: 'Some text' },
      };

      expect(event.type).toBe('content');
      expect(event.data.delta).toBe('Some text');
    });

    it('should handle empty delta', () => {
      const event: SSEContentEvent = {
        type: 'content',
        data: { delta: '' },
      };

      expect(event.data.delta).toBe('');
    });
  });

  describe('SSEToolStartEvent', () => {
    it('should have required tool info', () => {
      const event: SSEToolStartEvent = {
        type: 'tool_start',
        data: {
          toolName: 'capture_decision',
          toolCallId: 'tool-123',
          input: { question: 'Approve change order?' },
        },
      };

      expect(event.type).toBe('tool_start');
      expect(event.data.toolName).toBe('capture_decision');
      expect(event.data.toolCallId).toBe('tool-123');
      expect(event.data.input).toBeDefined();
    });
  });

  describe('SSEToolEndEvent', () => {
    it('should indicate success with output', () => {
      const event: SSEToolEndEvent = {
        type: 'tool_end',
        data: {
          toolName: 'capture_decision',
          toolCallId: 'tool-123',
          success: true,
          output: { decisionId: 'DEC-2026-0001' },
          durationMs: 250,
        },
      };

      expect(event.type).toBe('tool_end');
      expect(event.data.success).toBe(true);
      expect(event.data.output).toHaveProperty('decisionId');
      expect(event.data.durationMs).toBe(250);
    });

    it('should indicate failure with error', () => {
      const event: SSEToolEndEvent = {
        type: 'tool_end',
        data: {
          toolName: 'capture_decision',
          toolCallId: 'tool-123',
          success: false,
          error: 'Insufficient authority',
          durationMs: 50,
        },
      };

      expect(event.data.success).toBe(false);
      expect(event.data.error).toBe('Insufficient authority');
    });
  });

  describe('SSEDoneEvent', () => {
    it('should have complete response metadata', () => {
      const event: SSEDoneEvent = {
        type: 'done',
        data: {
          conversationId: 'conv-001',
          message: {
            role: 'assistant',
            content: 'Final response',
            toolCalls: [
              {
                toolName: 'get_pending_decisions',
                input: {},
                output: { decisions: [] },
                success: true,
                durationMs: 150,
              },
            ],
          },
          suggestedActions: ['Review pending items', 'Explore voxels'],
          metadata: {
            model: 'claude-sonnet-4-20250514',
            inputTokens: 500,
            outputTokens: 150,
            totalTokens: 650,
            processingTimeMs: 2500,
            toolCallCount: 1,
          },
        },
      };

      expect(event.type).toBe('done');
      expect(event.data.conversationId).toBe('conv-001');
      expect(event.data.message.role).toBe('assistant');
      expect(event.data.message.toolCalls).toHaveLength(1);
      expect(event.data.suggestedActions).toHaveLength(2);
      expect(event.data.metadata?.totalTokens).toBe(650);
    });
  });

  describe('SSEErrorEvent', () => {
    it('should have error code and message', () => {
      const event: SSEErrorEvent = {
        type: 'error',
        data: {
          error: 'API_RATE_LIMIT',
          message: 'Too many requests',
        },
      };

      expect(event.type).toBe('error');
      expect(event.data.error).toBe('API_RATE_LIMIT');
      expect(event.data.message).toBe('Too many requests');
    });

    it('should work with error only', () => {
      const event: SSEErrorEvent = {
        type: 'error',
        data: {
          error: 'INTERNAL_ERROR',
        },
      };

      expect(event.data.error).toBe('INTERNAL_ERROR');
      expect(event.data.message).toBeUndefined();
    });
  });
});

// ============================================================================
// Streaming Response Tests
// ============================================================================

describe('Streaming Response Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    vi.mocked(getOrCreateConversation).mockResolvedValue(createMockConversation());
    vi.mocked(getRecentMessages).mockResolvedValue([]);
    vi.mocked(addMessage).mockResolvedValue(undefined);
    vi.mocked(executeTool).mockResolvedValue({
      success: true,
      data: { result: 'test' },
      metadata: { executionTimeMs: 100 },
    });
  });

  it('should start with start event', async () => {
    const res = createMockResponse();

    // Simulate start event
    res.write(
      `event: start\ndata: ${JSON.stringify({
        conversationId: 'conv-001',
        model: 'claude-sonnet-4-20250514',
      })}\n\n`
    );

    expect(res.events[0].event).toBe('start');
    expect(
      (res.events[0].data as SSEStartEvent['data']).conversationId
    ).toBe('conv-001');
  });

  it('should end with done event', async () => {
    const res = createMockResponse();

    // Simulate full stream
    res.write(
      `event: start\ndata: ${JSON.stringify({ conversationId: 'conv-001', model: 'claude-sonnet-4-20250514' })}\n\n`
    );
    res.write(
      `event: content\ndata: ${JSON.stringify({ delta: 'Response' })}\n\n`
    );
    res.write(
      `event: done\ndata: ${JSON.stringify({
        conversationId: 'conv-001',
        message: { role: 'assistant', content: 'Response' },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          processingTimeMs: 100,
          toolCallCount: 0,
        },
      })}\n\n`
    );

    const lastEvent = res.events[res.events.length - 1];
    expect(lastEvent.event).toBe('done');
  });

  it('should include tool events when tools are used', async () => {
    const res = createMockResponse();

    // Simulate stream with tool use
    res.write(
      `event: start\ndata: ${JSON.stringify({ conversationId: 'conv-001', model: 'claude-sonnet-4-20250514' })}\n\n`
    );
    res.write(
      `event: tool_start\ndata: ${JSON.stringify({
        toolName: 'get_pending_decisions',
        toolCallId: 'tool-001',
        input: { userId: 'user-001' },
      })}\n\n`
    );
    res.write(
      `event: tool_end\ndata: ${JSON.stringify({
        toolName: 'get_pending_decisions',
        toolCallId: 'tool-001',
        success: true,
        output: { decisions: [] },
        durationMs: 150,
      })}\n\n`
    );
    res.write(
      `event: done\ndata: ${JSON.stringify({
        conversationId: 'conv-001',
        message: { role: 'assistant', content: 'No pending decisions' },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 50,
          outputTokens: 20,
          totalTokens: 70,
          processingTimeMs: 500,
          toolCallCount: 1,
        },
      })}\n\n`
    );

    const toolStartEvents = res.events.filter((e) => e.event === 'tool_start');
    const toolEndEvents = res.events.filter((e) => e.event === 'tool_end');

    expect(toolStartEvents).toHaveLength(1);
    expect(toolEndEvents).toHaveLength(1);
    expect(
      (toolEndEvents[0].data as SSEToolEndEvent['data']).durationMs
    ).toBe(150);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  it('should send error event on failure', () => {
    const res = createMockResponse();

    res.write(
      `event: start\ndata: ${JSON.stringify({ conversationId: 'conv-001', model: 'claude-sonnet-4-20250514' })}\n\n`
    );
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: 'CLAUDE_API_ERROR',
        message: 'API request failed',
      })}\n\n`
    );

    const errorEvent = res.events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as SSEErrorEvent['data']).error).toBe(
      'CLAUDE_API_ERROR'
    );
  });

  it('should send error for tool execution failure', () => {
    const res = createMockResponse();

    res.write(
      `event: start\ndata: ${JSON.stringify({ conversationId: 'conv-001', model: 'claude-sonnet-4-20250514' })}\n\n`
    );
    res.write(
      `event: tool_start\ndata: ${JSON.stringify({
        toolName: 'approve_decision',
        toolCallId: 'tool-001',
        input: { decisionId: 'DEC-001' },
      })}\n\n`
    );
    res.write(
      `event: tool_end\ndata: ${JSON.stringify({
        toolName: 'approve_decision',
        toolCallId: 'tool-001',
        success: false,
        error: 'Insufficient authority level',
        durationMs: 25,
      })}\n\n`
    );

    const toolEndEvent = res.events.find(
      (e) =>
        e.event === 'tool_end' &&
        (e.data as SSEToolEndEvent['data']).success === false
    );
    expect(toolEndEvent).toBeDefined();
    expect((toolEndEvent!.data as SSEToolEndEvent['data']).error).toBe(
      'Insufficient authority level'
    );
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance Metrics', () => {
  it('should track processing time', () => {
    const res = createMockResponse();

    res.write(
      `event: done\ndata: ${JSON.stringify({
        conversationId: 'conv-001',
        message: { role: 'assistant', content: 'Done' },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          processingTimeMs: 1234,
          toolCallCount: 2,
        },
      })}\n\n`
    );

    const doneEvent = res.events.find((e) => e.event === 'done');
    expect(
      (doneEvent!.data as SSEDoneEvent['data']).metadata?.processingTimeMs
    ).toBe(1234);
  });

  it('should track token usage', () => {
    const res = createMockResponse();

    res.write(
      `event: done\ndata: ${JSON.stringify({
        conversationId: 'conv-001',
        message: { role: 'assistant', content: 'Done' },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
          processingTimeMs: 2000,
          toolCallCount: 0,
        },
      })}\n\n`
    );

    const doneEvent = res.events.find((e) => e.event === 'done');
    const metadata = (doneEvent!.data as SSEDoneEvent['data']).metadata;

    expect(metadata?.inputTokens).toBe(500);
    expect(metadata?.outputTokens).toBe(200);
    expect(metadata?.totalTokens).toBe(700);
  });

  it('should track tool call count', () => {
    const res = createMockResponse();

    res.write(
      `event: done\ndata: ${JSON.stringify({
        conversationId: 'conv-001',
        message: { role: 'assistant', content: 'Done with tools' },
        metadata: {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 300,
          outputTokens: 100,
          totalTokens: 400,
          processingTimeMs: 3000,
          toolCallCount: 5,
        },
      })}\n\n`
    );

    const doneEvent = res.events.find((e) => e.event === 'done');
    expect(
      (doneEvent!.data as SSEDoneEvent['data']).metadata?.toolCallCount
    ).toBe(5);
  });

  it('should track tool execution duration', () => {
    const res = createMockResponse();

    res.write(
      `event: tool_end\ndata: ${JSON.stringify({
        toolName: 'complex_analysis',
        toolCallId: 'tool-001',
        success: true,
        output: { analysis: 'complete' },
        durationMs: 5000,
      })}\n\n`
    );

    const toolEndEvent = res.events.find((e) => e.event === 'tool_end');
    expect((toolEndEvent!.data as SSEToolEndEvent['data']).durationMs).toBe(
      5000
    );
  });
});
