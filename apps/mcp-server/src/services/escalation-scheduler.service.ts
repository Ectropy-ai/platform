/**
 * Escalation Scheduler Service - Demo 3 Implementation
 *
 * Enterprise-grade background scheduler for automatic decision escalation.
 * Monitors pending decisions and auto-escalates when authority response
 * timeouts are exceeded.
 *
 * Features:
 * - Configurable polling interval
 * - Per-authority-level timeout thresholds
 * - Graceful escalation with notification hooks
 * - Audit trail for all escalation events
 * - Multi-instance safe with distributed locking (Redis)
 *
 * Authority Timeout Defaults (from 7-tier cascade):
 * - L0 FIELD: 2 hours
 * - L1 FOREMAN: 4 hours
 * - L2 SUPERINTENDENT: 24 hours
 * - L3 PM: 48 hours
 * - L4 ARCHITECT: 72 hours
 * - L5 OWNER: 168 hours (1 week)
 * - L6 REGULATORY: No auto-escalate (requires explicit action)
 *
 * @see .roadmap/features/decision-lifecycle/interfaces.json
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import {
  AuthorityLevel,
  PMDecision,
  PMDecisionStatus,
} from '../types/pm.types.js';
import { logger } from '@ectropy/shared/utils';

// ============================================================================
// Types
// ============================================================================

/**
 * Timeout configuration per authority level (in hours)
 */
export interface AuthorityTimeoutConfig {
  [AuthorityLevel.FIELD]: number;
  [AuthorityLevel.FOREMAN]: number;
  [AuthorityLevel.SUPERINTENDENT]: number;
  [AuthorityLevel.PM]: number;
  [AuthorityLevel.ARCHITECT]: number;
  [AuthorityLevel.OWNER]: number;
  [AuthorityLevel.REGULATORY]: number | null; // null = no auto-escalate
}

/**
 * Escalation event payload
 */
export interface EscalationEvent {
  decisionId: string;
  decisionUrn: string;
  projectId: string;
  previousLevel: AuthorityLevel;
  newLevel: AuthorityLevel;
  reason: 'timeout' | 'manual' | 'policy';
  escalatedAt: Date;
  timeoutHours: number;
  waitedHours: number;
}

/**
 * Notification payload for escalation
 */
export interface EscalationNotification {
  type: 'escalation';
  decisionId: string;
  title: string;
  description: string;
  fromLevel: AuthorityLevel;
  toLevel: AuthorityLevel;
  recipients: string[];
  urgency: 'normal' | 'high' | 'critical';
  actionUrl?: string;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Polling interval in milliseconds (default: 60000 = 1 minute) */
  pollingIntervalMs: number;
  /** Authority timeout overrides */
  timeoutOverrides?: Partial<AuthorityTimeoutConfig>;
  /** Enable/disable the scheduler */
  enabled: boolean;
  /** Project ID for decision loading (default: 'default') */
  projectId?: string;
  /** Redis client for distributed locking (optional) */
  redisClient?: unknown;
  /** Notification callback */
  onNotification?: (notification: EscalationNotification) => Promise<void>;
  /** Decision loader callback */
  loadPendingDecisions?: () => Promise<PMDecision[]>;
  /** Decision escalator callback */
  escalateDecision?: (
    decisionId: string,
    toLevel: AuthorityLevel,
    reason: string
  ) => Promise<boolean>;
}

/**
 * Scheduler state
 */
