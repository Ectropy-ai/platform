/**
 * ============================================================================
 * VOXEL STREAM WEBSOCKET HANDLER - REAL-TIME ROS MRO UPDATES
 * ============================================================================
 * Production-ready WebSocket server for real-time voxel status updates.
 * Enables live coordination view updates without polling.
 *
 * Sprint 5 ROS MRO (2026-01-24)
 *
 * @module api-gateway/websocket/voxel-stream
 * @version 1.0.0
 * ============================================================================
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import {
  RedisPubSubAdapter,
  RedisPubSubMessage,
  getRedisPubSubAdapter,
} from './redis-pubsub.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Client message types for voxel stream
 */
export type VoxelClientMessageType =
  | 'subscribe:project'
  | 'subscribe:voxel'
  | 'unsubscribe:project'
  | 'unsubscribe:voxel'
  | 'voxel:update'
  | 'ping';

/**
 * Server message types for voxel stream
 */
export type VoxelServerMessageType =
  | 'subscribed'
  | 'unsubscribed'
  | 'voxel:updated'
  | 'voxel:batch_updated'
  | 'activity:new'
  | 'error'
  | 'pong'
  | 'connection_established';

/**
 * Voxel update event payload
 */
export interface VoxelUpdateEvent {
  voxelId: string;
  projectId: string;
  previousStatus?: string;
  status: string;
  healthStatus?: string;
  percentComplete?: number;
  updatedBy?: string;
  updatedById?: string;
  timestamp: string;
  source: string;
}

/**
 * Activity event payload
 */
export interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  voxelId?: string;
  projectId: string;
  timestamp: string;
}

/**
 * Client message structure
 */
export interface VoxelClientMessage {
  type: VoxelClientMessageType;
  timestamp: string;
  projectId?: string;
  voxelId?: string;
  update?: {
    status: string;
    healthStatus?: string;
    percentComplete?: number;
    note?: string;
  };
}

/**
 * Server message structure
 */
export interface VoxelServerMessage {
  type: VoxelServerMessageType;
  timestamp: string;
  projectId?: string;
  voxelId?: string;
  data?: VoxelUpdateEvent | ActivityEvent | unknown;
  error?: string;
}

/**
 * Extended WebSocket with client metadata
 */
interface ExtendedVoxelWebSocket extends WebSocket {
  clientId: string;
  userId?: string;
  subscribedProjects: Set<string>;
  subscribedVoxels: Set<string>;
  isAlive: boolean;
  lastActivity: Date;
}

/**
 * WebSocket server statistics
 */
export interface VoxelWebSocketStats {
  totalConnections: number;
  activeProjects: number;
  subscribersByProject: Record<string, number>;
  uptime: number;
  redisPubSub?: {
    enabled: boolean;
    connected: boolean;
    subscribedChannels: number;
    messagesPublished: number;
    messagesReceived: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Heartbeat interval (30 seconds) */
const HEARTBEAT_INTERVAL = 30000;

/** Client timeout (60 seconds) */
const CLIENT_TIMEOUT = 60000;

/** Maximum message size (64KB) */
const MAX_MESSAGE_SIZE = 64 * 1024;

// ============================================================================
// VOXEL STREAM HANDLER CLASS
// ============================================================================

/**
 * WebSocket handler for real-time voxel updates
 */
export class VoxelStreamHandler {
  private wss: WebSocketServer;
  private clients = new Map<string, ExtendedVoxelWebSocket>();
  private projectSubscribers = new Map<string, Set<string>>();
  private voxelSubscribers = new Map<string, Set<string>>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  constructor(httpServer: HTTPServer) {
    // Create WebSocket server attached to HTTP server
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws/voxel-stream',
      maxPayload: MAX_MESSAGE_SIZE,
    });

    this.setupEventHandlers();
    this.startHeartbeat();

    logger.info('✅ Voxel WebSocket server initialized', {
      path: '/ws/voxel-stream',
      maxPayload: MAX_MESSAGE_SIZE,
    });
  }

