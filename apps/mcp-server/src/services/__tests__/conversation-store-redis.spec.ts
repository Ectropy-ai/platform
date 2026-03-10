/**
 * Conversation Store Redis Tests
 *
 * Comprehensive tests for the Redis-backed conversation persistence layer.
 * Tests use memory fallback since Redis is mocked as unavailable.
 *
 * @module assistant/__tests__/conversation-store-redis.spec
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ConversationMessage,
  ChatContext,
  AuthorityLevel,
} from '../assistant/types.js';

// Mock the redis module - factory must not reference external variables
// ROOT CAUSE (Five Why 2026-02-27): vi.fn().mockResolvedValue() in vi.mock()
// factory does NOT survive restoreMocks: true. Use vi.fn(async () => ...) instead.
vi.mock('../../cache/redis.js', () => ({
  redisClient: null, // Disable Redis for tests - use memory fallback
  redisGet: vi.fn(async () => null),
  redisSet: vi.fn(async () => undefined),
  redisDel: vi.fn(async () => undefined),
}));

// Import after mocking
import {
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
  isRedisAvailable,
  initializeConversationStore,
} from '../assistant/conversation-store-redis.js';

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

function createTestContext(overrides?: Partial<ChatContext>): ChatContext {
  return {
    projectId: 'proj-test-001',
    voxelId: 'voxel-test-001',
    activeDecisionId: 'dec-test-001',
    ...overrides,
  };
}

function createTestMessage(
  role: 'user' | 'assistant',
  content: string
): ConversationMessage {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe('initializeConversationStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should initialize with memory mode when Redis disabled', async () => {
    await initializeConversationStore();

    const available = isRedisAvailable();
    expect(available).toBe(false);
  });

  it('should support memory storage for conversations', async () => {
    await initializeConversationStore();

    const userId = 'user-001';
    const authority = createTestAuthority();
    const conv = await createConversation(userId, authority);

    expect(conv.id).toBeDefined();
    expect(await getConversation(conv.id)).toBeDefined();
  });
});

// ============================================================================
// createConversation Tests
// ============================================================================

describe('createConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should create conversation with unique ID', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);

    expect(conv.id).toBeDefined();
    expect(conv.id).toMatch(/^conv-/);
    expect(conv.userId).toBe(userId);
    expect(conv.userAuthority).toEqual(authority);
    expect(conv.messages).toEqual([]);
  });

  it('should create conversation with context', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();
    const context = createTestContext();

    const conv = await createConversation(userId, authority, context);

    expect(conv.context).toEqual(context);
  });

  it('should create conversations with different IDs', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv1 = await createConversation(userId, authority);
    const conv2 = await createConversation(userId, authority);

    expect(conv1.id).not.toBe(conv2.id);
  });

  it('should set timestamps on creation', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);

    expect(conv.createdAt).toBeDefined();
    expect(conv.updatedAt).toBeDefined();
    expect(new Date(conv.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should store conversation and retrieve it', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);

    // Verify conversation was created and can be retrieved
    expect(conv.id).toBeDefined();
    expect(conv.userId).toBe(userId);

    const retrieved = await getConversation(conv.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(conv.id);
  });
});

// ============================================================================
// getConversation Tests
// ============================================================================

describe('getConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should return undefined for non-existent conversation', async () => {
    const result = await getConversation('non-existent-id');

    expect(result).toBeUndefined();
  });

  it('should retrieve conversation from memory store', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const created = await createConversation(userId, authority);
    const retrieved = await getConversation(created.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.userId).toBe(userId);
  });

  it('should return correct conversation data', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority(4);
    const context = createTestContext({ projectId: 'specific-project' });

    const created = await createConversation(userId, authority, context);
    const retrieved = await getConversation(created.id);

    expect(retrieved?.userAuthority.level).toBe(4);
    expect(retrieved?.context?.projectId).toBe('specific-project');
  });
});

// ============================================================================
// getOrCreateConversation Tests
// ============================================================================

describe('getOrCreateConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should create new conversation when ID not provided', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await getOrCreateConversation(undefined, userId, authority);

    expect(conv.id).toBeDefined();
    expect(conv.id).toMatch(/^conv-/);
  });

  it('should return existing conversation when ID provided', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const created = await createConversation(userId, authority);
    const retrieved = await getOrCreateConversation(
      created.id,
      userId,
      authority
    );

    expect(retrieved.id).toBe(created.id);
  });

  it('should create new conversation if ID not found', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await getOrCreateConversation(
      'non-existent-id',
      userId,
      authority
    );

    expect(conv.id).toBeDefined();
    expect(conv.id).not.toBe('non-existent-id');
  });

  it('should use provided context for new conversation', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();
    const context = createTestContext({ voxelId: 'specific-voxel' });

    const conv = await getOrCreateConversation(
      undefined,
      userId,
      authority,
      context
    );

    expect(conv.context?.voxelId).toBe('specific-voxel');
  });
});

// ============================================================================
// addMessage Tests
// ============================================================================

describe('addMessage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should add user message to conversation', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    const message = createTestMessage('user', 'Hello assistant');

    await addMessage(conv.id, message);

    const updated = await getConversation(conv.id);
    expect(updated?.messages).toHaveLength(1);
    expect(updated?.messages[0].role).toBe('user');
    expect(updated?.messages[0].content).toBe('Hello assistant');
  });

  it('should add assistant message to conversation', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    const message = createTestMessage('assistant', 'How can I help?');

    await addMessage(conv.id, message);

    const updated = await getConversation(conv.id);
    expect(updated?.messages).toHaveLength(1);
    expect(updated?.messages[0].role).toBe('assistant');
  });

  it('should add multiple messages in order', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);

    await addMessage(conv.id, createTestMessage('user', 'Question 1'));
    await addMessage(conv.id, createTestMessage('assistant', 'Answer 1'));
    await addMessage(conv.id, createTestMessage('user', 'Question 2'));

    const updated = await getConversation(conv.id);
    expect(updated?.messages).toHaveLength(3);
    expect(updated?.messages[0].content).toBe('Question 1');
    expect(updated?.messages[1].content).toBe('Answer 1');
    expect(updated?.messages[2].content).toBe('Question 2');
  });

  it('should add message with tool calls', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    const message: ConversationMessage = {
      role: 'assistant',
      content: 'I executed the tool',
      toolCalls: [
        {
          toolName: 'get_pending_decisions',
          input: { userId: 'user-001' },
          output: { decisions: [] },
          success: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    await addMessage(conv.id, message);

    const updated = await getConversation(conv.id);
    expect(updated?.messages[0].toolCalls).toHaveLength(1);
    expect(updated?.messages[0].toolCalls?.[0].toolName).toBe(
      'get_pending_decisions'
    );
  });

  it('should return undefined for non-existent conversation', async () => {
    const message = createTestMessage('user', 'Hello');

    const result = await addMessage('non-existent', message);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// getRecentMessages Tests
// ============================================================================

describe('getRecentMessages', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should return empty array for conversation with no messages', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    const messages = await getRecentMessages(conv.id, 10);

    expect(messages).toEqual([]);
  });

  it('should return all messages when less than limit', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    await addMessage(conv.id, createTestMessage('user', 'Message 1'));
    await addMessage(conv.id, createTestMessage('assistant', 'Response 1'));

    const messages = await getRecentMessages(conv.id, 10);

    expect(messages).toHaveLength(2);
  });

  it('should return limited messages when more than limit', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);

    // Add 10 messages
    for (let i = 0; i < 10; i++) {
      await addMessage(conv.id, createTestMessage('user', `Message ${i}`));
    }

    const messages = await getRecentMessages(conv.id, 5);

    expect(messages).toHaveLength(5);
    // Should return most recent messages
    expect(messages[4].content).toBe('Message 9');
  });

  it('should return empty array for non-existent conversation', async () => {
    const messages = await getRecentMessages('non-existent', 10);

    expect(messages).toEqual([]);
  });
});

// ============================================================================
// updateContext Tests
// ============================================================================

describe('updateContext', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should update context with new values', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();
    const initialContext = createTestContext({ projectId: 'proj-1' });

    const conv = await createConversation(userId, authority, initialContext);

    const newContext = createTestContext({ projectId: 'proj-2' });
    await updateContext(conv.id, newContext);

    const updated = await getConversation(conv.id);
    expect(updated?.context?.projectId).toBe('proj-2');
  });

  it('should add context to conversation without context', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    expect(conv.context).toBeUndefined();

    const newContext = createTestContext();
    await updateContext(conv.id, newContext);

    const updated = await getConversation(conv.id);
    expect(updated?.context).toBeDefined();
    expect(updated?.context?.projectId).toBe('proj-test-001');
  });

  it('should return undefined for non-existent conversation', async () => {
    const context = createTestContext();

    const result = await updateContext('non-existent', context);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// deleteConversation Tests
// ============================================================================

describe('deleteConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should delete existing conversation', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    expect(await getConversation(conv.id)).toBeDefined();

    const result = await deleteConversation(conv.id, userId);

    expect(result).toBe(true);
    expect(await getConversation(conv.id)).toBeUndefined();
  });

  it('should return false for non-existent conversation', async () => {
    const result = await deleteConversation('non-existent', 'user-001');

    expect(result).toBe(false);
  });

  it('should return false when userId does not match', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);

    // Try to delete with different user
    const result = await deleteConversation(conv.id, 'user-002');

    expect(result).toBe(false);
    expect(await getConversation(conv.id)).toBeDefined();
  });
});

// ============================================================================
// listConversations Tests
// ============================================================================

describe('listConversations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should return empty array for user with no conversations', async () => {
    const conversations = await listConversations('user-no-convs');

    expect(conversations).toEqual([]);
  });

  it('should return all conversations for user', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    await createConversation(userId, authority);
    await createConversation(userId, authority);
    await createConversation(userId, authority);

    const conversations = await listConversations(userId);

    expect(conversations).toHaveLength(3);
  });

  it('should return conversation metadata', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    await createConversation(userId, authority);

    const conversations = await listConversations(userId);

    expect(conversations).toHaveLength(1);
    // listConversations returns partial data: id, title, updatedAt, messageCount
    expect(conversations[0].id).toBeDefined();
    expect(conversations[0].updatedAt).toBeDefined();
    expect(conversations[0].messageCount).toBe(0);
  });

  it('should not return other users conversations', async () => {
    const authority = createTestAuthority();

    const conv1 = await createConversation('user-001', authority);
    const conv2 = await createConversation('user-002', authority);

    const user1Convs = await listConversations('user-001');
    const user2Convs = await listConversations('user-002');

    expect(user1Convs).toHaveLength(1);
    expect(user2Convs).toHaveLength(1);
    // Verify different IDs are returned
    expect(user1Convs[0].id).toBe(conv1.id);
    expect(user2Convs[0].id).toBe(conv2.id);
  });

  it('should respect limit parameter', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    for (let i = 0; i < 10; i++) {
      await createConversation(userId, authority);
    }

    const conversations = await listConversations(userId, 5);

    expect(conversations).toHaveLength(5);
  });
});

// ============================================================================
// getStoreStats Tests
// ============================================================================

describe('getStoreStats', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should return 0 for empty store', async () => {
    const stats = await getStoreStats();

    expect(stats.totalConversations).toBe(0);
  });

  it('should return correct count after creating conversations', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    await createConversation(userId, authority);
    await createConversation(userId, authority);
    await createConversation(userId, authority);

    const stats = await getStoreStats();

    expect(stats.totalConversations).toBe(3);
  });

  it('should update count after deletion', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv1 = await createConversation(userId, authority);
    await createConversation(userId, authority);

    expect((await getStoreStats()).totalConversations).toBe(2);

    await deleteConversation(conv1.id, userId);

    expect((await getStoreStats()).totalConversations).toBe(1);
  });
});

// ============================================================================
// isRedisAvailable Tests
// ============================================================================

describe('isRedisAvailable', () => {
  it('should return false when Redis disabled', () => {
    const available = isRedisAvailable();
    expect(available).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllConversations();
  });

  it('should handle concurrent conversation creation', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    // Create 10 conversations concurrently
    const promises = Array(10)
      .fill(null)
      .map(() => createConversation(userId, authority));
    const conversations = await Promise.all(promises);

    // All should have unique IDs
    const ids = conversations.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10);
  });

  it('should handle empty message content', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    await addMessage(conv.id, createTestMessage('user', ''));

    const updated = await getConversation(conv.id);
    expect(updated?.messages).toHaveLength(1);
    expect(updated?.messages[0].content).toBe('');
  });

  it('should handle special characters in messages', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    const specialMessage = 'Test with <script>alert("xss")</script> & "quotes"';
    await addMessage(conv.id, createTestMessage('user', specialMessage));

    const updated = await getConversation(conv.id);
    expect(updated?.messages[0].content).toBe(specialMessage);
  });

  it('should handle unicode in messages', async () => {
    const userId = 'user-001';
    const authority = createTestAuthority();

    const conv = await createConversation(userId, authority);
    const unicodeMessage = '你好世界 🌍 مرحبا';
    await addMessage(conv.id, createTestMessage('user', unicodeMessage));

    const updated = await getConversation(conv.id);
    expect(updated?.messages[0].content).toBe(unicodeMessage);
  });
});
