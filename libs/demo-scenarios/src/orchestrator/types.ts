/**
 * Demo Orchestrator Types
 *
 * Core type definitions for the multi-demo flow architecture.
 *
 * @module @ectropy/demo-scenarios/orchestrator/types
 */

import type { ScenarioId } from '../scenarios/index.js';
import type { TimelinePosition } from '../types/index.js';

// ============================================================================
// DEMO INSTANCE TYPES
// ============================================================================

/**
 * Unique identifier for a demo instance
 */
export type DemoInstanceId = string;

/**
 * Demo instance lifecycle states
 */
export type DemoInstanceState =
  | 'initializing'  // Being created, data generation in progress
  | 'ready'         // Fully initialized, waiting for playback
  | 'playing'       // Active playback in progress
  | 'paused'        // Playback paused
  | 'completed'     // Scenario timeline completed
  | 'error'         // Instance encountered error
  | 'cleaning_up'   // Being destroyed, cleanup in progress
  | 'destroyed';    // Fully cleaned up

/**
 * Demo instance representing an active demo session
 */
export interface DemoInstance {
  /** Unique instance identifier */
  id: DemoInstanceId;

  /** Source scenario ID */
  scenarioId: ScenarioId;

  /** Current lifecycle state */
  state: DemoInstanceState;

  /** User/tenant who created the instance */
  ownerId: string;

  /** Associated project ID in database */
  projectId: string;

  /** Instance creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  /** Current playback position */
  currentPosition: TimelinePosition;

  /** Playback speed multiplier (1x, 2x, etc.) */
  playbackSpeed: number;

  /** Generated records summary */
  recordCounts: {
    users: number;
    projects: number;
    voxels: number;
    decisions: number;
    alerts: number;
    activities: number;
  };

  /** Instance metadata */
  metadata: Record<string, unknown>;

  /** Error information if state is 'error' */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Demo flow configuration for orchestrator
 */
export interface DemoFlowConfig {
  /** Maximum concurrent demo instances per user */
  maxInstancesPerUser: number;

  /** Maximum concurrent demo instances globally */
  maxGlobalInstances: number;

  /** Auto-cleanup timeout for idle instances (ms) */
  idleTimeoutMs: number;

  /** Maximum playback speed allowed */
  maxPlaybackSpeed: number;

  /** Enable real-time sync via WebSocket */
  enableRealtimeSync: boolean;

  /** Persist demo data to database */
  persistToDatabase: boolean;

  /** Database connection pool */
  dbPool?: unknown;

  /** Redis client for state sync */
  redis?: unknown;

  /** Logger instance */
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
    debug: (msg: string, meta?: unknown) => void;
  };
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Demo lifecycle events emitted by orchestrator
 */
export type DemoLifecycleEvent =
  | { type: 'instance_created'; instanceId: DemoInstanceId; scenarioId: ScenarioId }
  | { type: 'instance_ready'; instanceId: DemoInstanceId; recordCounts: DemoInstance['recordCounts'] }
  | { type: 'instance_started'; instanceId: DemoInstanceId }
  | { type: 'instance_paused'; instanceId: DemoInstanceId; position: TimelinePosition }
  | { type: 'instance_resumed'; instanceId: DemoInstanceId }
  | { type: 'instance_completed'; instanceId: DemoInstanceId }
  | { type: 'instance_error'; instanceId: DemoInstanceId; error: string }
  | { type: 'instance_destroyed'; instanceId: DemoInstanceId };

/**
 * Real-time sync events for WebSocket broadcast
 */
export type DemoSyncEvent =
  | { type: 'voxel_update'; instanceId: DemoInstanceId; voxelId: string; status: string; health: string }
  | { type: 'decision_update'; instanceId: DemoInstanceId; decisionId: string; status: string }
  | { type: 'activity_added'; instanceId: DemoInstanceId; activity: unknown }
  | { type: 'position_update'; instanceId: DemoInstanceId; position: TimelinePosition }
  | { type: 'milestone_reached'; instanceId: DemoInstanceId; milestoneId: string };

// ============================================================================
// PROVIDER TYPES
// ============================================================================

/**
 * Entity type for data providers
 */
export type EntityType =
  | 'user'
  | 'project'
  | 'voxel'
  | 'decision'
  | 'inspection'
  | 'alert'
  | 'activity';

/**
 * Data provider result for batch operations
 */
export interface DataProviderResult {
  entityType: EntityType;
  count: number;
  ids: string[];
  errors: string[];
}
