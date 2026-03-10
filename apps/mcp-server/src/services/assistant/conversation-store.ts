/**
 * Conversation Store
 *
 * In-memory storage for conversation history.
 * Maintains conversation state across multiple turns.
 *
 * Note: This is a simple in-memory implementation for MVP.
 * Production should use Redis or PostgreSQL for persistence.
 *
 * @module assistant/conversation-store
 * @version 1.0.0
 */

import type {
  Conversation,
  ConversationMessage,
  ChatContext,
  AuthorityLevel,
} from './types.js';

/**
 * In-memory conversation storage.
 */
const conversations = new Map<string, Conversation>();

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
  // Take first 50 chars, cut at word boundary
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
 * Create a new conversation.
 *
 * @param userId - User who owns the conversation
 * @param userAuthority - User's authority level
 * @param context - Optional initial context
 * @returns New conversation
 */
export function createConversation(
  userId: string,
  userAuthority: AuthorityLevel,
  context?: ChatContext
): Conversation {
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

  conversations.set(conversation.id, conversation);
  return conversation;
}

/**
 * Get a conversation by ID.
 *
 * @param conversationId - Conversation ID
 * @returns Conversation or undefined if not found
 */
export function getConversation(
  conversationId: string
): Conversation | undefined {
  return conversations.get(conversationId);
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
export function getOrCreateConversation(
  conversationId: string | undefined,
  userId: string,
  userAuthority: AuthorityLevel,
  context?: ChatContext
): Conversation {
  if (conversationId) {
    const existing = conversations.get(conversationId);
    if (existing && existing.userId === userId) {
      // Update context if provided
      if (context) {
        existing.context = { ...existing.context, ...context };
      }
      return existing;
    }
  }

  return createConversation(userId, userAuthority, context);
}

/**
 * Add a message to a conversation.
 *
 * @param conversationId - Conversation ID
 * @param message - Message to add
 * @returns Updated conversation or undefined if not found
 */
export function addMessage(
  conversationId: string,
  message: ConversationMessage
): Conversation | undefined {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    return undefined;
  }

  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();

  // Set title from first user message
  if (!conversation.title && message.role === 'user') {
    conversation.title = generateTitle(message.content);
  }

  return conversation;
}

/**
 * Get recent messages from a conversation.
 *
 * @param conversationId - Conversation ID
 * @param maxMessages - Maximum number of messages to return
 * @returns Array of messages (most recent last)
 */
export function getRecentMessages(
  conversationId: string,
  maxMessages: number
): ConversationMessage[] {
  const conversation = conversations.get(conversationId);
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
export function listConversations(
  userId: string,
  limit = 20
): Array<{
  id: string;
  title?: string;
  updatedAt: string;
  messageCount: number;
}> {
  const userConversations = Array.from(conversations.values())
    .filter((c) => c.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, limit);

  return userConversations.map((c) => ({
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
export function deleteConversation(
  conversationId: string,
  userId: string
): boolean {
  const conversation = conversations.get(conversationId);
  if (!conversation || conversation.userId !== userId) {
    return false;
  }

  conversations.delete(conversationId);
  return true;
}

/**
 * Update conversation context.
 *
 * @param conversationId - Conversation ID
 * @param context - New context to merge
 * @returns Updated conversation or undefined
 */
export function updateContext(
  conversationId: string,
  context: Partial<ChatContext>
): Conversation | undefined {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    return undefined;
  }

  conversation.context = { ...conversation.context, ...context };
  conversation.updatedAt = new Date().toISOString();
  return conversation;
}

/**
 * Get statistics about the conversation store.
 */
export function getStoreStats(): {
  totalConversations: number;
  totalMessages: number;
  oldestConversation?: string;
  newestConversation?: string;
} {
  const convList = Array.from(conversations.values());
  const totalMessages = convList.reduce((sum, c) => sum + c.messages.length, 0);

  const sorted = convList.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return {
    totalConversations: convList.length,
    totalMessages,
    oldestConversation: sorted[0]?.createdAt,
    newestConversation: sorted[sorted.length - 1]?.createdAt,
  };
}

/**
 * Clear all conversations (for testing).
 */
export function clearAllConversations(): void {
  conversations.clear();
}

/**
 * Prune old conversations to manage memory.
 *
 * @param maxAge - Maximum age in milliseconds
 * @param maxCount - Maximum number of conversations to keep
 * @returns Number of conversations pruned
 */
export function pruneConversations(maxAge: number, maxCount: number): number {
  const now = Date.now();
  let pruned = 0;

  // First, remove old conversations
  for (const [id, conv] of conversations) {
    const age = now - new Date(conv.updatedAt).getTime();
    if (age > maxAge) {
      conversations.delete(id);
      pruned++;
    }
  }

  // Then, if still over limit, remove oldest
  if (conversations.size > maxCount) {
    const sorted = Array.from(conversations.entries()).sort(
      ([, a], [, b]) =>
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );

    const toRemove = sorted.slice(0, conversations.size - maxCount);
    for (const [id] of toRemove) {
      conversations.delete(id);
      pruned++;
    }
  }

  return pruned;
}
