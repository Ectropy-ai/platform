/**
 * ============================================================================
 * PLAYBACK WEBSOCKET HOOK
 * ============================================================================
 * React hook for real-time demo playback updates via WebSocket.
 * Integrates with React Query for automatic cache synchronization.
 *
 * @module web-dashboard/hooks
 * @version 1.0.0
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../contexts/DataProvider';
import { logger } from '../services/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * WebSocket connection states
 */
export type WebSocketConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Server message types
 */
type ServerMessageType =
  | 'subscribed'
  | 'unsubscribed'
  | 'playback_update'
  | 'error'
  | 'pong'
  | 'connection_established';

/**
 * Server message interface
 */
interface ServerMessage {
  type: ServerMessageType;
  timestamp: string;
  instanceId?: string;
  data?: unknown;
  error?: string;
}

/**
 * Playback update from server
 */
export interface PlaybackUpdate {
  type: 'event_executed' | 'milestone_reached' | 'position_changed' | 'state_changed';
  instanceId: string;
  timestamp: string;
  data: {
    event?: unknown;
    milestone?: unknown;
    position?: TimelinePosition;
    state?: string;
    speed?: number;
    jumped?: boolean;
  };
}

/**
 * Timeline position
 */
export interface TimelinePosition {
  week: number;
  day: number;
  hour: number;
}

/**
 * Playback state from server
 */
export interface PlaybackState {
  instanceId: string;
  position: TimelinePosition;
  speed: number;
  isPlaying: boolean;
  nextEvent?: unknown;
  executedEvents: string[];
  startedAt?: string;
  elapsedMs: number;
}

/**
 * Hook options
 */
export interface UsePlaybackWebSocketOptions {
  /** Instance ID to subscribe to */
  instanceId?: string;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Enable reconnection (default: true) */
  enableReconnect?: boolean;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Reconnection delay in ms (default: 2000) */
  reconnectDelay?: number;
  /** Callback for playback updates */
  onPlaybackUpdate?: (update: PlaybackUpdate) => void;
  /** Callback for errors */
  onError?: (error: string) => void;
  /** Callback for connection state changes */
  onConnectionChange?: (state: WebSocketConnectionState) => void;
}

/**
 * Hook return value
 */
export interface UsePlaybackWebSocketReturn {
  /** Current connection state */
  connectionState: WebSocketConnectionState;
  /** Whether connected */
  isConnected: boolean;
  /** Latest playback state */
  playbackState: PlaybackState | null;
  /** Latest playback update */
  lastUpdate: PlaybackUpdate | null;
  /** Client ID assigned by server */
  clientId: string | null;
  /** Error message if any */
  error: string | null;
  /** Connect to WebSocket */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Subscribe to an instance */
  subscribe: (instanceId: string) => void;
  /** Unsubscribe from an instance */
  unsubscribe: (instanceId?: string) => void;
  /** Send playback control command */
  sendControl: (action: 'play' | 'pause' | 'stop' | 'reset', speed?: number) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ping interval for keeping connection alive (25 seconds) */
const PING_INTERVAL = 25000;

/** Default reconnect delay */
const DEFAULT_RECONNECT_DELAY = 2000;

/** Maximum reconnect attempts */
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Gets the WebSocket URL based on current environment
 */
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_API_HOST || window.location.host;
  return `${protocol}//${host}/ws/demo-playback`;
}

