/**
 * Claude Assistant Service Types
 *
 * TypeScript interfaces for the LLM-powered assistant service.
 * Defines chat request/response formats, tool execution results,
 * and conversation management structures.
 *
 * @module assistant/types
 * @version 1.0.0
 */

/**
 * Authority levels in the PM Decision system.
 * Maps to the 7-tier authority cascade.
 */
export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Authority level names for display and system prompts.
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
 * Chat request from client to assistant service.
 */
export interface ChatRequest {
  /** The user's message */
  message: string;

  /** Existing conversation ID for multi-turn conversations */
  conversationId?: string;

  /** Optional context about current UI state */
  context?: ChatContext;

  /** User's authority level (0-6) */
  userAuthority: AuthorityLevel;

  /** User identifier */
  userId: string;

  /** User's display name */
  userName?: string;

  /** Enable Server-Sent Events (SSE) streaming */
  stream?: boolean;
}

/**
 * M6: Voxel context for spatial awareness in SEPPA conversations.
 * Populated when user has a voxel selected in ROSMROView.
 */
export interface VoxelContext {
  /** Voxel system (STRUCT, MECH, ELEC, etc.) */
  system?: string;
  /** Current status */
  status?: string;
  /** Health status (HEALTHY, AT_RISK, CRITICAL) */
  healthStatus?: string;
  /** Completion percentage */
  percentComplete?: number;
  /** Number of attached decisions */
  decisionCount?: number;
  /** Number of active alerts */
  alertCount?: number;
  /** Number of active tolerance overrides */
  toleranceOverrideCount?: number;
  /** Voxel center coordinates in mm */
  center?: { x: number; y: number; z: number };
  /** Building level */
  level?: string;
  /** Adjacent voxel IDs for spatial context */
  adjacentVoxels?: string[];
  /** Active alert summaries */
  activeAlerts?: Array<{ priority: string; message: string }>;
}

/**
 * Context about the user's current state in the application.
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
    /** Other arbitrary metadata */
    [key: string]: unknown;
  };
}

/**
 * Response from assistant service to client.
 */
export interface ChatResponse {
  /** Conversation ID (new or existing) */
  conversationId: string;

  /** The assistant's response message */
  message: AssistantMessage;

  /** Suggested follow-up actions */
  suggestedActions?: string[];

  /** Processing metadata */
  metadata?: ResponseMetadata;
}

/**
 * The assistant's message content.
 */
export interface AssistantMessage {
  /** Always 'assistant' for responses */
  role: 'assistant';

  /** Text content of the response */
  content: string;

  /** Tools that were called during this response */
  toolCalls?: ToolCallResult[];
}

/**
 * Result of a single tool execution.
 */
export interface ToolCallResult {
  /** Name of the tool that was called */
  toolName: string;

  /** Input parameters passed to the tool */
  input: unknown;

  /** Output returned by the tool */
  output: unknown;

  /** Whether the tool execution succeeded */
  success: boolean;

  /** Error message if execution failed */
  error?: string;

  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Metadata about the response generation.
 */
export interface ResponseMetadata {
  /** Model used for generation */
  model: string;

  /** Total tokens used (input + output) */
  totalTokens?: number;

  /** Input tokens */
  inputTokens?: number;

  /** Output tokens */
  outputTokens?: number;

  /** Total processing time in milliseconds */
  processingTimeMs: number;

  /** Number of tool calls made */
  toolCallCount: number;
}

/**
 * A single message in a conversation.
 */
export interface ConversationMessage {
  /** Message role */
  role: 'user' | 'assistant';

  /** Message content */
  content: string;

  /** Tool calls (for assistant messages) */
  toolCalls?: ToolCallResult[];

  /** When the message was created */
  timestamp: string;
}

/**
 * A conversation session.
 */
export interface Conversation {
  /** Unique conversation ID */
  id: string;

  /** User who owns this conversation */
  userId: string;

  /** User's authority level */
  userAuthority: AuthorityLevel;

  /** Conversation context */
  context?: ChatContext;

  /** Messages in the conversation */
  messages: ConversationMessage[];

  /** When the conversation was created */
  createdAt: string;

  /** When the conversation was last updated */
  updatedAt: string;

  /** Optional title (generated from first message) */
  title?: string;
}

/**
 * Tool definition in Claude's format.
 */
export interface ClaudeTool {
  /** Tool name (must match executor) */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for input parameters */
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool executor function signature.
 */
export type ToolExecutor = (
  _input: Record<string, unknown>,
  _context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

/**
 * Context passed to tool executors.
 */
export interface ToolExecutionContext {
  /** User ID making the request */
  userId: string;

  /** User's authority level */
  userAuthority: AuthorityLevel;

  /** Active project ID */
  projectId?: string;

  /** Conversation ID */
  conversationId: string;
}

/**
 * Result from a tool executor.
 */
export interface ToolExecutionResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Result data (on success) */
  data?: unknown;

  /** Error message (on failure) */
  error?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for the assistant service.
 */
export interface AssistantConfig {
  /** Anthropic API key */
  apiKey: string;

  /** Model to use for chat */
  model: string;

  /** Maximum tokens for response */
  maxTokens: number;

  /** Maximum conversation history to include */
  maxHistoryMessages: number;

  /** Maximum tool iterations per request */
  maxToolIterations: number;

  /** Request timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_ASSISTANT_CONFIG: Omit<AssistantConfig, 'apiKey'> = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  maxHistoryMessages: 20,
  maxToolIterations: 10,
  timeoutMs: 30000,
};

/**
 * Server-Sent Event types for streaming responses.
 */
export type SSEEventType =
  | 'start'
  | 'content'
  | 'tool_start'
  | 'tool_end'
  | 'done'
  | 'error';

/**
 * SSE event structure.
 */
export interface SSEEvent {
  /** Event type */
  type: SSEEventType;

  /** Event data */
  data?: unknown;
}

/**
 * Start event data.
 */
export interface SSEStartEvent extends SSEEvent {
  type: 'start';
  data: {
    conversationId: string;
    model: string;
  };
}

/**
 * Content event data (streaming text).
 */
export interface SSEContentEvent extends SSEEvent {
  type: 'content';
  data: {
    delta: string;
  };
}

/**
 * Tool start event data.
 */
export interface SSEToolStartEvent extends SSEEvent {
  type: 'tool_start';
  data: {
    toolName: string;
    input: unknown;
  };
}

/**
 * Tool end event data.
 */
export interface SSEToolEndEvent extends SSEEvent {
  type: 'tool_end';
  data: {
    toolName: string;
    output: unknown;
    success: boolean;
    error?: string;
    durationMs: number;
  };
}

/**
 * Done event data.
 */
export interface SSEDoneEvent extends SSEEvent {
  type: 'done';
  data: {
    conversationId: string;
    metadata: ResponseMetadata;
    suggestedActions?: string[];
  };
}

/**
 * Error event data.
 */
export interface SSEErrorEvent extends SSEEvent {
  type: 'error';
  data: {
    error: string;
    message?: string;
  };
}
