/**
 * ============================================================================
 * WEBSOCKET HANDLER - REAL-TIME DEMO PLAYBACK
 * ============================================================================
 * Production-ready WebSocket server for demo scenario playback events.
 * Enables real-time timeline updates, event notifications, and multi-client
 * synchronized demo viewing.
 *
 * @module api-gateway/websocket
 * @version 2.0.0
 * ============================================================================
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import {
  getPlaybackManager,
  type PlaybackController,
} from '../../../../libs/demo-scenarios/src/services/playback.service.js';
import type { PlaybackUpdate } from '../../../../libs/demo-scenarios/src/types/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Client message types
 */
export type ClientMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'playback_control'
  | 'ping';

/**
 * Server message types
 */
export type ServerMessageType =
  | 'subscribed'
  | 'unsubscribed'
  | 'playback_update'
  | 'error'
  | 'pong'
  | 'connection_established';

/**
 * Base message interface
 */
interface BaseMessage {
  type: string;
  timestamp: string;
}

/**
 * Client-to-server message
 */
export interface ClientMessage extends BaseMessage {
  type: ClientMessageType;
  instanceId?: string;
  action?: 'play' | 'pause' | 'stop' | 'reset';
  speed?: number;
}

/**
 * Server-to-client message
 */
export interface ServerMessage extends BaseMessage {
  type: ServerMessageType;
  instanceId?: string;
  data?: unknown;
  error?: string;
}

/**
 * Extended WebSocket with client metadata
 */
interface ExtendedWebSocket extends WebSocket {
  clientId: string;
  subscribedInstances: Set<string>;
  isAlive: boolean;
  lastActivity: Date;
}

/**
 * WebSocket server statistics
 */
export interface WebSocketStats {
  totalConnections: number;
  activeInstances: number;
  subscribersByInstance: Record<string, number>;
  uptime: number;
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
// WEBSOCKET HANDLER CLASS
// ============================================================================

/**
 * WebSocket handler for real-time demo playback
 */
export class WebSocketHandler {
  private wss: WebSocketServer;
  private clients = new Map<string, ExtendedWebSocket>();
  private instanceSubscribers = new Map<string, Set<string>>();
  private playbackUnsubscribers = new Map<string, () => void>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  constructor(httpServer: HTTPServer) {
    // WS FIX 2026-03-14: noServer mode — upgrade routed by main.ts
    // ws v8.19.0 abortHandshake(400) on path mismatch kills socket for other WSS instances
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_MESSAGE_SIZE,
    });

    this.setupEventHandlers();
    this.startHeartbeat();

