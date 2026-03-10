/**
 * ============================================================================
 * HOOKS - Central Export
 * ============================================================================
 * All custom React hooks exported from a single location.
 *
 * @module web-dashboard/hooks
 * ============================================================================
 */

// Real data hook
export { useRealData } from './useRealData';

// WebSocket hooks
export {
  usePlaybackWebSocket,
  type WebSocketConnectionState,
  type PlaybackUpdate,
  type TimelinePosition,
  type PlaybackState,
  type UsePlaybackWebSocketOptions,
  type UsePlaybackWebSocketReturn,
} from './usePlaybackWebSocket';

// Re-export query hooks for convenience
export * from './queries';
