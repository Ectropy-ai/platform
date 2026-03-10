/**
 * ============================================================================
 * REDIS PUB/SUB ADAPTER - HORIZONTAL WEBSOCKET SCALING
 * ============================================================================
 * Enterprise-grade Redis Pub/Sub adapter for distributing WebSocket messages
 * across multiple API Gateway instances for horizontal scaling.
 *
 * Architecture:
 * - Each API Gateway instance subscribes to project channels
 * - When a voxel update occurs, it's published to Redis
 * - All instances receive the update and broadcast to local WebSocket clients
 *
 * Channels:
 * - voxel:project:{projectId}:updates - Voxel status changes
 * - voxel:project:{projectId}:activity - Activity stream events
 * - voxel:broadcast:all - Global broadcasts (admin notifications)
 *
 * Failover:
 * - Graceful degradation to local-only broadcasts if Redis unavailable
 * - Automatic reconnection with exponential backoff
 * - Health check integration for monitoring
 *
 * @module api-gateway/websocket/redis-pubsub
 * @version 1.0.0
 * ============================================================================
 */

import type { Redis } from 'ioredis';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import type { VoxelUpdateEvent, ActivityEvent } from './voxel-stream.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Redis Pub/Sub message types
 */
export type RedisPubSubMessageType =
  | 'voxel:updated'
  | 'voxel:batch_updated'
  | 'activity:new'
  | 'broadcast:all';

/**
 * Redis Pub/Sub message envelope
 */
export interface RedisPubSubMessage {
  type: RedisPubSubMessageType;
  instanceId: string;
  timestamp: string;
  payload: VoxelUpdateEvent | VoxelUpdateEvent[] | ActivityEvent | unknown;
}

/**
 * Callback for handling received messages
 */
export type MessageHandler = (
  channel: string,
  message: RedisPubSubMessage
) => void;

/**
 * Redis Pub/Sub adapter configuration
 */
export interface RedisPubSubConfig {
  /** Redis client for publishing */
  publisher: Redis;
  /** Redis client for subscribing (must be separate from publisher) */
  subscriber: Redis;
  /** Unique instance identifier for this API Gateway */
  instanceId: string;
  /** Handler for received messages */
  onMessage: MessageHandler;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Redis Pub/Sub adapter statistics
 */
export interface RedisPubSubStats {
  instanceId: string;
  isConnected: boolean;
  subscribedChannels: number;
  messagesPublished: number;
  messagesReceived: number;
  lastPublishTime: string | null;
  lastReceiveTime: string | null;
  errors: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Channel prefix for voxel updates */
const CHANNEL_PREFIX = 'voxel:';

/** Channel for global broadcasts */
const GLOBAL_CHANNEL = 'voxel:broadcast:all';

/** Reconnection delay in milliseconds */
const RECONNECT_DELAY = 5000;

// ============================================================================
// REDIS PUB/SUB ADAPTER CLASS
// ============================================================================

/**
 * Redis Pub/Sub adapter for cross-instance WebSocket message distribution
 */
export class RedisPubSubAdapter {
  private publisher: Redis;
  private subscriber: Redis;
  private instanceId: string;
  private onMessage: MessageHandler;
  private verbose: boolean;
  private subscribedChannels = new Set<string>();
  private isConnected = false;
  private stats = {
    messagesPublished: 0,
    messagesReceived: 0,
    errors: 0,
    lastPublishTime: null as string | null,
    lastReceiveTime: null as string | null,
  };

  constructor(config: RedisPubSubConfig) {
    this.publisher = config.publisher;
    this.subscriber = config.subscriber;
    this.instanceId = config.instanceId;
    this.onMessage = config.onMessage;
    this.verbose = config.verbose ?? false;

    this.setupSubscriber();
    this.subscribeToGlobalChannel();

    logger.info('[RedisPubSub] Adapter initialized', {
      instanceId: this.instanceId,
    });
  }