export interface SchedulerState {
  isRunning: boolean;
  lastPollTime: Date | null;
  decisionsChecked: number;
  decisionsEscalated: number;
  errors: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default timeout thresholds per authority level (in hours)
 */
export const DEFAULT_AUTHORITY_TIMEOUTS: AuthorityTimeoutConfig = {
  [AuthorityLevel.FIELD]: 2, // 2 hours for field observations
  [AuthorityLevel.FOREMAN]: 4, // 4 hours for trade decisions
  [AuthorityLevel.SUPERINTENDENT]: 24, // 1 day for site-level decisions
  [AuthorityLevel.PM]: 48, // 2 days for project decisions
  [AuthorityLevel.ARCHITECT]: 72, // 3 days for design decisions
  [AuthorityLevel.OWNER]: 168, // 1 week for major decisions
  [AuthorityLevel.REGULATORY]: null, // No auto-escalate for code/safety
};

/**
 * Authority level number mapping
 */
const AUTHORITY_LEVEL_ORDER: Record<AuthorityLevel, number> = {
  [AuthorityLevel.FIELD]: 0,
  [AuthorityLevel.FOREMAN]: 1,
  [AuthorityLevel.SUPERINTENDENT]: 2,
  [AuthorityLevel.PM]: 3,
  [AuthorityLevel.ARCHITECT]: 4,
  [AuthorityLevel.OWNER]: 5,
  [AuthorityLevel.REGULATORY]: 6,
};

/**
 * Reverse mapping: number to authority level
 */
const AUTHORITY_LEVEL_BY_ORDER: AuthorityLevel[] = [
  AuthorityLevel.FIELD,
  AuthorityLevel.FOREMAN,
  AuthorityLevel.SUPERINTENDENT,
  AuthorityLevel.PM,
  AuthorityLevel.ARCHITECT,
  AuthorityLevel.OWNER,
  AuthorityLevel.REGULATORY,
];

/**
 * Urgency mapping based on authority level
 */
const ESCALATION_URGENCY: Record<
  AuthorityLevel,
  'normal' | 'high' | 'critical'
> = {
  [AuthorityLevel.FIELD]: 'normal',
  [AuthorityLevel.FOREMAN]: 'normal',
  [AuthorityLevel.SUPERINTENDENT]: 'normal',
  [AuthorityLevel.PM]: 'high',
  [AuthorityLevel.ARCHITECT]: 'high',
  [AuthorityLevel.OWNER]: 'critical',
  [AuthorityLevel.REGULATORY]: 'critical',
};

// ============================================================================
// Escalation Scheduler Class
// ============================================================================

/**
 * Escalation Scheduler Service
 *
 * Background service that monitors pending decisions and auto-escalates
 * when response timeouts are exceeded.
 */
export class EscalationScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private timeouts: AuthorityTimeoutConfig;
  private state: SchedulerState;
  private pollTimer: NodeJS.Timeout | null = null;
  private lockKey = 'ectropy:escalation-scheduler:lock';

