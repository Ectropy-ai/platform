/**
 * useVoxelStream - Real-time voxel updates via WebSocket
 *
 * Sprint 5 ROS MRO (2026-01-24)
 *
 * Provides React hooks for real-time voxel updates:
 * - WebSocket connection management
 * - Project and voxel subscription
 * - Automatic reconnection with exponential backoff
 * - Integration with React Query cache
 *
 * @module hooks/queries/useVoxelStream
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { voxelKeys, VoxelData, VoxelAggregation, VoxelActivity } from './useVoxels';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * WebSocket connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Voxel update event from server
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
 * Activity event from server
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
 * Server message structure
 */
interface ServerMessage {
  type: string;
  timestamp: string;
  projectId?: string;
  voxelId?: string;
  data?: VoxelUpdateEvent | ActivityEvent | unknown;
  error?: string;
}

/**
 * Hook options
 */
export interface UseVoxelStreamOptions {
  projectId?: string;
  enabled?: boolean;
  onVoxelUpdate?: (event: VoxelUpdateEvent) => void;
  onActivity?: (event: ActivityEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Hook return value
 */
export interface UseVoxelStreamReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  subscribe: (projectId: string) => void;
  unsubscribe: (projectId: string) => void;
  reconnect: () => void;
  lastUpdate: VoxelUpdateEvent | null;
  lastActivity: ActivityEvent | null;
  updateCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WEBSOCKET_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/voxel-stream`;
const RECONNECT_INITIAL_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_MULTIPLIER = 2;
const HEARTBEAT_INTERVAL = 25000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for real-time voxel updates via WebSocket
 * Automatically manages connection, subscriptions, and cache updates
 */
export function useVoxelStream(options: UseVoxelStreamOptions = {}): UseVoxelStreamReturn {
  const {
    projectId,
    enabled = true,
    onVoxelUpdate,
    onActivity,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_INITIAL_DELAY);
  const reconnectAttemptsRef = useRef(0);
  const subscribedProjectsRef = useRef<Set<string>>(new Set());

  // Five Why 2026-03-03: Stabilize connect() deps via refs.
  // Inline callbacks from callers (e.g., onVoxelUpdate arrow fn in ROSMROView)
  // create new refs every render → cascades through useCallback deps:
  // onVoxelUpdate → handleVoxelUpdate → handleMessage → connect → useEffect re-fires
  // → disconnect/connect cycle → 22 rapid-fire WebSocket creations before any can connect.
  // Storing in refs breaks the cascade — connect's useCallback deps stay stable.
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  const onVoxelUpdateRef = useRef(onVoxelUpdate);
  const onActivityRef = useRef(onActivity);
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onErrorRef.current = onError;
  onVoxelUpdateRef.current = onVoxelUpdate;
  onActivityRef.current = onActivity;
  const handleMessageRef = useRef<((event: MessageEvent) => void) | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<VoxelUpdateEvent | null>(null);
  const [lastActivity, setLastActivity] = useState<ActivityEvent | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  /**
   * Sends a message through WebSocket
   */
  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          ...message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }, []);

  /**
   * Subscribes to a project
   */
  const subscribe = useCallback(
    (projectIdToSubscribe: string) => {
      if (!projectIdToSubscribe) {
        return;
      }

      subscribedProjectsRef.current.add(projectIdToSubscribe);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'subscribe:project', projectId: projectIdToSubscribe });
        logger.debug('[VoxelStream] Subscribed to project', { projectId: projectIdToSubscribe });
      }
    },
    [send],
  );

  /**
   * Unsubscribes from a project
   */
  const unsubscribe = useCallback(
    (projectIdToUnsubscribe: string) => {
      subscribedProjectsRef.current.delete(projectIdToUnsubscribe);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'unsubscribe:project', projectId: projectIdToUnsubscribe });
      }
    },
    [send],
  );

  /**
   * Handles voxel update from WebSocket
   */
  const handleVoxelUpdate = useCallback(
    (event: VoxelUpdateEvent) => {
      setLastUpdate(event);
      setUpdateCount(prev => prev + 1);

      // Update React Query cache
      queryClient.setQueryData<{ voxels: VoxelData[]; total: number }>(
        voxelKeys.list(event.projectId),
        oldData => {
          if (!oldData) {
            return oldData;
          }

          const updatedVoxels = oldData.voxels.map(voxel => {
            if (voxel.voxelId === event.voxelId || voxel.id === event.voxelId) {
              return {
                ...voxel,
                status: event.status as VoxelData['status'],
                healthStatus: (event.healthStatus ||
                  voxel.healthStatus) as VoxelData['healthStatus'],
                percentComplete: event.percentComplete ?? voxel.percentComplete,
                updatedAt: event.timestamp,
              };
            }
            return voxel;
          });

          return { ...oldData, voxels: updatedVoxels };
        },
      );

      // Invalidate aggregations to reflect new status
      queryClient.invalidateQueries({
        queryKey: voxelKeys.aggregations(event.projectId),
      });

      // Call user callback via ref (stable — no dep cascade)
      onVoxelUpdateRef.current?.(event);

      logger.debug('[VoxelStream] Voxel update received', {
        voxelId: event.voxelId,
        status: event.status,
      });
    },
    [queryClient],
  );

  /**
   * Handles activity event from WebSocket
   */
  const handleActivity = useCallback(
    (event: ActivityEvent) => {
      setLastActivity(event);

      // Update React Query activity cache
      queryClient.setQueryData<{ activities: VoxelActivity[]; count: number }>(
        voxelKeys.activity(event.projectId),
        oldData => {
          if (!oldData) {
            return oldData;
          }

          const newActivity: VoxelActivity = {
            id: event.id,
            type: event.type as VoxelActivity['type'],
            title: event.title,
            description: event.description,
            timestamp: event.timestamp,
            severity: event.severity,
            voxelId: event.voxelId,
          };

          // Add to beginning, limit to 50
          const activities = [newActivity, ...oldData.activities].slice(0, 50);

          return { activities, count: oldData.count + 1 };
        },
      );

      onActivityRef.current?.(event);
    },
    [queryClient],
  );

  /**
   * Handles incoming WebSocket message
   */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;

        switch (message.type) {
          case 'voxel:updated':
            handleVoxelUpdate(message.data as VoxelUpdateEvent);
            break;
          case 'voxel:batch_updated':
            (message.data as VoxelUpdateEvent[]).forEach(handleVoxelUpdate);
            break;
          case 'activity:new':
            handleActivity(message.data as ActivityEvent);
            break;
          case 'connection_established':
            logger.info('[VoxelStream] Connection established', { data: message.data });
            break;
          case 'subscribed':
            logger.debug('[VoxelStream] Subscription confirmed', { projectId: message.projectId });
            break;
          case 'error':
            logger.warn('[VoxelStream] Server error', { error: message.error });
            onErrorRef.current?.(new Error(message.error || 'Unknown server error'));
            break;
          case 'pong':
            // Heartbeat response, no action needed
            break;
          default:
            logger.debug('[VoxelStream] Unknown message type', { type: message.type });
        }
      } catch (error) {
        logger.warn('[VoxelStream] Failed to parse message', { error });
      }
    },
    [handleVoxelUpdate, handleActivity],
  );

  // Keep handleMessage ref current for stable connect()
  handleMessageRef.current = handleMessage;

  /**
   * Starts heartbeat interval
   */
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      send({ type: 'ping' });
    }, HEARTBEAT_INTERVAL);
  }, [send]);

  /**
   * Stops heartbeat interval
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  /**
   * Connects to WebSocket server
   *
   * Five Why 2026-03-03: Guard against re-entry after max reconnect attempts.
   * React useEffect re-triggers connect() on state changes (onerror sets 'error'
   * → re-render → new connect ref → useEffect fires). Without this guard,
   * the counter in onclose is bypassed and reconnects loop infinitely.
   */
  const connect = useCallback(() => {
    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      return;
    }

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(WEBSOCKET_URL);

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectDelayRef.current = RECONNECT_INITIAL_DELAY;
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
        onConnectRef.current?.();

        // Re-subscribe to projects
        for (const projectIdToSubscribe of subscribedProjectsRef.current) {
          send({ type: 'subscribe:project', projectId: projectIdToSubscribe });
        }

        logger.info('[VoxelStream] Connected');
      };

      ws.onmessage = event => handleMessageRef.current?.(event);

      // Five Why 2026-03-03: onerror always fires BEFORE onclose per WebSocket spec.
      // Do NOT set connectionState here — it triggers React re-render before onclose
      // can update the attempt counter, causing connect() to be called again via
      // useEffect before the guard has a chance to stop it.
      ws.onerror = error => {
        logger.error('[VoxelStream] WebSocket error', { error });
      };

      ws.onclose = event => {
        stopHeartbeat();
        onDisconnectRef.current?.();

        // Schedule reconnection if not intentionally closed
        if (event.code !== 1000 && enabled) {
          reconnectAttemptsRef.current += 1;

          if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
            setConnectionState('error');
            logger.warn('[VoxelStream] Max reconnection attempts reached', {
              attempts: reconnectAttemptsRef.current,
            });
            onErrorRef.current?.(new Error('Max reconnection attempts reached'));
            return;
          }

          setConnectionState('disconnected');

          const delay = reconnectDelayRef.current;
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(delay * RECONNECT_MULTIPLIER, RECONNECT_MAX_DELAY);
            connect();
          }, delay);

          logger.info('[VoxelStream] Scheduling reconnection', {
            delay,
            attempt: reconnectAttemptsRef.current,
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
          });
        } else {
          setConnectionState('disconnected');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      setConnectionState('error');
      logger.error('[VoxelStream] Failed to create WebSocket', { error });
      onErrorRef.current?.(error as Error);
    }
  }, [enabled, startHeartbeat, stopHeartbeat, send]);

  /**
   * Disconnects from WebSocket server
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    stopHeartbeat();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Intentional disconnect');
      wsRef.current = null;
    }
  }, [stopHeartbeat]);

  /**
   * Forces reconnection
   */
  const reconnect = useCallback(() => {
    disconnect();
    reconnectDelayRef.current = RECONNECT_INITIAL_DELAY;
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, disconnect]);

  // Connect when enabled
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Subscribe to project when projectId changes
  useEffect(() => {
    if (projectId && connectionState === 'connected') {
      subscribe(projectId);

      return () => {
        unsubscribe(projectId);
      };
    }
  }, [projectId, connectionState, subscribe, unsubscribe]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    subscribe,
    unsubscribe,
    reconnect,
    lastUpdate,
    lastActivity,
    updateCount,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export default useVoxelStream;