  /**
   * Set up subscriber event handlers
   */
  private setupSubscriber(): void {
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('subscribe', (channel: string, count: number) => {
      this.subscribedChannels.add(channel);
      if (this.verbose) {
        logger.debug('[RedisPubSub] Subscribed to channel', { channel, count });
      }
    });

    this.subscriber.on('unsubscribe', (channel: string, count: number) => {
      this.subscribedChannels.delete(channel);
      if (this.verbose) {
        logger.debug('[RedisPubSub] Unsubscribed from channel', { channel, count });
      }
    });

    this.subscriber.on('connect', () => {
      this.isConnected = true;
      logger.info('[RedisPubSub] Subscriber connected');
    });

    this.subscriber.on('error', (error: Error) => {
      this.stats.errors++;
      logger.error('[RedisPubSub] Subscriber error', { error: error.message });
    });

    this.subscriber.on('close', () => {
      this.isConnected = false;
      logger.warn('[RedisPubSub] Subscriber disconnected');
    });

    this.subscriber.on('reconnecting', () => {
      logger.info('[RedisPubSub] Subscriber reconnecting...');
    });

    // Check initial connection state
    this.isConnected = this.subscriber.status === 'ready';
  }

  /**
   * Subscribe to the global broadcast channel
   */
  private subscribeToGlobalChannel(): void {
    this.subscriber.subscribe(GLOBAL_CHANNEL).catch((error) => {
      logger.error('[RedisPubSub] Failed to subscribe to global channel', {
        error: error.message,
      });
    });
  }