  constructor(config: Partial<SchedulerConfig> = {}) {
    super();

    this.config = {
      pollingIntervalMs: config.pollingIntervalMs ?? 60000, // 1 minute default
      enabled: config.enabled ?? true,
      timeoutOverrides: config.timeoutOverrides,
      redisClient: config.redisClient,
      onNotification: config.onNotification,
      loadPendingDecisions: config.loadPendingDecisions,
      escalateDecision: config.escalateDecision,
    };

    // Merge default timeouts with overrides
    this.timeouts = {
      ...DEFAULT_AUTHORITY_TIMEOUTS,
      ...config.timeoutOverrides,
    };

    this.state = {
      isRunning: false,
      lastPollTime: null,
      decisionsChecked: 0,
      decisionsEscalated: 0,
      errors: 0,
    };
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Start the escalation scheduler
   */
  start(): void {
    if (this.state.isRunning) {
      logger.warn('Escalation scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Escalation scheduler is disabled');
      return;
    }

    this.state.isRunning = true;
    logger.info('Starting escalation scheduler', {
      pollingIntervalMs: this.config.pollingIntervalMs,
      timeouts: this.timeouts,
    });

    // Start polling
    this.schedulePoll();

    this.emit('started');
  }

  /**
   * Stop the escalation scheduler
   */
  stop(): void {
    if (!this.state.isRunning) {
      logger.warn('Escalation scheduler not running');
      return;
    }

    this.state.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    logger.info('Stopped escalation scheduler', {
      decisionsChecked: this.state.decisionsChecked,
      decisionsEscalated: this.state.decisionsEscalated,
    });

    this.emit('stopped');
  }

  /**
   * Get current scheduler state
   */
  getState(): SchedulerState {
    return { ...this.state };
  }

  /**
   * Update timeout configuration
   */
  updateTimeouts(overrides: Partial<AuthorityTimeoutConfig>): void {
    this.timeouts = {
      ...this.timeouts,
      ...overrides,
    };
    logger.info('Updated escalation timeouts', { timeouts: this.timeouts });
  }

  // ===========================================================================
  // Polling Methods
  // ===========================================================================

  /**
   * Schedule the next poll
   */
  private schedulePoll(): void {
    if (!this.state.isRunning) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      await this.poll();
      this.schedulePoll();
    }, this.config.pollingIntervalMs);
  }

  /**
   * Execute a polling cycle
   */
  async poll(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    const startTime = Date.now();

    try {
      // Acquire distributed lock if Redis is available
      if (this.config.redisClient) {
        const hasLock = await this.acquireLock();
        if (!hasLock) {
          logger.debug('Could not acquire escalation lock, skipping poll');
          return;
        }
      }

      // Load pending decisions
      const decisions = await this.loadPendingDecisions();
      this.state.decisionsChecked += decisions.length;

      // Check each decision for timeout
      for (const decision of decisions) {
        await this.checkAndEscalate(decision);
      }

      this.state.lastPollTime = new Date();

      const elapsedMs = Date.now() - startTime;
      logger.debug('Escalation poll completed', {
        decisionsChecked: decisions.length,
        elapsedMs,
      });

      // Release distributed lock
      if (this.config.redisClient) {
        await this.releaseLock();
      }
    } catch (error) {
      this.state.errors++;
      logger.error('Escalation poll failed', { error });
      this.emit('error', error);
    }
  }

  /**
   * Manually trigger a poll (for testing)
   */
  async triggerPoll(): Promise<void> {
    await this.poll();
  }

  // ===========================================================================
  // Decision Loading
  // ===========================================================================

  /**
   * Load pending decisions that need escalation checking
   */
  private async loadPendingDecisions(): Promise<PMDecision[]> {
    // Use custom loader if provided
    if (this.config.loadPendingDecisions) {
      return this.config.loadPendingDecisions();
    }

    // Default: load from JSON file storage via exported pm-decision-tools API
    try {
      const { loadDecisions } = await import('./pm-decision-tools.js');
      const collection = loadDecisions(this.config.projectId ?? 'default');

      // Filter to pending decisions (only PENDING is an actionable pre-resolution status in PMDecisionStatus)
      return collection.decisions.filter((d) => d.status === 'PENDING');
    } catch (error) {
      logger.error('Failed to load decisions for escalation check', { error });
      return [];
    }
  }

  // ===========================================================================
  // Escalation Logic
  // ===========================================================================

  /**
   * Check if a decision needs escalation and escalate if needed
   */
  private async checkAndEscalate(decision: PMDecision): Promise<boolean> {
    const currentLevel = decision.authorityLevel.current;
    const requiredLevel = decision.authorityLevel.required;

    // Skip if already at or above required level
    if (
      AUTHORITY_LEVEL_ORDER[currentLevel] >=
      AUTHORITY_LEVEL_ORDER[requiredLevel]
    ) {
      return false;
    }

    // Get timeout for current level
    const timeoutHours = this.timeouts[currentLevel];

    // Skip if no auto-escalate for this level (e.g., REGULATORY)
    if (timeoutHours === null) {
      return false;
    }

    // Calculate hours since decision was created/last updated
    const decisionTime = new Date(decision.updatedAt || decision.createdAt);
    const now = new Date();
    const hoursElapsed =
      (now.getTime() - decisionTime.getTime()) / (1000 * 60 * 60);

    // Check if timeout exceeded
    if (hoursElapsed < timeoutHours) {
      return false;
    }

    // Determine next level
    const currentLevelOrder = AUTHORITY_LEVEL_ORDER[currentLevel];
    const nextLevelOrder = Math.min(currentLevelOrder + 1, 6);
    const nextLevel = AUTHORITY_LEVEL_BY_ORDER[nextLevelOrder];

    // Don't escalate beyond required level
    if (
      AUTHORITY_LEVEL_ORDER[nextLevel] > AUTHORITY_LEVEL_ORDER[requiredLevel]
    ) {
      return false;
    }

    // Perform escalation
    await this.escalateDecision(
      decision,
      nextLevel,
      hoursElapsed,
      timeoutHours
    );

    return true;
  }

  /**
   * Escalate a decision to the next authority level
   */
  private async escalateDecision(
    decision: PMDecision,
    toLevel: AuthorityLevel,
    waitedHours: number,
    timeoutHours: number
  ): Promise<void> {
    const fromLevel = decision.authorityLevel.current;

    logger.info('Auto-escalating decision', {
      decisionId: decision.decisionId,
      fromLevel,
      toLevel,
      waitedHours: waitedHours.toFixed(1),
      timeoutHours,
    });

    // Create escalation event
    const event: EscalationEvent = {
      decisionId: decision.decisionId,
      decisionUrn: decision.$id,
      projectId: decision.meta.projectId,
      previousLevel: fromLevel,
      newLevel: toLevel,
      reason: 'timeout',
      escalatedAt: new Date(),
      timeoutHours,
      waitedHours,
    };

    // Perform the escalation
    if (this.config.escalateDecision) {
      const success = await this.config.escalateDecision(
        decision.decisionId,
        toLevel,
        `Auto-escalated after ${waitedHours.toFixed(1)} hours (timeout: ${timeoutHours}h)`
      );

      if (!success) {
        logger.error('Failed to escalate decision', {
          decisionId: decision.decisionId,
        });
        return;
      }
    } else {
      // Default: use pm-decision-tools via the exported tool registry API
      try {
        const { getToolByName } = await import('./pm-decision-tools.js');
        const escalateTool = getToolByName('escalate_decision');
        if (!escalateTool) {
          logger.error(
            'escalate_decision tool not found in pm-decision-tools registry'
          );
          return;
        }
        await escalateTool.handler({
          projectId: this.config.projectId ?? 'default',
          decisionId: decision.decisionId,
          targetLevel: toLevel,
          reason: `Auto-escalated: Response timeout exceeded (${waitedHours.toFixed(1)}h > ${timeoutHours}h)`,
          escalatedBy: 'system:escalation-scheduler',
        });
      } catch (error) {
        logger.error('Failed to escalate decision via tool', {
          decisionId: decision.decisionId,
          error,
        });
        return;
      }
    }

    this.state.decisionsEscalated++;

    // Send notification
    await this.sendEscalationNotification(decision, fromLevel, toLevel);

    // Emit event
    this.emit('escalation', event);
  }

  /**
   * Send escalation notification
   */
  private async sendEscalationNotification(
    decision: PMDecision,
    fromLevel: AuthorityLevel,
    toLevel: AuthorityLevel
  ): Promise<void> {
    const notification: EscalationNotification = {
      type: 'escalation',
      decisionId: decision.decisionId,
      title: `Decision Escalated: ${decision.title}`,
      description: `Decision "${decision.title}" has been automatically escalated from ${fromLevel} to ${toLevel} due to response timeout.`,
      fromLevel,
      toLevel,
      recipients: [], // Would be populated from authority mappings
      urgency: ESCALATION_URGENCY[toLevel],
      actionUrl: `/decisions/${decision.decisionId}`,
    };

    // Use custom notification handler if provided
    if (this.config.onNotification) {
      try {
        await this.config.onNotification(notification);
      } catch (error) {
        logger.error('Failed to send escalation notification', { error });
      }
    }

    // Emit notification event
    this.emit('notification', notification);
  }

  // ===========================================================================
  // Distributed Locking (Redis)
  // ===========================================================================

  /**
   * Acquire distributed lock
   */
  private async acquireLock(): Promise<boolean> {
    if (!this.config.redisClient) {
      return true;
    }

    try {
      // Simple SET NX EX pattern for Redis locking
      const redis = this.config.redisClient as any;
      const result = await redis.set(
        this.lockKey,
        process.pid.toString(),
        'NX',
        'EX',
        Math.ceil(this.config.pollingIntervalMs / 1000) + 10
      );
      return result === 'OK';
    } catch (error) {
      logger.error('Failed to acquire escalation lock', { error });
      return false;
    }
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(): Promise<void> {
    if (!this.config.redisClient) {
      return;
    }

    try {
      const redis = this.config.redisClient as any;
      await redis.del(this.lockKey);
    } catch (error) {
      logger.error('Failed to release escalation lock', { error });
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create and start the escalation scheduler
 */
export function createEscalationScheduler(
  config?: Partial<SchedulerConfig>
): EscalationScheduler {
  const scheduler = new EscalationScheduler(config);
  return scheduler;
}

/**
 * Get the next authority level for escalation
 */
export function getNextAuthorityLevel(
  current: AuthorityLevel
): AuthorityLevel | null {
  const currentOrder = AUTHORITY_LEVEL_ORDER[current];
  if (currentOrder >= 6) {
    return null;
  } // Already at REGULATORY
  return AUTHORITY_LEVEL_BY_ORDER[currentOrder + 1];
}

/**
 * Calculate hours until escalation for a decision
 */
export function getHoursUntilEscalation(
  decision: PMDecision,
  timeouts: AuthorityTimeoutConfig = DEFAULT_AUTHORITY_TIMEOUTS
): number | null {
  const currentLevel = decision.authorityLevel.current;
  const timeoutHours = timeouts[currentLevel];

  if (timeoutHours === null) {
    return null;
  } // No auto-escalate

  const decisionTime = new Date(decision.updatedAt || decision.createdAt);
  const now = new Date();
  const hoursElapsed =
    (now.getTime() - decisionTime.getTime()) / (1000 * 60 * 60);

  return Math.max(0, timeoutHours - hoursElapsed);
}

/**
 * Check if a decision is overdue for escalation
 */
export function isDecisionOverdue(
  decision: PMDecision,
  timeouts: AuthorityTimeoutConfig = DEFAULT_AUTHORITY_TIMEOUTS
): boolean {
  const hoursRemaining = getHoursUntilEscalation(decision, timeouts);
  return hoursRemaining !== null && hoursRemaining <= 0;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let schedulerInstance: EscalationScheduler | null = null;

/**
 * Get or create the singleton scheduler instance
 */
export function getEscalationScheduler(
  config?: Partial<SchedulerConfig>
): EscalationScheduler {
  if (!schedulerInstance) {
    schedulerInstance = createEscalationScheduler(config);
  }
  return schedulerInstance;
}

/**
 * Initialize and start the escalation scheduler
 *
 * Call this at application startup.
 */
export function initializeEscalationScheduler(
  config?: Partial<SchedulerConfig>
): EscalationScheduler {
  const scheduler = getEscalationScheduler(config);
  scheduler.start();
  return scheduler;
}

/**
 * Shutdown the escalation scheduler
 *
 * Call this at application shutdown.
 */
export function shutdownEscalationScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  EscalationScheduler,
  createEscalationScheduler,
  getEscalationScheduler,
  initializeEscalationScheduler,
  shutdownEscalationScheduler,
  getNextAuthorityLevel,
  getHoursUntilEscalation,
  isDecisionOverdue,
  DEFAULT_AUTHORITY_TIMEOUTS,
};
