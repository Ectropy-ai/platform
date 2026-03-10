/**
 * Context Builder
 *
 * Builds conversation context from various sources including
 * current UI state, project data, and conversation history.
 *
 * @module assistant/context-builder
 * @version 1.0.0
 */

import type { ChatContext, ConversationMessage } from './types.js';
import type { ClaudeMessage } from './claude-client.js';

/**
 * Convert conversation messages to Claude API format.
 *
 * @param messages - Conversation messages
 * @param maxMessages - Maximum number of messages to include
 * @returns Messages in Claude format
 */
export function buildMessageHistory(
  messages: ConversationMessage[],
  maxMessages: number
): ClaudeMessage[] {
  // Take most recent messages, respecting the limit
  const recentMessages = messages.slice(-maxMessages);

  return recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Build a context summary string for inclusion in messages.
 *
 * @param context - Chat context
 * @returns Human-readable context summary
 */
export function buildContextSummary(context?: ChatContext): string | null {
  if (!context) {
    return null;
  }

  const parts: string[] = [];

  if (context.projectId) {
    parts.push(`Project: ${context.projectId}`);
  }

  if (context.selectedVoxelId) {
    parts.push(`Selected voxel: ${context.selectedVoxelId}`);
  }

  // M6: Enhanced voxel context
  if (context.metadata?.voxelContext) {
    const vc = context.metadata.voxelContext;
    if (vc.status) {
      parts.push(`Voxel status: ${vc.status}`);
    }
    if (vc.healthStatus) {
      parts.push(`Voxel health: ${vc.healthStatus}`);
    }
    if (typeof vc.decisionCount === 'number') {
      parts.push(`Attached decisions: ${vc.decisionCount}`);
    }
    if (typeof vc.alertCount === 'number' && vc.alertCount > 0) {
      parts.push(`Active alerts: ${vc.alertCount}`);
    }
  }

  if (context.activeDecisionId) {
    parts.push(`Viewing decision: ${context.activeDecisionId}`);
  }

  if (context.currentView) {
    parts.push(`Current view: ${context.currentView}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `[Context: ${parts.join(' | ')}]`;
}

/**
 * Enrich a user message with context information.
 *
 * @param message - Original user message
 * @param context - Chat context
 * @returns Enriched message (or original if no relevant context)
 */
export function enrichUserMessage(
  message: string,
  context?: ChatContext
): string {
  const contextSummary = buildContextSummary(context);

  if (!contextSummary) {
    return message;
  }

  // Only add context if it seems relevant to the message
  const contextKeywords = [
    'project',
    'voxel',
    'decision',
    'this',
    'here',
    'current',
  ];
  const messageWords = message.toLowerCase().split(/\s+/);
  const hasContextReference = contextKeywords.some((k) =>
    messageWords.some((w) => w.includes(k))
  );

  if (hasContextReference) {
    return `${contextSummary}\n\n${message}`;
  }

  return message;
}

/**
 * Extract potential context updates from an assistant response.
 *
 * @param response - Assistant response text
 * @param toolResults - Results from tool executions
 * @returns Potential context updates
 */
export function extractContextUpdates(
  response: string,
  toolResults?: Array<{ toolName: string; output: unknown }>
): Partial<ChatContext> | null {
  if (!toolResults || toolResults.length === 0) {
    return null;
  }

  const updates: Partial<ChatContext> = {};

  for (const result of toolResults) {
    const output = result.output as Record<string, unknown> | null;
    if (!output) {
      continue;
    }

    // Extract project ID from tool results
    if ('projectId' in output && typeof output.projectId === 'string') {
      updates.projectId = output.projectId;
    }

    // Extract decision ID from decision-related tools
    if (result.toolName.includes('decision')) {
      if ('decisionId' in output && typeof output.decisionId === 'string') {
        updates.activeDecisionId = output.decisionId;
      }
    }

    // Extract voxel ID from voxel-related tools
    if (result.toolName.includes('voxel')) {
      if ('voxelId' in output && typeof output.voxelId === 'string') {
        updates.selectedVoxelId = output.voxelId;
      }
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

/**
 * Merge context updates into existing context.
 *
 * @param existing - Existing context
 * @param updates - Updates to apply
 * @returns Merged context
 */
export function mergeContext(
  existing: ChatContext | undefined,
  updates: Partial<ChatContext>
): ChatContext {
  return {
    ...existing,
    ...updates,
    metadata: {
      ...existing?.metadata,
      ...updates.metadata,
    },
  };
}

/**
 * Validate that context references are still valid.
 *
 * This would typically check against the data store,
 * but for MVP we do basic validation.
 *
 * @param context - Context to validate
 * @returns Validated context (with invalid references removed)
 */
export function validateContext(context: ChatContext): ChatContext {
  const validated: ChatContext = { ...context };

  // Basic ID format validation
  if (validated.projectId && !/^[a-zA-Z0-9_-]+$/.test(validated.projectId)) {
    delete validated.projectId;
  }

  if (
    validated.selectedVoxelId &&
    !/^VOX-[A-Z0-9-]+$/i.test(validated.selectedVoxelId)
  ) {
    delete validated.selectedVoxelId;
  }

  if (
    validated.activeDecisionId &&
    !/^DEC-\d{4}-\d{4}$/.test(validated.activeDecisionId)
  ) {
    delete validated.activeDecisionId;
  }

  return validated;
}

/**
 * Calculate how many tokens the context might use.
 *
 * This is a rough estimate for context window management.
 *
 * @param messages - Messages to estimate
 * @returns Estimated token count
 */
export function estimateTokens(messages: ClaudeMessage[]): number {
  // Rough estimate: ~4 characters per token
  const totalChars = messages.reduce((sum, m) => {
    const content =
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + content.length;
  }, 0);

  return Math.ceil(totalChars / 4);
}

/**
 * Trim messages to fit within a token budget.
 *
 * @param messages - Messages to trim
 * @param maxTokens - Maximum token budget
 * @returns Trimmed messages (keeping most recent)
 */
export function trimToTokenBudget(
  messages: ClaudeMessage[],
  maxTokens: number
): ClaudeMessage[] {
  let currentTokens = estimateTokens(messages);

  if (currentTokens <= maxTokens) {
    return messages;
  }

  // Remove oldest messages until under budget
  const trimmed = [...messages];
  while (trimmed.length > 1 && currentTokens > maxTokens) {
    trimmed.shift();
    currentTokens = estimateTokens(trimmed);
  }

  return trimmed;
}
