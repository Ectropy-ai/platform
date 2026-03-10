/**
 * Speckle Configuration Hook
 *
 * SPRINT 5: Enterprise Speckle Token Management (2026-01-23)
 *
 * Implements IETF BFF pattern for secure token management:
 * - Token NEVER sent to client
 * - Configuration fetched at runtime via secure backend endpoint
 * - Token validity checked server-side
 * - Graceful error handling for token issues
 *
 * Industry Pattern Validation:
 * - IETF OAuth Browser-Based Apps draft
 * - Auth0 BFF Pattern
 * - Duende BFF Security Framework
 * - Curity Token Handler Pattern
 *
 * @see apps/mcp-server/data/documentation/apps/web-dashboard-speckle-token-architecture.json
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { config } from '../../services/config';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Speckle configuration returned from backend
 * Note: Token is NEVER included - only status
 */
export interface SpeckleConfig {
  /** Speckle server URL for API calls */
  serverUrl: string;
  /** Speckle frontend URL for viewer */
  frontendUrl: string;
  /** Demo stream ID (if available) */
  demoStreamId?: string;
  /** Demo object ID (if available) */
  demoObjectId?: string;
  /** Token validity status (validated server-side) */
  tokenStatus: 'valid' | 'expired' | 'invalid' | 'not_configured';
  /** Token expiration date (if available) */
  tokenExpiresAt?: string;
  /** Whether Speckle integration is enabled */
  enabled: boolean;
}

/**
 * Response from /api/config/speckle endpoint
 */
interface SpeckleConfigResponse {
  data: SpeckleConfig;
  status: 'success' | 'error';
  message?: string;
}

export interface UseSpeckleConfigOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Stale time in milliseconds (default: 5 minutes) */
  staleTime?: number;
  /** Retry on failure (default: 2) */
  retry?: number;
}

export interface UseSpeckleConfigReturn {
  /** Speckle configuration */
  config: SpeckleConfig | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether token is valid */
  isTokenValid: boolean;
  /** Whether Speckle is available (enabled + valid token) */
  isAvailable: boolean;
  /** Refetch configuration */
  refetch: () => Promise<void>;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const speckleConfigKeys = {
  all: ['speckle-config'] as const,
  config: () => [...speckleConfigKeys.all, 'config'] as const,
};

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetch Speckle configuration from backend
 * Backend validates token server-side - token never sent to client
 */
async function fetchSpeckleConfig(): Promise<SpeckleConfig> {
  const apiUrl = config.apiBaseUrl;
  // SPRINT 6: Use the Speckle routes config endpoint (BFF pattern)
  const endpoint = `${apiUrl}/api/speckle/config`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include', // Include session cookies for authentication
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!response.ok) {
      // Handle specific error cases
      if (response.status === 401) {
        logger.warn('Speckle config: Authentication required');
        // Return degraded config for unauthenticated users
        return {
          serverUrl: config.speckleServerUrl || '',
          frontendUrl: config.speckleFrontendUrl || '',
          tokenStatus: 'not_configured',
          enabled: false,
        };
      }

      if (response.status === 503) {
        logger.warn('Speckle config: Service unavailable');
        return {
          serverUrl: config.speckleServerUrl || '',
          frontendUrl: config.speckleFrontendUrl || '',
          tokenStatus: 'invalid',
          enabled: false,
        };
      }

      throw new Error(`Failed to fetch Speckle config: ${response.status}`);
    }

    const result: SpeckleConfigResponse = await response.json();

    if (result.status === 'error') {
      throw new Error(result.message || 'Failed to fetch Speckle configuration');
    }

    return result.data;
  } catch (error) {
    logger.error('Failed to fetch Speckle config:', { error });

    // SPRINT 5: Graceful degradation - return fallback config from environment
    // This allows the app to function with reduced Speckle capabilities
    // when the config endpoint is unavailable
    return {
      serverUrl: config.speckleServerUrl || '',
      frontendUrl: config.speckleFrontendUrl || '',
      demoStreamId: config.demoSpeckleStreamId,
      demoObjectId: config.demoSpeckleObjectId,
      tokenStatus: 'not_configured',
      enabled: false,
    };
  }
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for fetching Speckle configuration with enterprise security
 *
 * SECURITY: Token is validated server-side and NEVER sent to client.
 * This follows IETF BFF pattern recommendations for browser-based apps.
 *
 * @example
 * ```tsx
 * function BIMViewer() {
 *   const { config, isLoading, isAvailable, error } = useSpeckleConfig();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (!isAvailable) return <SpeckleUnavailableMessage error={error} />;
 *
 *   return (
 *     <SpeckleBIMViewer
 *       serverUrl={config.serverUrl}
 *       streamId={config.demoStreamId}
 *       objectId={config.demoObjectId}
 *     />
 *   );
 * }
 * ```
 */
export function useSpeckleConfig(options: UseSpeckleConfigOptions = {}): UseSpeckleConfigReturn {
  const { enabled = true, staleTime = 5 * 60 * 1000, retry = 2 } = options;

  const queryOptions: UseQueryOptions<SpeckleConfig, Error> = {
    queryKey: speckleConfigKeys.config(),
    queryFn: fetchSpeckleConfig,
    enabled,
    staleTime,
    retry,
    // Cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    // Don't refetch on window focus for config
    refetchOnWindowFocus: false,
  };

  const query = useQuery(queryOptions);

  const speckleConfig = query.data ?? null;
  const isTokenValid = speckleConfig?.tokenStatus === 'valid';
  const isAvailable = speckleConfig?.enabled === true && isTokenValid;

  return {
    config: speckleConfig,
    isLoading: query.isLoading,
    error: query.error,
    isTokenValid,
    isAvailable,
    refetch: async () => {
      await query.refetch();
    },
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get human-readable token status message
 */
export function getTokenStatusMessage(status: SpeckleConfig['tokenStatus']): string {
  switch (status) {
    case 'valid':
      return 'Speckle connection established';
    case 'expired':
      return 'Speckle token has expired. Please contact administrator.';
    case 'invalid':
      return 'Speckle token is invalid. Please contact administrator.';
    case 'not_configured':
      return 'Speckle integration is not configured.';
    default:
      return 'Unknown Speckle configuration status';
  }
}

/**
 * Check if Speckle error is recoverable
 */
export function isRecoverableSpeckleError(status: SpeckleConfig['tokenStatus']): boolean {
  // Only 'not_configured' is potentially recoverable (config endpoint unavailable)
  return status === 'not_configured';
}
