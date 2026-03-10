/**
 * =============================================================================
 * ECTROPY SHARED TYPE DEFINITIONS
 *
 * PURPOSE: Central type definitions used across the entire Ectropy platform
 * SCOPE: User management, API responses, BIM data structures, DAO governance
 * DEPENDENCIES:
 * - Used by all apps and libraries in the workspace
 * - Core types for authentication, BIM processing, and governance
 * USAGE:
 * import { User, Project, Element } from '@ectropy/shared/types';
 * SECURITY: Type-safe interfaces prevent runtime errors and data corruption
 */

/**
 * Shared Types - Ectropy Platform
 * Central type definitions used across the platform
 * NOTE: Partially complete - being restored during refactor
 */

// Express.js types (can be integrated when Express is available)
interface BaseRequest {
  user?: User;
  sessionId?: string;
  correlationId?: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role: string; // Single role from StakeholderRole enum (matches Prisma schema)
  roles?: string[]; // Deprecated: Keep for backwards compatibility, use role instead
  createdAt: Date;
  updatedAt: Date;
  name?: string; // Additional property for compatibility
  permissions?: string[]; // Additional property for compatibility
  // OAuth-specific properties (optional, set during OAuth authentication)
  provider?: string; // OAuth provider name (e.g., 'google', 'github')
  organization?: string; // User's organization from OAuth profile
  expiresAt?: string; // Token expiration timestamp (ISO 8601)
  twoFactorEnabled?: boolean; // Whether 2FA is enabled for this account
  // User Management M1: Platform admin flag (cross-tenant access, @luh.tech auto-admin)
  is_platform_admin?: boolean; // Platform-level admin (cross-tenant), null for tenant-scoped users
  tenant_id?: string; // Multi-tenant: user's active tenant (null for platform admins)
}
export interface UserRole {
  userId: string;
  projectId: string;
  role: string;
  permissions: string[];
}

export interface UserSession {
  sessionToken: 'REDACTED';
  expiresAt: Date;
}

export interface AuthContext {
  user: User;
  roles: UserRole[];
  sessionId: string;
}

// Import Express type augmentation to ensure Request interface is extended
import './express.js';

// Re-export Express-specific types for convenience
export type {
  ProjectData,
  ProjectMembership,
  SpeckleStreamData,
} from './express.js';

// ENTERPRISE FIX: Export PermissionLevel from dedicated module (no circular dependency)
export {
  PermissionLevel,
  type PermissionLevelString,
} from './permission-level.js';

export interface GraphQLContext {
  roles?: UserRole[];
  permissions?: string[];
  isAuthenticated: boolean;
}

export interface ElementAccess {
  elementId: string;
  accessLevel: 'read' | 'write' | 'admin';
  hasAccess: boolean;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * PERFORMANCE & MONITORING TYPES
 */
export interface APIMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  timestamp: Date;
  userId?: string;
  userAgent?: string;
  ip?: string;
}

export interface DatabaseMetrics {
  query: string;
  duration: number;
  rows_affected?: number;
  connection_pool_active?: number;
  connection_pool_waiting?: number;
}

export interface SystemMetrics {
  cpu_usage: number;
  memory_usage: number;
  memory_total: number;
  active_connections: number;
  cache_hit_ratio: number;
}

export interface PerformanceProfile {
  operation: string;
  start_time: number;
  end_time: number;
  metadata?: Record<string, any>;
}
export interface MonitoringSettings {
  enabled: boolean;
  sample_rate: number;
  retention_days: number;
  alert_thresholds: {
    response_time_ms: number;
    error_rate_percent: number;
    cpu_usage_percent: number;
    memory_usage_percent: number;
  };
}

export interface PrometheusMetrics {
  http_requests_total: number;
  http_request_duration_seconds: number;
  database_queries_total: number;
  database_query_duration_seconds: number;
  active_sessions: number;
  cache_operations_total: number;
  system_memory_usage_bytes: number;
  system_cpu_usage_percent: number;
}

/**
 * AI AGENT TASK MANAGER TYPES
 * Represents a task that can be executed by AI agents
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  /** Type of AI agent that should execute this task */
  agentType: 'compliance' | 'performance' | 'procurement';
  /** Project identifier associated with the task */
  projectId: string;
  /** Current status of the task */
  status: TaskStatus;
  /** Priority level for task execution (higher numbers = higher priority) */
  priority: number;
  /** Input data required for task execution */
  inputData?: Record<string, unknown>;
  /** Output data produced by task execution */
  outputData?: Record<string, unknown>;
  /** Error message if task failed */
  errorMessage?: string;
  /** Timestamp when task was created */
  createdAt: Date;
  /** Timestamp when task execution started */
  startedAt?: Date;
  /** Timestamp when task execution completed */
  completedAt?: Date;
  /** Timestamp when task should be executed (null for immediate execution) */
  scheduledAt?: Date;
}

/**
 * Possible task status values
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Event data emitted during task lifecycle
 */
export interface TaskEvent {
  /** Unique identifier for the event */
  eventId: string;
  /** ID of the task this event relates to */
  taskId: string;
  /** Type of event that occurred */
  eventType: TaskEventType;
  /** Project identifier */
  projectId: string;
  /** Type of AI agent involved */
  agentType: string;
  /** Operation being performed when event occurred */
  operation?: string;
  /** Timestamp when event occurred */
  timestamp: Date;
  /** Current task status */
  taskStatus?: TaskStatus;
  /** Additional metadata about the event */
  metadata?: TaskEventMetadata;
  /** Result data if operation completed successfully */
  result?: Record<string, unknown>;
  /** Error information if operation failed */
  error?: TaskEventError;
}

/**
 * Types of events that can be emitted during task lifecycle
 */
export type TaskEventType =
  | 'task:created'
  | 'task:started'
  | 'task:progress'
  | 'task:completed'
  | 'task:failed'
  | 'task:retry'
  | 'manager:started'
  | 'manager:stopped'
  | 'agent:error';

/**
 * Metadata included with task events
 */
export interface TaskEventMetadata {
  /** Retry attempt number (for retry events) */
  retryAttempt?: number;
  /** Maximum number of retries allowed */
  maxRetries?: number;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Memory usage at time of event */
  memoryUsage?: number;
  /** CPU usage at time of event */
  cpuUsage?: number;
  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Error information included in task events
 */
export interface TaskEventError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Error stack trace */
  stack?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * AI AGENT TYPES - Performance Analysis
 */
export interface PredictionValue {
  /** The predicted value */
  value: number;
  /** Confidence level of the prediction (0-1) */
  confidence: number;
  /** Name of the prediction algorithm/method used */
  method: string;
}

/**
 * Agent error type that can be thrown as a class
 */
export class AgentError extends Error {
  code: string;
  agentType: string;
  operation: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    agentType: string,
    operation: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.agentType = agentType;
    this.operation = operation;
    this.details = details;
  }
}