  /**
   * Sets up WebSocket server event handlers
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws as ExtendedVoxelWebSocket, request);
    });

    this.wss.on('error', (error) => {
      logger.error('[VoxelStream] Server error:', { error: error.message });
    });

    this.wss.on('close', () => {
      logger.info('[VoxelStream] Server closed');
      this.cleanup();
    });
  }

  /**
   * Handles new WebSocket connection
   */
  private handleConnection(ws: ExtendedVoxelWebSocket, request: any): void {
    // Generate unique client ID
    const clientId = `voxel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize client metadata
    ws.clientId = clientId;
    ws.subscribedProjects = new Set();
    ws.subscribedVoxels = new Set();
    ws.isAlive = true;
    ws.lastActivity = new Date();

    // Store client reference
    this.clients.set(clientId, ws);

    logger.info('[VoxelStream] Client connected', {
      clientId,
      ip: request.socket.remoteAddress,
      totalClients: this.clients.size,
    });

    // Send connection confirmation
    this.send(ws, {
      type: 'connection_established',
      timestamp: new Date().toISOString(),
      data: { clientId },
    });

    // Set up client event handlers
    ws.on('message', (data: RawData) => this.handleMessage(ws, data));
    ws.on('pong', () => this.handlePong(ws));
    ws.on('close', () => this.handleClose(ws));
    ws.on('error', (error) => this.handleError(ws, error));
  }

  /**
   * Handles incoming WebSocket message
   */
  private handleMessage(ws: ExtendedVoxelWebSocket, data: RawData): void {
    ws.lastActivity = new Date();

    try {
      const message = JSON.parse(data.toString()) as VoxelClientMessage;

      switch (message.type) {
        case 'subscribe:project':
          this.handleProjectSubscribe(ws, message.projectId!);
          break;
        case 'unsubscribe:project':
          this.handleProjectUnsubscribe(ws, message.projectId!);
          break;
        case 'subscribe:voxel':
          this.handleVoxelSubscribe(ws, message.voxelId!);
          break;
        case 'unsubscribe:voxel':
          this.handleVoxelUnsubscribe(ws, message.voxelId!);
          break;
        case 'ping':
          this.send(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        default:
          this.send(ws, {
            type: 'error',
            timestamp: new Date().toISOString(),
            error: `Unknown message type: ${message.type}`,
          });
      }
    } catch (error) {
      logger.warn('[VoxelStream] Failed to parse message', {
        clientId: ws.clientId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      this.send(ws, {
        type: 'error',
        timestamp: new Date().toISOString(),
        error: 'Invalid message format',
      });
    }
  }

  /**
   * Handles project subscription
   */
  private handleProjectSubscribe(ws: ExtendedVoxelWebSocket, projectId: string): void {
    if (!projectId) {
      this.send(ws, {
        type: 'error',
        timestamp: new Date().toISOString(),
        error: 'Project ID required',
      });
      return;
    }

    // Add to project subscribers
    if (!this.projectSubscribers.has(projectId)) {
      this.projectSubscribers.set(projectId, new Set());
    }
    this.projectSubscribers.get(projectId)!.add(ws.clientId);
    ws.subscribedProjects.add(projectId);

    logger.debug('[VoxelStream] Client subscribed to project', {
      clientId: ws.clientId,
      projectId,
      subscribers: this.projectSubscribers.get(projectId)!.size,
    });

    this.send(ws, {
      type: 'subscribed',
      timestamp: new Date().toISOString(),
      projectId,
      data: { message: `Subscribed to project ${projectId}` },
    });
  }

  /**
   * Handles project unsubscription
   */
  private handleProjectUnsubscribe(ws: ExtendedVoxelWebSocket, projectId: string): void {
    if (this.projectSubscribers.has(projectId)) {
      this.projectSubscribers.get(projectId)!.delete(ws.clientId);
      if (this.projectSubscribers.get(projectId)!.size === 0) {
        this.projectSubscribers.delete(projectId);
      }
    }
    ws.subscribedProjects.delete(projectId);

    this.send(ws, {
      type: 'unsubscribed',
      timestamp: new Date().toISOString(),
      projectId,
    });
  }

  /**
   * Handles voxel subscription
   */
  private handleVoxelSubscribe(ws: ExtendedVoxelWebSocket, voxelId: string): void {
    if (!voxelId) {
      this.send(ws, {
        type: 'error',
        timestamp: new Date().toISOString(),
        error: 'Voxel ID required',
      });
      return;
    }

    if (!this.voxelSubscribers.has(voxelId)) {
      this.voxelSubscribers.set(voxelId, new Set());
    }
    this.voxelSubscribers.get(voxelId)!.add(ws.clientId);
    ws.subscribedVoxels.add(voxelId);

    this.send(ws, {
      type: 'subscribed',
      timestamp: new Date().toISOString(),
      voxelId,
      data: { message: `Subscribed to voxel ${voxelId}` },
    });
  }

  /**
   * Handles voxel unsubscription
   */
  private handleVoxelUnsubscribe(ws: ExtendedVoxelWebSocket, voxelId: string): void {
    if (this.voxelSubscribers.has(voxelId)) {
      this.voxelSubscribers.get(voxelId)!.delete(ws.clientId);
      if (this.voxelSubscribers.get(voxelId)!.size === 0) {
        this.voxelSubscribers.delete(voxelId);
      }
    }
    ws.subscribedVoxels.delete(voxelId);

    this.send(ws, {
      type: 'unsubscribed',
      timestamp: new Date().toISOString(),
      voxelId,
    });
  }

  /**
   * Handles pong response
   */
  private handlePong(ws: ExtendedVoxelWebSocket): void {
    ws.isAlive = true;
    ws.lastActivity = new Date();
  }

  /**
   * Handles client disconnection
   */
  private handleClose(ws: ExtendedVoxelWebSocket): void {
    // Remove from all project subscriptions
    for (const projectId of ws.subscribedProjects) {
      if (this.projectSubscribers.has(projectId)) {
        this.projectSubscribers.get(projectId)!.delete(ws.clientId);
        if (this.projectSubscribers.get(projectId)!.size === 0) {
          this.projectSubscribers.delete(projectId);
        }
      }
    }

    // Remove from all voxel subscriptions
    for (const voxelId of ws.subscribedVoxels) {
      if (this.voxelSubscribers.has(voxelId)) {
        this.voxelSubscribers.get(voxelId)!.delete(ws.clientId);
        if (this.voxelSubscribers.get(voxelId)!.size === 0) {
          this.voxelSubscribers.delete(voxelId);
        }
      }
    }

    // Remove client
    this.clients.delete(ws.clientId);

    logger.info('[VoxelStream] Client disconnected', {
      clientId: ws.clientId,
      remainingClients: this.clients.size,
    });
  }

  /**
   * Handles client error
   */
  private handleError(ws: ExtendedVoxelWebSocket, error: Error): void {
    logger.error('[VoxelStream] Client error', {
      clientId: ws.clientId,
      error: error.message,
    });
  }

  // ============================================================================
  // PUBLIC BROADCAST METHODS
  // ============================================================================

  /**
   * Broadcasts voxel update to all subscribers
   * Called from voxels.routes.ts after status update
   * Also publishes to Redis for cross-instance distribution
   */
  public broadcastVoxelUpdate(update: VoxelUpdateEvent): void {
    // Broadcast to local WebSocket clients
    const recipientCount = this.broadcastToLocalClients(update);

    // Publish to Redis for cross-instance distribution
    const redisPubSub = getRedisPubSubAdapter();
    if (redisPubSub) {
      redisPubSub.publishVoxelUpdate(update).catch((error) => {
        logger.warn('[VoxelStream] Failed to publish to Redis', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      });
    }

    logger.debug('[VoxelStream] Broadcasted voxel update', {
      voxelId: update.voxelId,
      projectId: update.projectId,
      status: update.status,
      recipientCount,
      redisPubSubEnabled: !!redisPubSub,
    });
  }

  /**
   * Broadcast to local WebSocket clients only (used internally and by Redis handler)
   */
  public broadcastToLocalClients(update: VoxelUpdateEvent): number {
    const message: VoxelServerMessage = {
      type: 'voxel:updated',
      timestamp: new Date().toISOString(),
      projectId: update.projectId,
      voxelId: update.voxelId,
      data: update,
    };

    let recipientCount = 0;

    // Send to project subscribers
    const projectSubs = this.projectSubscribers.get(update.projectId);
    if (projectSubs) {
      for (const clientId of projectSubs) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          this.send(client, message);
          recipientCount++;
        }
      }
    }

    // Send to voxel subscribers
    const voxelSubs = this.voxelSubscribers.get(update.voxelId);
    if (voxelSubs) {
      for (const clientId of voxelSubs) {
        // Avoid duplicate sends
        if (projectSubs?.has(clientId)) continue;

        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          this.send(client, message);
          recipientCount++;
        }
      }
    }

    return recipientCount;
  }

  /**
   * Broadcasts batch voxel updates
   * Also publishes to Redis for cross-instance distribution
   */
  public broadcastBatchUpdate(projectId: string, updates: VoxelUpdateEvent[]): void {
    // Broadcast to local clients
    this.broadcastBatchToLocalClients(projectId, updates);

    // Publish to Redis for cross-instance distribution
    const redisPubSub = getRedisPubSubAdapter();
    if (redisPubSub) {
      redisPubSub.publishBatchUpdate(projectId, updates).catch((error) => {
        logger.warn('[VoxelStream] Failed to publish batch to Redis', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      });
    }
  }

  /**
   * Broadcast batch updates to local clients only
   */
  public broadcastBatchToLocalClients(projectId: string, updates: VoxelUpdateEvent[]): number {
    const message: VoxelServerMessage = {
      type: 'voxel:batch_updated',
      timestamp: new Date().toISOString(),
      projectId,
      data: updates,
    };

    let recipientCount = 0;
    const projectSubs = this.projectSubscribers.get(projectId);
    if (projectSubs) {
      for (const clientId of projectSubs) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          this.send(client, message);
          recipientCount++;
        }
      }
    }
    return recipientCount;
  }

  /**
   * Broadcasts new activity event
   * Also publishes to Redis for cross-instance distribution
   */
  public broadcastActivity(activity: ActivityEvent): void {
    // Broadcast to local clients
    this.broadcastActivityToLocalClients(activity);

    // Publish to Redis for cross-instance distribution
    const redisPubSub = getRedisPubSubAdapter();
    if (redisPubSub) {
      redisPubSub.publishActivity(activity).catch((error) => {
        logger.warn('[VoxelStream] Failed to publish activity to Redis', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      });
    }
  }

  /**
   * Broadcast activity to local clients only
   */
  public broadcastActivityToLocalClients(activity: ActivityEvent): number {
    const message: VoxelServerMessage = {
      type: 'activity:new',
      timestamp: new Date().toISOString(),
      projectId: activity.projectId,
      data: activity,
    };

    let recipientCount = 0;
    const projectSubs = this.projectSubscribers.get(activity.projectId);
    if (projectSubs) {
      for (const clientId of projectSubs) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          this.send(client, message);
          recipientCount++;
        }
      }
    }
    return recipientCount;
  }

  /**
   * Handle cross-instance message from Redis Pub/Sub
   * Called by the Redis adapter when a message is received from another instance
   */
  public handleCrossInstanceMessage(channel: string, message: RedisPubSubMessage): void {
    logger.debug('[VoxelStream] Handling cross-instance message', {
      channel,
      type: message.type,
      fromInstance: message.instanceId,
    });

    switch (message.type) {
      case 'voxel:updated':
        this.broadcastToLocalClients(message.payload as VoxelUpdateEvent);
        break;
      case 'voxel:batch_updated':
        const batchPayload = message.payload as VoxelUpdateEvent[];
        if (batchPayload.length > 0) {
          this.broadcastBatchToLocalClients(batchPayload[0].projectId, batchPayload);
        }
        break;
      case 'activity:new':
        this.broadcastActivityToLocalClients(message.payload as ActivityEvent);
        break;
      default:
        logger.warn('[VoxelStream] Unknown cross-instance message type', {
          type: message.type,
        });
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Sends message to client
   */
  private send(ws: ExtendedVoxelWebSocket, message: VoxelServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.warn('[VoxelStream] Failed to send message', {
          clientId: ws.clientId,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }
  }

  /**
   * Starts heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.clients) {
        // Check for stale connections
        if (!client.isAlive) {
          logger.warn('[VoxelStream] Terminating stale connection', { clientId });
          client.terminate();
          continue;
        }

        // Check for timeout
        const lastActivity = client.lastActivity.getTime();
        if (now - lastActivity > CLIENT_TIMEOUT) {
          logger.warn('[VoxelStream] Terminating timed out connection', { clientId });
          client.terminate();
          continue;
        }

        // Mark as not alive and ping
        client.isAlive = false;
        client.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Cleans up resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.close(1001, 'Server shutting down');
    }

    this.clients.clear();
    this.projectSubscribers.clear();
    this.voxelSubscribers.clear();
  }

  /**
   * Gets server statistics including Redis Pub/Sub info
   */
  public getStats(): VoxelWebSocketStats {
    const subscribersByProject: Record<string, number> = {};
    for (const [projectId, subscribers] of this.projectSubscribers) {
      subscribersByProject[projectId] = subscribers.size;
    }

    const stats: VoxelWebSocketStats = {
      totalConnections: this.clients.size,
      activeProjects: this.projectSubscribers.size,
      subscribersByProject,
      uptime: Date.now() - this.startTime,
    };

    // Include Redis Pub/Sub stats if available
    const redisPubSub = getRedisPubSubAdapter();
    if (redisPubSub) {
      const redisStats = redisPubSub.getStats();
      stats.redisPubSub = {
        enabled: true,
        connected: redisStats.isConnected,
        subscribedChannels: redisStats.subscribedChannels,
        messagesPublished: redisStats.messagesPublished,
        messagesReceived: redisStats.messagesReceived,
      };
    } else {
      stats.redisPubSub = {
        enabled: false,
        connected: false,
        subscribedChannels: 0,
        messagesPublished: 0,
        messagesReceived: 0,
      };
    }

    return stats;
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('[VoxelStream] Initiating graceful shutdown');
    this.cleanup();
    this.wss.close();
  }
}

// ============================================================================
// SINGLETON INSTANCE AND FACTORY
// ============================================================================

let voxelStreamHandler: VoxelStreamHandler | null = null;

/**
 * Initializes the voxel stream WebSocket handler
 */
export function initializeVoxelStream(httpServer: HTTPServer): VoxelStreamHandler {
  if (!voxelStreamHandler) {
    voxelStreamHandler = new VoxelStreamHandler(httpServer);
  }
  return voxelStreamHandler;
}

/**
 * Gets the voxel stream handler instance
 */
export function getVoxelStreamHandler(): VoxelStreamHandler | null {
  return voxelStreamHandler;
}
