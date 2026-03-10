/**
 * Redis-Backed Conversation Store
 *
 * Production-grade conversation persistence using Redis with in-memory fallback.
 * Implements graceful degradation when Redis is unavailable.
 *
 * @module assistant/conversation-store-redis
 * @version 1.0.0
 */

import type {
  Conversation,
  ConversationMessage,
  ChatContext,
  AuthorityLevel,
} from './types.js';
import { redisClient, redisGet, redisSet, redisDel } from '../../cache/redis.js';

/**
 * Redis key prefixes for conversation data.
 */
const REDIS_PREFIX = 'seppa:conv:';
const REDIS_INDEX_PREFIX = 'seppa:conv:index:';
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * In-memory fallback storage (used when Redis unavailable).
 */
const memoryConversations = new Map<string, Conversation>();
let redisAvailable = false;

/**
 * Initialize Redis connection for conversation store.
 * Gracefully falls back to in-memory if Redis unavailable.
 */
export async function initializeConversationStore(): Promise<void> {
  if (!redisClient) {
    console.log('[ConversationStore] Redis disabled, using in-memory storage');
    redisAvailable = false;
    return;
  }

  try {
    await redisClient.connect();
    redisAvailable = true;
    console.log('[ConversationStore] Redis connection established');
  } catch (error) {
    console.warn('[ConversationStore] Redis unavailable, using in-memory fallback');
    redisAvailable = false;
  }
}

/**
 * Generate a unique conversation ID.
 */
function generateConversationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `conv-${timestamp}-${random}`;
}

/**
 * Generate a title from the first user message.
 */
function generateTitle(message: string): string {
  const maxLength = 50;
  if (message.length <= maxLength) {
    return message;
  }

  const truncated = message.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 20
    ? `${truncated.substring(0, lastSpace)}...`
    : `${truncated}...`;
}

/**
 * Get Redis key for a conversation.
 */
function getConversationKey(conversationId: string): string {
  return `${REDIS_PREFIX}${conversationId}`;
}

/**
 * Get Redis key for user conversation index.
 */
function getUserIndexKey(userId: string): string {
  return `${REDIS_INDEX_PREFIX}${userId}`;
}

/**
 * Create a new conversation.
 *
 * @param userId - User who owns the conversation
 * @param userAuthority - User's authority level
 * @param context - Optional initial context
 * @returns New conversation
 */
export async function createConversation(
  userId: string,
  userAuthority: AuthorityLevel,
  context?: ChatContext
): Promise<Conversation> {
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: generateConversationId(),
    userId,
    userAuthority,
    context,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  // Store in Redis with TTL
  if (redisAvailable) {
    try {
      const key = getConversationKey(conversation.id);
      await redisSet(key, conversation, REDIS_TTL_SECONDS);

      // Add to user's conversation index
      const indexKey = getUserIndexKey(userId);
      if (redisClient) {
        await redisClient.zadd(
          indexKey,
          Date.now(),
          conversation.id
        );
        await redisClient.expire(indexKey, REDIS_TTL_SECONDS);
      }

      console.log(`[ConversationStore] Created conversation ${conversation.id} in Redis`);
    } catch (error) {
      console.warn('[ConversationStore] Redis write failed, using memory fallback');
      memoryConversations.set(conversation.id, conversation);
    }
  } else {
    // In-memory fallback
    memoryConversations.set(conversation.id, conversation);
  }

  return conversation;
}

/**
 * Get a conversation by ID.
 *
 * @param conversationId - Conversation ID
 * @returns Conversation or undefined if not found
 */
export async function getConversation(
  conversationId: string
): Promise<Conversation | undefined> {
  // Try Redis first
  if (redisAvailable) {
    try {
      const key = getConversationKey(conversationId);
      const conversation = await redisGet<Conversation>(key);
      if (conversation) {
        return conversation;
      }
    } catch (error) {
      console.warn('[ConversationStore] Redis read failed, checking memory');
    }
  }

  // Fallback to memory
  return memoryConversations.get(conversationId);
}

