/**
 * Playback Event Executor Service
 *
 * ENTERPRISE DATA LAYER (Sprint 5 - 2026-01-24)
 *
 * Bridges demo-scenarios playback events to live data updates:
 * - Listens to PlaybackController events
 * - Updates voxel statuses in PostgreSQL
 * - Creates VoxelActivity records for audit trail
 * - Broadcasts updates via WebSocket for real-time UI
 *
 * This service makes demo playback "live" - voxels actually change status
 * as the timeline advances, and all connected viewers see updates in real-time.
 *
 * @module services/playback-event-executor
 */

import type { Pool, PoolClient } from 'pg';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import {
  getVoxelStreamHandler,
  type VoxelUpdateEvent,
  type ActivityEvent,
} from '../websocket/voxel-stream.js';
import type {
  PlaybackController,
  PlaybackUpdate,
} from '@ectropy/demo-scenarios';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Event data shape (extracted from PlaybackUpdate.data)
 */
interface PlaybackEventData {
  id: string;
  type: string;
  persona: string;
  description: string;
  position: { week: number; day: number; hour: number };
  consequences?: Array<{
    type: string;
    target?: string;
    status?: string;
    delay?: number;
  }>;
}

/**
 * Milestone data shape (extracted from PlaybackUpdate.data)
 */
interface PlaybackMilestoneData {
  id: string;
  name: string;
  description: string;
  position: { week: number; day: number; hour: number };
}

/**
 * Voxel status update result
 */
interface StatusUpdateResult {
  voxelId: string;
  previousStatus: string;
  newStatus: string;
  success: boolean;
  error?: string;
}

/**
 * Executor configuration
 */
export interface PlaybackEventExecutorConfig {
  projectId: string;
  instanceId: string;
  enableDatabaseUpdates?: boolean;
  enableWebSocketBroadcast?: boolean;
  enableActivityLogging?: boolean;
}

// ============================================================================
// STATUS MAPPINGS
// ============================================================================

/**
 * Map event types to voxel status changes
 */
const EVENT_STATUS_MAP: Record<string, string> = {
  // Positive progress events
  'work_started': 'IN_PROGRESS',
  'installation_begun': 'IN_PROGRESS',
  'construction_started': 'IN_PROGRESS',
  'rough_in_started': 'IN_PROGRESS',

  // Completion events
  'work_completed': 'COMPLETE',
  'installation_complete': 'COMPLETE',
  'inspection_passed': 'COMPLETE',
  'final_approved': 'COMPLETE',

  // Blocking events
  'issue_detected': 'BLOCKED',
  'rfi_submitted': 'BLOCKED',
  'inspection_failed': 'BLOCKED',
  'coordination_conflict': 'BLOCKED',

  // Hold events
  'material_delay': 'ON_HOLD',
  'weather_delay': 'ON_HOLD',
  'pending_decision': 'ON_HOLD',

  // Inspection events
  'inspection_scheduled': 'INSPECTION_REQUIRED',
  'rough_in_inspection': 'INSPECTION_REQUIRED',
};

/**
 * Map event types to activity severity
 */
const EVENT_SEVERITY_MAP: Record<string, 'info' | 'warning' | 'error' | 'success'> = {
  'work_started': 'info',
  'work_completed': 'success',
  'installation_complete': 'success',
  'inspection_passed': 'success',
  'issue_detected': 'error',
  'inspection_failed': 'error',
  'coordination_conflict': 'warning',
  'material_delay': 'warning',
  'rfi_submitted': 'warning',
  'milestone_reached': 'success',
};

// ============================================================================
// EXECUTOR CLASS
// ============================================================================

export class PlaybackEventExecutor {
  private pool: Pool;
  private config: PlaybackEventExecutorConfig;
  private unsubscribe: (() => void) | null = null;
  private voxelCache: Map<string, { id: string; status: string }> = new Map();
  private activityCounter = 0;

  constructor(pool: Pool, config: PlaybackEventExecutorConfig) {
    this.pool = pool;
    this.config = {
      enableDatabaseUpdates: true,
      enableWebSocketBroadcast: true,
      enableActivityLogging: true,
      ...config,
    };
  }