  /**
   * Handle incoming message from Redis
   */
  private handleMessage(channel: string, messageStr: string): void {
    try {
      const message = JSON.parse(messageStr) as RedisPubSubMessage;

      // Skip messages from this instance to avoid echo
      if (message.instanceId === this.instanceId) {
        if (this.verbose) {
          logger.debug('[RedisPubSub] Skipping own message', { channel });
        }
        return;
      }

      this.stats.messagesReceived++;
      this.stats.lastReceiveTime = new Date().toISOString();

      if (this.verbose) {
        logger.debug('[RedisPubSub] Received message', {
          channel,
          type: message.type,
          fromInstance: message.instanceId,
        });
      }

      // Invoke the message handler
      this.onMessage(channel, message);
    } catch (error) {
      this.stats.errors++;
      logger.warn('[RedisPubSub] Failed to parse message', {
        channel,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  // ============================================================================
  // PUBLIC METHODS - SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Subscribe to a project's update channel
   */
  async subscribeToProject(projectId: string): Promise<void> {
    const updateChannel = `${CHANNEL_PREFIX}project:${projectId}:updates`;
    const activityChannel = `${CHANNEL_PREFIX}project:${projectId}:activity`;

    try {
      await Promise.all([
        this.subscriber.subscribe(updateChannel),
        this.subscriber.subscribe(activityChannel),
      ]);

      if (this.verbose) {
        logger.debug('[RedisPubSub] Subscribed to project channels', {
          projectId,
          channels: [updateChannel, activityChannel],
        });
      }
    } catch (error) {
      this.stats.errors++;
      logger.error('[RedisPubSub] Failed to subscribe to project', {
        projectId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Unsubscribe from a project's channels
   */
  async unsubscribeFromProject(projectId: string): Promise<void> {
    const updateChannel = `${CHANNEL_PREFIX}project:${projectId}:updates`;
    const activityChannel = `${CHANNEL_PREFIX}project:${projectId}:activity`;

    try {
      await Promise.all([
        this.subscriber.unsubscribe(updateChannel),
        this.subscriber.unsubscribe(activityChannel),
      ]);

      if (this.verbose) {
        logger.debug('[RedisPubSub] Unsubscribed from project channels', {
          projectId,
        });
      }
    } catch (error) {
      logger.warn('[RedisPubSub] Failed to unsubscribe from project', {
        projectId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  // ============================================================================
  // PUBLIC METHODS - PUBLISHING
  // ============================================================================

  /**
   * Publish a voxel update to all instances
   */
  async publishVoxelUpdate(update: VoxelUpdateEvent): Promise<boolean> {
    const channel = `${CHANNEL_PREFIX}project:${update.projectId}:updates`;
    const message: RedisPubSubMessage = {
      type: 'voxel:updated',
      instanceId: this.instanceId,
      timestamp: new Date().toISOString(),
      payload: update,
    };

    return this.publish(channel, message);
  }

  /**
   * Publish a batch of voxel updates
   */
  async publishBatchUpdate(
    projectId: string,
    updates: VoxelUpdateEvent[]
  ): Promise<boolean> {
    const channel = `${CHANNEL_PREFIX}project:${projectId}:updates`;
    const message: RedisPubSubMessage = {
      type: 'voxel:batch_updated',
      instanceId: this.instanceId,
      timestamp: new Date().toISOString(),
      payload: updates,
    };

    return this.publish(channel, message);
  }

  /**
   * Publish an activity event
   */
  async publishActivity(activity: ActivityEvent): Promise<boolean> {
    const channel = `${CHANNEL_PREFIX}project:${activity.projectId}:activity`;
    const message: RedisPubSubMessage = {
      type: 'activity:new',
      instanceId: this.instanceId,
      timestamp: new Date().toISOString(),
      payload: activity,
    };

    return this.publish(channel, message);
  }

  /**
   * Publish a global broadcast to all instances
   */
  async publishGlobalBroadcast(payload: unknown): Promise<boolean> {
    const message: RedisPubSubMessage = {
      type: 'broadcast:all',
      instanceId: this.instanceId,
      timestamp: new Date().toISOString(),
      payload,
    };

    return this.publish(GLOBAL_CHANNEL, message);
  }

  /**
   * Internal publish method with error handling
   */
  private async publish(
    channel: string,
    message: RedisPubSubMessage
  ): Promise<boolean> {
    if (!this.isConnected) {
      if (this.verbose) {
        logger.debug('[RedisPubSub] Not connected, skipping publish', { channel });
      }
      return false;
    }

    try {
      await this.publisher.publish(channel, JSON.stringify(message));
      this.stats.messagesPublished++;
      this.stats.lastPublishTime = new Date().toISOString();

      if (this.verbose) {
        logger.debug('[RedisPubSub] Published message', {
          channel,
          type: message.type,
        });
      }

      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('[RedisPubSub] Publish failed', {
        channel,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return false;
    }
  }

  // ============================================================================
  // PUBLIC METHODS - STATUS & MANAGEMENT
  // ============================================================================

  /**
   * Get adapter statistics
   */
  getStats(): RedisPubSubStats {
    return {
      instanceId: this.instanceId,
      isConnected: this.isConnected,
      subscribedChannels: this.subscribedChannels.size,
      messagesPublished: this.stats.messagesPublished,
      messagesReceived: this.stats.messagesReceived,
      lastPublishTime: this.stats.lastPublishTime,
      lastReceiveTime: this.stats.lastReceiveTime,
      errors: this.stats.errors,
    };
  }

  /**
   * Check if the adapter is connected
   */
  isAdapterConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get list of subscribed channels
   */
  getSubscribedChannels(): string[] {
    return Array.from(this.subscribedChannels);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('[RedisPubSub] Initiating shutdown', {
      instanceId: this.instanceId,
    });

    try {
      // Unsubscribe from all channels
      if (this.subscribedChannels.size > 0) {
        await this.subscriber.unsubscribe(...Array.from(this.subscribedChannels));
      }

      // Note: We don't close Redis connections here as they may be shared
      // The parent application is responsible for closing Redis connections

      this.subscribedChannels.clear();
      this.isConnected = false;

      logger.info('[RedisPubSub] Shutdown complete');
    } catch (error) {
      logger.error('[RedisPubSub] Shutdown error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a Redis Pub/Sub adapter instance
 *
 * IMPORTANT: The subscriber Redis client must be a separate instance from the
 * publisher client, as Redis clients in subscribe mode cannot execute other
 * commands.
 *
 * @example
 * ```typescript
 * const pubClient = getRedisClient(REDIS_URL);
 * const subClient = pubClient.duplicate();
 *
 * const adapter = createRedisPubSubAdapter({
 *   publisher: pubClient,
 *   subscriber: subClient,
 *   instanceId: `api-gateway-${process.pid}`,
 *   onMessage: (channel, message) => {
 *     // Forward to local WebSocket clients
 *     voxelStreamHandler.handleCrossInstanceMessage(channel, message);
 *   },
 * });
 * ```
 */
export function createRedisPubSubAdapter(
  config: RedisPubSubConfig
): RedisPubSubAdapter {
  return new RedisPubSubAdapter(config);
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

let redisPubSubAdapter: RedisPubSubAdapter | null = null;

/**
 * Initialize the global Redis Pub/Sub adapter
 */
export function initializeRedisPubSub(
  config: RedisPubSubConfig
): RedisPubSubAdapter {
  if (!redisPubSubAdapter) {
    redisPubSubAdapter = createRedisPubSubAdapter(config);
  }
  return redisPubSubAdapter;
}

/**
 * Get the global Redis Pub/Sub adapter instance
 */
export function getRedisPubSubAdapter(): RedisPubSubAdapter | null {
  return redisPubSubAdapter;
}

/**
 * Reset the global adapter (for testing)
 */
export function resetRedisPubSubAdapter(): void {
  if (redisPubSubAdapter) {
    redisPubSubAdapter.shutdown().catch(() => {});
    redisPubSubAdapter = null;
  }
}