/**
 * Get or create a conversation.
 *
 * @param conversationId - Optional existing conversation ID
 * @param userId - User ID
 * @param userAuthority - User's authority level
 * @param context - Optional context
 * @returns Existing or new conversation
 */
export async function getOrCreateConversation(
  conversationId: string | undefined,
  userId: string,
  userAuthority: AuthorityLevel,
  context?: ChatContext
): Promise<Conversation> {
  if (conversationId) {
    const existing = await getConversation(conversationId);
    if (existing && existing.userId === userId) {
      // Update context if provided
      if (context) {
        existing.context = { ...existing.context, ...context };
        await updateConversationInStore(existing);
      }
      return existing;
    }
  }

  return createConversation(userId, userAuthority, context);
}

/**
 * Update conversation in storage (Redis + memory fallback).
 */
async function updateConversationInStore(conversation: Conversation): Promise<void> {
  if (redisAvailable) {
    try {
      const key = getConversationKey(conversation.id);
      await redisSet(key, conversation, REDIS_TTL_SECONDS);
    } catch (error) {
      console.warn('[ConversationStore] Redis update failed, using memory');
      memoryConversations.set(conversation.id, conversation);
    }
  } else {
    memoryConversations.set(conversation.id, conversation);
  }
}

/**
 * Add a message to a conversation.
 *
 * @param conversationId - Conversation ID
 * @param message - Message to add
 * @returns Updated conversation or undefined if not found
 */
export async function addMessage(
  conversationId: string,
  message: ConversationMessage
): Promise<Conversation | undefined> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return undefined;
  }

  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();

  // Set title from first user message
  if (!conversation.title && message.role === 'user') {
    conversation.title = generateTitle(message.content);
  }

  await updateConversationInStore(conversation);
  return conversation;
}

/**
 * Get recent messages from a conversation.
 *
 * @param conversationId - Conversation ID
 * @param maxMessages - Maximum number of messages to return
 * @returns Array of messages (most recent last)
 */
export async function getRecentMessages(
  conversationId: string,
  maxMessages: number
): Promise<ConversationMessage[]> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return [];
  }

  if (conversation.messages.length <= maxMessages) {
    return [...conversation.messages];
  }

  return conversation.messages.slice(-maxMessages);
}

/**
 * List conversations for a user.
 *
 * @param userId - User ID
 * @param limit - Maximum number of conversations to return
 * @returns Array of conversations (most recent first)
 */
export async function listConversations(
  userId: string,
  limit = 20
): Promise<
  Array<{
    id: string;
    title?: string;
    updatedAt: string;
    messageCount: number;
  }>
> {
  const conversations: Conversation[] = [];

  // Try Redis first
  if (redisAvailable && redisClient) {
    try {
      const indexKey = getUserIndexKey(userId);
      // Get conversation IDs sorted by timestamp (most recent first)
      const conversationIds = await redisClient.zrevrange(indexKey, 0, limit - 1);

      for (const id of conversationIds) {
        const conv = await getConversation(id);
        if (conv) {
          conversations.push(conv);
        }
      }
    } catch (error) {
      console.warn('[ConversationStore] Redis list failed, using memory');
    }
  }

  // Fallback to memory if Redis failed or unavailable
  if (conversations.length === 0) {
    const memoryConvs = Array.from(memoryConversations.values())
      .filter((c) => c.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, limit);

    conversations.push(...memoryConvs);
  }

  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
  }));
}

/**
 * Delete a conversation.
 *
 * @param conversationId - Conversation ID
 * @param userId - User ID (for ownership verification)
 * @returns True if deleted, false if not found or unauthorized
 */