  /**
   * Attach to a playback controller and start executing events
   */
  attach(controller: PlaybackController): void {
    logger.info('[PlaybackExecutor] Attaching to controller', {
      instanceId: this.config.instanceId,
      projectId: this.config.projectId,
    });

    // Load voxel cache for fast status lookups
    this.loadVoxelCache().catch((err) => {
      logger.warn('[PlaybackExecutor] Failed to load voxel cache', { error: err });
    });

    // Subscribe to playback events
    this.unsubscribe = controller.onEvent(this.handlePlaybackEvent.bind(this));
  }

  /**
   * Detach from controller and cleanup
   */
  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.voxelCache.clear();
    logger.info('[PlaybackExecutor] Detached from controller', {
      instanceId: this.config.instanceId,
    });
  }

  /**
   * Load voxel IDs and current statuses into cache
   */
  private async loadVoxelCache(): Promise<void> {
    const result = await this.pool.query(
      `SELECT id, status FROM voxels WHERE project_id = $1`,
      [this.config.projectId]
    );

    for (const row of result.rows) {
      this.voxelCache.set(row.id, { id: row.id, status: row.status });
    }

    logger.debug('[PlaybackExecutor] Loaded voxel cache', {
      projectId: this.config.projectId,
      count: this.voxelCache.size,
    });
  }

  /**
   * Handle playback event from controller
   */
  private async handlePlaybackEvent(update: PlaybackUpdate): Promise<void> {
    try {
      switch (update.type) {
        case 'event_executed':
          await this.handleEventExecuted(update);
          break;
        case 'milestone_reached':
          await this.handleMilestoneReached(update);
          break;
        case 'position_changed':
          // Position changes are informational only
          break;
        case 'state_changed':
          // State changes (play/pause/stop) are informational only
          break;
      }
    } catch (error) {
      logger.error('[PlaybackExecutor] Error handling event', {
        type: update.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle timeline event execution
   */
  private async handleEventExecuted(update: PlaybackUpdate): Promise<void> {
    // Extract event from data (PlaybackUpdate.data is unknown)
    const data = update.data as { event?: PlaybackEventData };
    const event = data?.event;
    if (!event) return;

    // Determine status change based on event type
    const newStatus = EVENT_STATUS_MAP[event.type];

    // Get target voxels (either from consequences or random selection)
    const targetVoxels = await this.getTargetVoxels(event);

    if (targetVoxels.length === 0) {
      logger.debug('[PlaybackExecutor] No target voxels for event', { eventId: event.id });
      return;
    }

    // Update each target voxel
    for (const voxelId of targetVoxels) {
      const cachedVoxel = this.voxelCache.get(voxelId);
      const previousStatus = cachedVoxel?.status || 'PLANNED';

      // Skip if no status change defined or same status
      if (!newStatus || newStatus === previousStatus) continue;

      // Update database
      if (this.config.enableDatabaseUpdates) {
        await this.updateVoxelStatus(voxelId, previousStatus, newStatus, event);
      }

      // Update cache
      if (cachedVoxel) {
        cachedVoxel.status = newStatus;
      }

      // Broadcast via WebSocket
      if (this.config.enableWebSocketBroadcast) {
        this.broadcastVoxelUpdate(voxelId, previousStatus, newStatus, event);
      }

      // Create activity record
      if (this.config.enableActivityLogging) {
        await this.createActivityRecord(voxelId, event, previousStatus, newStatus);
      }
    }

    logger.debug('[PlaybackExecutor] Event executed', {
      eventId: event.id,
      type: event.type,
      targetVoxels: targetVoxels.length,
      newStatus,
    });
  }

  /**
   * Handle milestone reached
   */
  private async handleMilestoneReached(update: PlaybackUpdate): Promise<void> {
    // Extract milestone from data (PlaybackUpdate.data is unknown)
    const data = update.data as { milestone?: PlaybackMilestoneData };
    const milestone = data?.milestone;
    if (!milestone) return;

    // Create milestone activity
    if (this.config.enableActivityLogging) {
      await this.createMilestoneActivity(milestone);
    }

    // Broadcast milestone via WebSocket
    if (this.config.enableWebSocketBroadcast) {
      this.broadcastMilestoneActivity(milestone);
    }

    logger.info('[PlaybackExecutor] Milestone reached', {
      milestoneId: milestone.id,
      name: milestone.name,
      position: milestone.position,
    });
  }

  /**
   * Get target voxels for an event
   */
  private async getTargetVoxels(event: any): Promise<string[]> {
    // If event has explicit consequences with targets, use those
    if (event.consequences) {
      const targets: string[] = [];
      for (const consequence of event.consequences) {
        if (consequence.target) {
          targets.push(consequence.target);
        }
      }
      if (targets.length > 0) return targets;
    }

    // Otherwise, select random voxels based on event type
    const count = this.getVoxelCountForEvent(event.type);
    const voxelIds = Array.from(this.voxelCache.keys());

    // Shuffle and take count
    const shuffled = voxelIds.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Get number of voxels to update for event type
   */
  private getVoxelCountForEvent(eventType: string): number {
    // More significant events affect more voxels
    const counts: Record<string, number> = {
      'work_started': 3,
      'work_completed': 2,
      'installation_complete': 2,
      'inspection_passed': 1,
      'inspection_failed': 1,
      'issue_detected': 1,
      'coordination_conflict': 2,
    };
    return counts[eventType] || 1;
  }

  /**
   * Update voxel status in database
   */
  private async updateVoxelStatus(
    voxelId: string,
    previousStatus: string,
    newStatus: string,
    event: any
  ): Promise<StatusUpdateResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update voxel status
      const percentComplete = this.calculatePercentComplete(newStatus);
      const healthStatus = this.calculateHealthStatus(newStatus);

      await client.query(`
        UPDATE voxels
        SET status = $1,
            health_status = $2,
            percent_complete = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [newStatus, healthStatus, percentComplete, voxelId]);

      // Create status history record
      await client.query(`
        INSERT INTO voxel_status_history (
          voxel_id, previous_status, new_status, previous_health, new_health,
          percent_complete, note, source, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        voxelId,
        previousStatus,
        newStatus,
        null,
        healthStatus,
        percentComplete,
        `Demo playback: ${event.description || event.type}`,
        'demo_playback',
      ]);

      await client.query('COMMIT');

      return {
        voxelId,
        previousStatus,
        newStatus,
        success: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[PlaybackExecutor] Failed to update voxel status', {
        voxelId,
        error: errorMsg,
      });
      return {
        voxelId,
        previousStatus,
        newStatus,
        success: false,
        error: errorMsg,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Calculate percent complete from status
   */
  private calculatePercentComplete(status: string): number | null {
    switch (status) {
      case 'COMPLETE': return 100;
      case 'IN_PROGRESS': return Math.floor(Math.random() * 60) + 20; // 20-80%
      case 'PLANNED': return 0;
      default: return null;
    }
  }

  /**
   * Calculate health status from voxel status
   */
  private calculateHealthStatus(status: string): string {
    switch (status) {
      case 'BLOCKED': return 'CRITICAL';
      case 'ON_HOLD': return 'AT_RISK';
      case 'INSPECTION_REQUIRED': return 'AT_RISK';
      default: return 'HEALTHY';
    }
  }

  /**
   * Broadcast voxel update via WebSocket
   */
  private broadcastVoxelUpdate(
    voxelId: string,
    previousStatus: string,
    newStatus: string,
    event: any
  ): void {
    const wsHandler = getVoxelStreamHandler();
    if (!wsHandler) {
      logger.warn('[PlaybackExecutor] WebSocket handler not available');
      return;
    }

    const updateEvent: VoxelUpdateEvent = {
      voxelId,
      projectId: this.config.projectId,
      previousStatus,
      status: newStatus,
      healthStatus: this.calculateHealthStatus(newStatus),
      percentComplete: this.calculatePercentComplete(newStatus) ?? undefined,
      updatedBy: event.persona || 'Demo Playback',
      timestamp: new Date().toISOString(),
      source: 'demo_playback',
    };

    wsHandler.broadcastVoxelUpdate(updateEvent);
  }

  /**
   * Create activity record in audit_log table
   */
  private async createActivityRecord(
    voxelId: string,
    event: any,
    previousStatus: string,
    newStatus: string
  ): Promise<void> {
    try {
      // Use audit_log table which exists in the schema
      await this.pool.query(`
        INSERT INTO audit_log (
          event_hash, event_type, resource_id, resource_type, actor_id, event_data
        ) VALUES (
          encode(digest(gen_random_uuid()::text || now()::text, 'sha256'), 'hex'),
          'status_change', $1, 'voxel', 'demo_playback', $2
        )
      `, [
        voxelId,
        JSON.stringify({
          previousStatus,
          newStatus,
          eventType: event.type,
          persona: event.persona,
          description: event.description,
          severity: EVENT_SEVERITY_MAP[event.type] || 'info',
          source: 'demo_playback',
          projectId: this.config.projectId,
        }),
      ]);
    } catch (error) {
      // Activity logging is non-critical
      logger.warn('[PlaybackExecutor] Failed to create activity record', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Also broadcast as activity event via WebSocket
    const wsHandler = getVoxelStreamHandler();
    if (wsHandler) {
      const activity: ActivityEvent = {
        id: `activity-${this.config.instanceId}-${++this.activityCounter}`,
        type: 'status_change',
        title: `Status: ${previousStatus} → ${newStatus}`,
        description: event.description || `${event.type} by ${event.persona}`,
        severity: EVENT_SEVERITY_MAP[event.type] || 'info',
        voxelId,
        projectId: this.config.projectId,
        timestamp: new Date().toISOString(),
      };
      wsHandler.broadcastActivity(activity);
    }
  }

  /**
   * Create milestone activity record in audit_log
   */
  private async createMilestoneActivity(milestone: any): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO audit_log (
          event_hash, event_type, resource_id, resource_type, actor_id, event_data
        ) VALUES (
          encode(digest(gen_random_uuid()::text || now()::text, 'sha256'), 'hex'),
          'milestone_reached', $1, 'milestone', 'demo_playback', $2
        )
      `, [
        milestone.id,
        JSON.stringify({
          name: milestone.name,
          description: milestone.description,
          position: milestone.position,
          severity: 'success',
          source: 'demo_playback',
          projectId: this.config.projectId,
        }),
      ]);
    } catch (error) {
      logger.warn('[PlaybackExecutor] Failed to create milestone activity', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Broadcast milestone via WebSocket
   */
  private broadcastMilestoneActivity(milestone: any): void {
    const wsHandler = getVoxelStreamHandler();
    if (!wsHandler) return;

    const activity: ActivityEvent = {
      id: `activity-${this.config.instanceId}-${this.activityCounter}`,
      type: 'milestone',
      title: `Milestone: ${milestone.name}`,
      description: milestone.description,
      severity: 'success',
      projectId: this.config.projectId,
      timestamp: new Date().toISOString(),
    };

    wsHandler.broadcastActivity(activity);
  }
}

// ============================================================================
// EXECUTOR MANAGER
// ============================================================================

/**
 * Manages multiple playback event executors
 */
export class PlaybackEventExecutorManager {
  private pool: Pool;
  private executors = new Map<string, PlaybackEventExecutor>();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create and attach an executor to a playback controller
   */
  attachExecutor(
    controller: PlaybackController,
    config: Omit<PlaybackEventExecutorConfig, 'instanceId'>
  ): PlaybackEventExecutor {
    const instanceId = controller.instanceId;

    // Detach existing executor if any
    this.detachExecutor(instanceId);

    // Create new executor
    const executor = new PlaybackEventExecutor(this.pool, {
      ...config,
      instanceId,
    });

    // Attach to controller
    executor.attach(controller);

    // Store reference
    this.executors.set(instanceId, executor);

    logger.info('[PlaybackExecutorManager] Executor attached', { instanceId });
    return executor;
  }

  /**
   * Detach and cleanup an executor
   */
  detachExecutor(instanceId: string): void {
    const executor = this.executors.get(instanceId);
    if (executor) {
      executor.detach();
      this.executors.delete(instanceId);
      logger.info('[PlaybackExecutorManager] Executor detached', { instanceId });
    }
  }

  /**
   * Detach all executors
   */
  detachAll(): void {
    for (const [instanceId, executor] of this.executors) {
      executor.detach();
    }
    this.executors.clear();
  }

  /**
   * Get executor for an instance
   */
  getExecutor(instanceId: string): PlaybackEventExecutor | undefined {
    return this.executors.get(instanceId);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let executorManager: PlaybackEventExecutorManager | null = null;

/**
 * Get or create the executor manager singleton
 */
export function getPlaybackEventExecutorManager(pool: Pool): PlaybackEventExecutorManager {
  if (!executorManager) {
    executorManager = new PlaybackEventExecutorManager(pool);
  }
  return executorManager;
}
