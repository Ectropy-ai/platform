/**
 * SEPPA Assistant Client Service
 *
 * Frontend client for the Claude-powered SEPPA assistant.
 * Handles communication with the assistant API endpoints for
 * PM decisions, voxel queries, and construction intelligence.
 *
 * @module services/seppa
 * @version 1.0.0
 */

import { apiClient } from '../apiClient';

// ============================================================================
// Types
// ============================================================================

/**
 * Authority levels in the PM Decision system (0-6)
 */
export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Authority level display names
 */
export const AUTHORITY_NAMES: Record<AuthorityLevel, string> = {
  0: 'Field Worker',
  1: 'Foreman',
  2: 'Superintendent',
  3: 'Project Manager',
  4: 'Construction Manager',
  5: 'Executive',
  6: 'Regulatory Authority',
};

/**
 * M6: Voxel context for spatial awareness in SEPPA conversations
 */
export interface VoxelContext {
  system?: string;
  status?: string;
  healthStatus?: string;
  percentComplete?: number;
  decisionCount?: number;
  alertCount?: number;
  toleranceOverrideCount?: number;
  center?: { x: number; y: number; z: number };
  level?: string;
  adjacentVoxels?: string[];
  activeAlerts?: Array<{ priority: string; message: string }>;
}

/**
 * Context about user's current state in the application
 */
export interface ChatContext {
  /** Active project ID */
  projectId?: string;
  /** Currently selected voxel ID */
  selectedVoxelId?: string;
  /** Currently viewed decision ID */
  activeDecisionId?: string;
  /** Current page/view in the application */
  currentView?: string;
  /** Any additional metadata */
  metadata?: {
    /** M6: Voxel details when a voxel is selected */
    voxelContext?: VoxelContext;
    [key: string]: unknown;
  };
}

/**
 * Request to send a message to the assistant
 */
export interface ChatRequest {
  message: string;
  conversationId?: string;
  context?: ChatContext;
  userAuthority: AuthorityLevel;
  userId: string;
  userName?: string;
}

/**
 * Result of a tool execution
 */
export interface ToolCallResult {
  toolName: string;
  input: unknown;
  output: unknown;
  success: boolean;
  error?: string;
  durationMs?: number;
}

/**
 * Assistant's response message
 */
export interface AssistantMessage {
  role: 'assistant';
  content: string;
  toolCalls?: ToolCallResult[];
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  model: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  processingTimeMs: number;
  toolCallCount: number;
}

/**
 * Response from the chat endpoint
 */
export interface ChatResponse {
  conversationId: string;
  message: AssistantMessage;
  suggestedActions?: string[];
  metadata?: ResponseMetadata;
}

/**
 * A message in a conversation
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallResult[];
  timestamp: string;
}

/**
 * A full conversation
 */
export interface Conversation {
  id: string;
  userId: string;
  userAuthority: AuthorityLevel;
  context?: ChatContext;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

/**
 * Conversation list item (summary)
 */
export interface ConversationSummary {
  id: string;
  title?: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Service status
 */
export interface ServiceStatus {
  status: 'operational' | 'not_configured' | 'error';
  model?: string;
  maxToolIterations?: number;
  toolCount?: number;
  message?: string;
  conversationStats?: {
    totalConversations: number;
    totalMessages: number;
  };
}

// ============================================================================
// Service Implementation
// ============================================================================

class SEPPAAssistantService {
  private baseURL = '/api/assistant';

  /**
   * Send a message to the assistant and get a response
   */
  async chat(request: ChatRequest): Promise<{
    success: boolean;
    data?: ChatResponse;
    error?: string;
  }> {
    try {
      const response = await apiClient.post<{ success: boolean; data: ChatResponse }>(
        `${this.baseURL}/chat`,
        request
      );

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Chat request failed',
      };
    } catch (error: unknown) {
      console.error('[SEPPA Client] Chat error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * List conversations for a user
   */
  async listConversations(
    userId: string,
    limit = 20
  ): Promise<{
    success: boolean;
    data?: ConversationSummary[];
    error?: string;
  }> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: ConversationSummary[];
        count: number;
      }>(`${this.baseURL}/conversations?userId=${encodeURIComponent(userId)}&limit=${limit}`);

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Failed to list conversations',
      };
    } catch (error: unknown) {
      console.error('[SEPPA Client] List conversations error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Get a specific conversation with all messages
   */
  async getConversation(
    conversationId: string,
    userId: string
  ): Promise<{
    success: boolean;
    data?: Conversation;
    error?: string;
  }> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Conversation }>(
        `${this.baseURL}/conversations/${conversationId}?userId=${encodeURIComponent(userId)}`
      );

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Failed to get conversation',
      };
    } catch (error: unknown) {
      console.error('[SEPPA Client] Get conversation error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(
    conversationId: string,
    userId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await apiClient.delete<{ success: boolean; message: string }>(
        `${this.baseURL}/conversations/${conversationId}?userId=${encodeURIComponent(userId)}`
      );

      return { success: response.success };
    } catch (error: unknown) {
      console.error('[SEPPA Client] Delete conversation error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    success: boolean;
    data?: ServiceStatus;
    error?: string;
  }> {
    try {
      const response = await apiClient.get<{ success: boolean; data: ServiceStatus }>(
        `${this.baseURL}/status`
      );

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Failed to get status',
      };
    } catch (error: unknown) {
      console.error('[SEPPA Client] Get status error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }
}

// ============================================================================
// Streaming Support
// ============================================================================

/**
 * SSE Event types from the streaming API
 */
export type StreamEventType =
  | 'start'
  | 'token'
  | 'tool_start'
  | 'tool_end'
  | 'complete'
  | 'error';

/**
 * Streaming event data
 */
export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
}

/**
 * Callbacks for streaming events
 */
export interface StreamCallbacks {
  onStart?: (conversationId: string) => void;
  onToken?: (token: string, accumulated: string) => void;
  onToolStart?: (toolName: string, input: unknown) => void;
  onToolEnd?: (toolName: string, result: ToolCallResult) => void;
  onComplete?: (response: ChatResponse) => void;
  onError?: (error: string) => void;
}

/**
 * Stream a chat response with real-time token updates
 */
export async function streamChatResponse(
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const url = '/api/assistant/chat';
  const body = { ...request, stream: true };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete event in buffer

      for (const block of lines) {
        if (!block.trim()) continue;

        // Parse event type and data
        let eventType: StreamEventType = 'token';
        let eventData: string = '';

        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim() as StreamEventType;
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (!eventData) continue;

        try {
          const parsed = JSON.parse(eventData);

          switch (eventType) {
            case 'start':
              callbacks.onStart?.(parsed.conversationId);
              break;

            case 'token':
              accumulatedContent += parsed.token || '';
              callbacks.onToken?.(parsed.token || '', accumulatedContent);
              break;

            case 'tool_start':
              callbacks.onToolStart?.(parsed.toolName, parsed.input);
              break;

            case 'tool_end':
              callbacks.onToolEnd?.(parsed.toolName, parsed.result);
              break;

            case 'complete':
              callbacks.onComplete?.(parsed);
              break;

            case 'error':
              callbacks.onError?.(parsed.error || 'Unknown streaming error');
              break;
          }
        } catch {
          // Skip malformed JSON
          console.warn('[SEPPA Stream] Failed to parse event:', eventData);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Request was cancelled - not an error
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Stream failed';
    callbacks.onError?.(errorMessage);
    console.error('[SEPPA Stream] Error:', error);
  }
}

// Export singleton instance
export const seppaClient = new SEPPAAssistantService();
export default seppaClient;