export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.userId !== userId) {
    return false;
  }

  // Delete from Redis
  if (redisAvailable) {
    try {
      const key = getConversationKey(conversationId);
      await redisDel(key);

      // Remove from user index
      const indexKey = getUserIndexKey(userId);
      if (redisClient) {
        await redisClient.zrem(indexKey, conversationId);
      }
    } catch (error) {
      console.warn('[ConversationStore] Redis delete failed');
    }
  }

  // Delete from memory
  memoryConversations.delete(conversationId);
  return true;
}

/**
 * Update conversation context.
 *
 * @param conversationId - Conversation ID
 * @param context - New context to merge
 * @returns Updated conversation or undefined
 */
export async function updateContext(
  conversationId: string,
  context: Partial<ChatContext>
): Promise<Conversation | undefined> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return undefined;
  }

  conversation.context = { ...conversation.context, ...context };
  conversation.updatedAt = new Date().toISOString();

  await updateConversationInStore(conversation);
  return conversation;
}

/**
 * Get statistics about the conversation store.
 */
export async function getStoreStats(): Promise<{
  totalConversations: number;
  totalMessages: number;
  oldestConversation?: string;
  newestConversation?: string;
  storageMode: 'redis' | 'memory' | 'hybrid';
}> {
  let redisConvCount = 0;
  const memoryConvCount = memoryConversations.size;

  if (redisAvailable && redisClient) {
    try {
      const keys = await redisClient.keys(`${REDIS_PREFIX}*`);
      redisConvCount = keys.length;
    } catch (error) {
      console.warn('[ConversationStore] Failed to get Redis stats');
    }
  }

  const totalConversations = Math.max(redisConvCount, memoryConvCount);
  const storageMode: 'redis' | 'memory' | 'hybrid' =
    redisConvCount > 0 && memoryConvCount > 0
      ? 'hybrid'
      : redisConvCount > 0
        ? 'redis'
        : 'memory';

  // Get total messages from memory (approximate)
  const memoryMessages = Array.from(memoryConversations.values()).reduce(
    (sum, c) => sum + c.messages.length,
    0
  );

  const sorted = Array.from(memoryConversations.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return {
    totalConversations,
    totalMessages: memoryMessages,
    oldestConversation: sorted[0]?.createdAt,
    newestConversation: sorted[sorted.length - 1]?.createdAt,
    storageMode,
  };
}

/**
 * Clear all conversations (for testing).
 */
export async function clearAllConversations(): Promise<void> {
  // Clear Redis
  if (redisAvailable && redisClient) {
    try {
      const keys = await redisClient.keys(`${REDIS_PREFIX}*`);
      const indexKeys = await redisClient.keys(`${REDIS_INDEX_PREFIX}*`);
      const allKeys = [...keys, ...indexKeys];

      if (allKeys.length > 0) {
        await redisClient.del(...allKeys);
      }
    } catch (error) {
      console.warn('[ConversationStore] Failed to clear Redis');
    }
  }

  // Clear memory
  memoryConversations.clear();
}

/**
 * Prune old conversations to manage storage.
 *
 * @param maxAge - Maximum age in milliseconds
 * @param maxCount - Maximum number of conversations to keep
 * @returns Number of conversations pruned
 */
export async function pruneConversations(
  maxAge: number,
  maxCount: number
): Promise<number> {
  const now = Date.now();
  let pruned = 0;

  // Prune memory conversations
  for (const [id, conv] of memoryConversations) {
    const age = now - new Date(conv.updatedAt).getTime();
    if (age > maxAge) {
      memoryConversations.delete(id);
      pruned++;
    }
  }

  // If still over limit in memory, remove oldest
  if (memoryConversations.size > maxCount) {
    const sorted = Array.from(memoryConversations.entries()).sort(
      ([, a], [, b]) =>
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );

    const toRemove = sorted.slice(0, memoryConversations.size - maxCount);
    for (const [id] of toRemove) {
      memoryConversations.delete(id);
      pruned++;
    }
  }

  // Note: Redis entries will auto-expire based on TTL
  console.log(`[ConversationStore] Pruned ${pruned} old conversations`);
  return pruned;
}

/**
 * Check if Redis is available.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}