    logger.info('✅ WebSocket server initialized', {
      path: '/ws/demo-playback',
      maxPayload: MAX_MESSAGE_SIZE,
    });
  }

  /**
   * Sets up WebSocket server event handlers
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws as ExtendedWebSocket, request);
    });

    this.wss.on('error', (error) => {
      logger.error('[WebSocket] Server error:', { error: error.message });
    });

    this.wss.on('close', () => {
      logger.info('[WebSocket] Server closed');
      this.cleanup();
    });
  }

  /**
   * Handles new WebSocket connection
   */
  private handleConnection(ws: ExtendedWebSocket, request: any): void {
    // Generate unique client ID
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize client metadata
    ws.clientId = clientId;
    ws.subscribedInstances = new Set();
    ws.isAlive = true;
    ws.lastActivity = new Date();

    // Store client reference
    this.clients.set(clientId, ws);

    logger.info('[WebSocket] Client connected', {
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
  private handleMessage(ws: ExtendedWebSocket, data: RawData): void {
    ws.lastActivity = new Date();

    try {
      const message: ClientMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, message.instanceId);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(ws, message.instanceId);
          break;

        case 'playback_control':
          this.handlePlaybackControl(ws, message);
          break;

        case 'ping':
          this.send(ws, {
            type: 'pong',
            timestamp: new Date().toISOString(),
          });
          break;

        default:
          this.sendError(ws, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.warn('[WebSocket] Invalid message format', {
        clientId: ws.clientId,
        error: error instanceof Error ? error.message : 'Parse error',
      });
      this.sendError(ws, 'Invalid message format');
    }
  }

  /**
   * Handles instance subscription
   */
  private handleSubscribe(ws: ExtendedWebSocket, instanceId?: string): void {
    if (!instanceId) {
      this.sendError(ws, 'Instance ID required for subscription');
      return;
    }

    // Add to client's subscriptions
    ws.subscribedInstances.add(instanceId);

    // Add to instance subscriber list
    if (!this.instanceSubscribers.has(instanceId)) {
      this.instanceSubscribers.set(instanceId, new Set());
      this.attachPlaybackListener(instanceId);
    }
    this.instanceSubscribers.get(instanceId)!.add(ws.clientId);

    logger.debug('[WebSocket] Client subscribed to instance', {
      clientId: ws.clientId,
      instanceId,
      subscriberCount: this.instanceSubscribers.get(instanceId)!.size,
    });

    // Send confirmation with current playback state
    const playbackManager = getPlaybackManager();
    const controller = playbackManager.getController(instanceId);

    this.send(ws, {
      type: 'subscribed',
      timestamp: new Date().toISOString(),
      instanceId,
      data: controller ? controller.getState() : null,
    });
  }

  /**
   * Handles instance unsubscription
   */
  private handleUnsubscribe(ws: ExtendedWebSocket, instanceId?: string): void {
    if (!instanceId) {
      // Unsubscribe from all instances
      ws.subscribedInstances.forEach((id) => {
        this.removeSubscriber(ws.clientId, id);
      });
      ws.subscribedInstances.clear();
    } else {
      // Unsubscribe from specific instance
      ws.subscribedInstances.delete(instanceId);
      this.removeSubscriber(ws.clientId, instanceId);
    }

    this.send(ws, {
      type: 'unsubscribed',
      timestamp: new Date().toISOString(),
      instanceId,
    });
  }

  /**
   * Handles playback control commands
   */
  private handlePlaybackControl(
    ws: ExtendedWebSocket,
    message: ClientMessage
  ): void {
    const { instanceId, action, speed } = message;

    if (!instanceId) {
      this.sendError(ws, 'Instance ID required for playback control');
      return;
    }

    const playbackManager = getPlaybackManager();
    const controller = playbackManager.getController(instanceId);

    if (!controller) {
      this.sendError(ws, `No active playback for instance: ${instanceId}`);
      return;
    }

    try {
      switch (action) {
        case 'play':
          controller.play();
          break;
        case 'pause':
          controller.pause();
          break;
        case 'stop':
          controller.stop();
          break;
        case 'reset':
          controller.reset();
          break;
        default:
          if (speed !== undefined) {
            controller.setSpeed(speed as any);
          } else {
            this.sendError(ws, `Unknown playback action: ${action}`);
          }
      }
    } catch (error) {
      this.sendError(
        ws,
        `Playback control error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Attaches playback event listener for an instance
   */
  private attachPlaybackListener(instanceId: string): void {
    const playbackManager = getPlaybackManager();
    const controller = playbackManager.getController(instanceId);

    if (!controller) {
      logger.debug('[WebSocket] No controller for instance', { instanceId });
      return;
    }

    // Subscribe to playback events
    const unsubscribe = controller.onEvent((update: PlaybackUpdate) => {
      this.broadcastToInstance(instanceId, {
        type: 'playback_update',
        timestamp: new Date().toISOString(),
        instanceId,
        data: update,
      });
    });

    this.playbackUnsubscribers.set(instanceId, unsubscribe);

    logger.debug('[WebSocket] Attached playback listener', { instanceId });
  }

  /**
   * Removes subscriber from instance
   */
  private removeSubscriber(clientId: string, instanceId: string): void {
    const subscribers = this.instanceSubscribers.get(instanceId);
    if (subscribers) {
      subscribers.delete(clientId);

      // Clean up if no more subscribers
      if (subscribers.size === 0) {
        this.instanceSubscribers.delete(instanceId);

        // Detach playback listener
        const unsubscribe = this.playbackUnsubscribers.get(instanceId);
        if (unsubscribe) {
          unsubscribe();
          this.playbackUnsubscribers.delete(instanceId);
        }

        logger.debug('[WebSocket] Removed last subscriber, cleaned up', {
          instanceId,
        });
      }
    }
  }

  /**
   * Broadcasts message to all subscribers of an instance
   */
  private broadcastToInstance(instanceId: string, message: ServerMessage): void {
    const subscribers = this.instanceSubscribers.get(instanceId);
    if (!subscribers || subscribers.size === 0) return;

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    subscribers.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
        sentCount++;
      }
    });

    logger.debug('[WebSocket] Broadcast to instance', {
      instanceId,
      subscribers: subscribers.size,
      sent: sentCount,
      eventType: (message.data as PlaybackUpdate)?.type,
    });
  }

  /**
   * Sends message to a specific client
   */
  private send(ws: ExtendedWebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Sends error message to client
   */
  private sendError(ws: ExtendedWebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      timestamp: new Date().toISOString(),
      error,
    });
  }

  /**
   * Handles pong response (heartbeat)
   */
  private handlePong(ws: ExtendedWebSocket): void {
    ws.isAlive = true;
    ws.lastActivity = new Date();
  }

  /**
   * Handles client connection close
   */
  private handleClose(ws: ExtendedWebSocket): void {
    // Clean up subscriptions
    ws.subscribedInstances.forEach((instanceId) => {
      this.removeSubscriber(ws.clientId, instanceId);
    });

    // Remove client
    this.clients.delete(ws.clientId);

    logger.info('[WebSocket] Client disconnected', {
      clientId: ws.clientId,
      remainingClients: this.clients.size,
    });
  }

  /**
   * Handles client error
   */
  private handleError(ws: ExtendedWebSocket, error: Error): void {
    logger.warn('[WebSocket] Client error', {
      clientId: ws.clientId,
      error: error.message,
    });
  }

  /**
   * Starts heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      this.clients.forEach((ws, clientId) => {
        // Check for dead connections
        if (!ws.isAlive) {
          logger.info('[WebSocket] Terminating inactive client', { clientId });
          ws.terminate();
          return;
        }

        // Check for timeout
        const inactiveMs = now - ws.lastActivity.getTime();
        if (inactiveMs > CLIENT_TIMEOUT) {
          logger.info('[WebSocket] Client timed out', {
            clientId,
            inactiveMs,
          });
          ws.terminate();
          return;
        }

        // Send ping
        ws.isAlive = false;
        ws.ping();
      });
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

    // Unsubscribe from all playback events
    this.playbackUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.playbackUnsubscribers.clear();

    // Close all clients
    this.clients.forEach((ws) => ws.close());
    this.clients.clear();
    this.instanceSubscribers.clear();
  }

  /**
   * Exposes underlying WebSocketServer for noServer upgrade routing
   */
  public getWss(): WebSocketServer {
    return this.wss;
  }

  /**
   * Gets server statistics
   */
  public getStats(): WebSocketStats {
    const subscribersByInstance: Record<string, number> = {};
    this.instanceSubscribers.forEach((subscribers, instanceId) => {
      subscribersByInstance[instanceId] = subscribers.size;
    });

    return {
      totalConnections: this.clients.size,
      activeInstances: this.instanceSubscribers.size,
      subscribersByInstance,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Broadcasts message to all connected clients
   */
  public broadcast(message: ServerMessage): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  /**
   * Notifies clients when a new playback controller is created
   * Call this from admin routes when instantiating a scenario
   */
  public notifyControllerCreated(instanceId: string): void {
    // Check if there are existing subscribers waiting for this instance
    if (this.instanceSubscribers.has(instanceId)) {
      this.attachPlaybackListener(instanceId);
    }
  }

  /**
   * Gracefully closes the WebSocket server
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.cleanup();
      this.wss.close(() => {
        logger.info('[WebSocket] Server closed gracefully');
        resolve();
      });
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let handlerInstance: WebSocketHandler | null = null;

/**
 * Initializes the WebSocket server
 */
export function initializeWebSocket(httpServer: HTTPServer): WebSocketHandler {
  if (handlerInstance) {
    logger.warn('[WebSocket] Handler already initialized, returning existing');
    return handlerInstance;
  }

  handlerInstance = new WebSocketHandler(httpServer);
  return handlerInstance;
}

/**
 * Gets the WebSocket handler instance
 */
export function getWebSocketHandler(): WebSocketHandler | null {
  return handlerInstance;
}

/**
 * Resets the WebSocket handler (for testing)
 */
export async function resetWebSocketHandler(): Promise<void> {
  if (handlerInstance) {
    await handlerInstance.close();
    handlerInstance = null;
  }
}