/**
 * React hook for real-time playback WebSocket connection
 *
 * @example
 * ```tsx
 * function PlaybackViewer({ instanceId }: { instanceId: string }) {
 *   const {
 *     connectionState,
 *     playbackState,
 *     lastUpdate,
 *     sendControl,
 *   } = usePlaybackWebSocket({
 *     instanceId,
 *     onPlaybackUpdate: (update) => {
 *       console.log('Playback update:', update);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <p>Status: {connectionState}</p>
 *       {playbackState && (
 *         <p>Position: Week {playbackState.position.week}, Day {playbackState.position.day}</p>
 *       )}
 *       <button onClick={() => sendControl('play')}>Play</button>
 *       <button onClick={() => sendControl('pause')}>Pause</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlaybackWebSocket(
  options: UsePlaybackWebSocketOptions = {}
): UsePlaybackWebSocketReturn {
  const {
    instanceId,
    autoConnect = true,
    enableReconnect = true,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
    onPlaybackUpdate,
    onError,
    onConnectionChange,
  } = options;

  // React Query client for cache updates
  const queryClient = useQueryClient();

  // State
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [lastUpdate, setLastUpdate] = useState<PlaybackUpdate | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for WebSocket and intervals
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedInstanceRef = useRef<string | null>(null);

  // Ref for callbacks to avoid stale closures
  const callbacksRef = useRef({ onPlaybackUpdate, onError, onConnectionChange });
  useEffect(() => {
    callbacksRef.current = { onPlaybackUpdate, onError, onConnectionChange };
  }, [onPlaybackUpdate, onError, onConnectionChange]);

  /**
   * Updates connection state and notifies callback
   */
  const updateConnectionState = useCallback((state: WebSocketConnectionState) => {
    setConnectionState(state);
    callbacksRef.current.onConnectionChange?.(state);
  }, []);

  /**
   * Handles WebSocket messages
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: ServerMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'connection_established':
          setClientId((message.data as { clientId: string })?.clientId);
          logger.debug('[WebSocket] Connection established', { clientId: (message.data as { clientId: string })?.clientId });
          break;

        case 'subscribed':
          if (message.data) {
            setPlaybackState(message.data as PlaybackState);
          }
          logger.debug('[WebSocket] Subscribed to instance', { instanceId: message.instanceId });
          break;

        case 'unsubscribed':
          logger.debug('[WebSocket] Unsubscribed from instance', { instanceId: message.instanceId });
          break;

        case 'playback_update': {
          const update = message.data as PlaybackUpdate;
          setLastUpdate(update);

          // Update playback state based on update type
          if (update.type === 'state_changed' || update.type === 'position_changed') {
            setPlaybackState((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                ...(update.data.position && { position: update.data.position }),
                ...(update.data.state && { isPlaying: update.data.state === 'playing' }),
                ...(update.data.speed !== undefined && { speed: update.data.speed }),
              };
            });
          }

          // Invalidate React Query cache for the instance
          if (message.instanceId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.scenarios.instances.playback(message.instanceId),
            });
          }

          // Notify callback
          callbacksRef.current.onPlaybackUpdate?.(update);

          logger.debug('[WebSocket] Playback update received', {
            type: update.type,
            instanceId: message.instanceId,
          });
          break;
        }

        case 'error':
          setError(message.error || 'Unknown error');
          callbacksRef.current.onError?.(message.error || 'Unknown error');
          logger.warn('[WebSocket] Server error', { error: message.error });
          break;

        case 'pong':
          // Heartbeat response - connection is alive
          break;

        default:
          logger.warn('[WebSocket] Unknown message type', { type: message.type });
      }
    } catch (err) {
      logger.error('[WebSocket] Failed to parse message', { error: err });
    }
  }, [queryClient]);

  /**
   * Sends a message through WebSocket
   */
  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString(),
      }));
    } else {
      logger.warn('[WebSocket] Cannot send message - not connected');
    }
  }, []);

  /**
   * Starts ping interval
   */
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, PING_INTERVAL);
  }, [sendMessage]);

  /**
   * Stops ping interval
   */
  const stopPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  /**
   * Attempts to reconnect
   */
  const attemptReconnect = useCallback(() => {
    if (!enableReconnect) return;

    if (reconnectAttemptRef.current >= maxReconnectAttempts) {
      logger.warn('[WebSocket] Max reconnect attempts reached');
      updateConnectionState('error');
      setError('Connection failed after max retries');
      return;
    }

    reconnectAttemptRef.current++;
    updateConnectionState('reconnecting');

    logger.info('[WebSocket] Attempting reconnect', {
      attempt: reconnectAttemptRef.current,
      maxAttempts: maxReconnectAttempts,
    });

    // Exponential backoff
    const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptRef.current - 1);
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [enableReconnect, maxReconnectAttempts, reconnectDelay, updateConnectionState]);

  /**
   * Connects to WebSocket server
   */
  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const url = getWebSocketUrl();
    updateConnectionState('connecting');
    setError(null);

    logger.info('[WebSocket] Connecting', { url });

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        logger.info('[WebSocket] Connected');
        updateConnectionState('connected');
        reconnectAttemptRef.current = 0;
        startPingInterval();

        // Re-subscribe to instance if we were previously subscribed
        if (subscribedInstanceRef.current) {
          sendMessage({
            type: 'subscribe',
            instanceId: subscribedInstanceRef.current,
          });
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        logger.error('[WebSocket] Error', { event });
        setError('WebSocket error occurred');
      };

      ws.onclose = (event) => {
        logger.info('[WebSocket] Closed', { code: event.code, reason: event.reason });
        stopPingInterval();
        wsRef.current = null;

        if (event.code !== 1000) {
          // Abnormal close - attempt reconnect
          attemptReconnect();
        } else {
          updateConnectionState('disconnected');
        }
      };
    } catch (err) {
      logger.error('[WebSocket] Failed to create connection', { error: err });
      setError('Failed to create WebSocket connection');
      updateConnectionState('error');
    }
  }, [handleMessage, startPingInterval, stopPingInterval, attemptReconnect, updateConnectionState, sendMessage]);

  /**
   * Disconnects from WebSocket server
   */
  const disconnect = useCallback(() => {
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Stop ping interval
    stopPingInterval();

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    // Reset state
    subscribedInstanceRef.current = null;
    reconnectAttemptRef.current = 0;
    updateConnectionState('disconnected');

    logger.info('[WebSocket] Disconnected by user');
  }, [stopPingInterval, updateConnectionState]);

  /**
   * Subscribes to an instance
   */
  const subscribe = useCallback((id: string) => {
    subscribedInstanceRef.current = id;
    sendMessage({
      type: 'subscribe',
      instanceId: id,
    });
  }, [sendMessage]);

  /**
   * Unsubscribes from an instance
   */
  const unsubscribe = useCallback((id?: string) => {
    if (!id) {
      subscribedInstanceRef.current = null;
    } else if (subscribedInstanceRef.current === id) {
      subscribedInstanceRef.current = null;
    }
    sendMessage({
      type: 'unsubscribe',
      instanceId: id,
    });
    setPlaybackState(null);
  }, [sendMessage]);

  /**
   * Sends playback control command
   */
  const sendControl = useCallback((
    action: 'play' | 'pause' | 'stop' | 'reset',
    speed?: number
  ) => {
    if (!subscribedInstanceRef.current) {
      logger.warn('[WebSocket] Cannot send control - not subscribed to any instance');
      return;
    }

    sendMessage({
      type: 'playback_control',
      instanceId: subscribedInstanceRef.current,
      action,
      speed,
    });
  }, [sendMessage]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-subscribe when instanceId changes
  useEffect(() => {
    if (instanceId && connectionState === 'connected') {
      subscribe(instanceId);
    }

    return () => {
      if (instanceId && connectionState === 'connected') {
        unsubscribe(instanceId);
      }
    };
  }, [instanceId, connectionState]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    playbackState,
    lastUpdate,
    clientId,
    error,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    sendControl,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default usePlaybackWebSocket;
