/**
 * useStructuralAlerts - Shared hook for structural alert data
 *
 * ENTERPRISE DATA LAYER (Sprint 5 - 2026-01-24)
 *
 * Provides centralized structural alert data fetching with:
 * - Project-scoped queries
 * - Automatic caching and deduplication
 * - Loading and error states
 * - Alert statistics
 * - Type-safe return values
 *
 * @example
 * ```tsx
 * function AlertPanel({ projectId }: { projectId: string }) {
 *   const { alerts, stats, isLoading, error } = useStructuralAlerts(projectId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Alert severity="error">{error.message}</Alert>;
 *
 *   return (
 *     <AlertList
 *       alerts={alerts}
 *       onAcknowledge={handleAcknowledge}
 *     />
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, StructuralAlert, AlertStats, AlertSeverity } from '../../services/api';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface UseStructuralAlertsOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Refetch interval (ms, 0 to disable) */
  refetchInterval?: number;
  /** Filter by severity */
  severity?: AlertSeverity;
  /** Filter by acknowledgment status */
  acknowledged?: boolean;
}

export interface UseStructuralAlertsReturn {
  /** List of structural alerts */
  alerts: StructuralAlert[];
  /** Alert statistics */
  stats: AlertStats | null;
  /** Loading state */
  isLoading: boolean;
  /** Fetching state (background refetch) */
  isFetching: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
  /** Total count (before filtering) */
  totalCount: number;
  /** Count of critical/error alerts */
  criticalCount: number;
}

export interface UseAlertReturn {
  /** Single alert */
  alert: StructuralAlert | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const alertQueryKeys = {
  all: ['alerts'] as const,
  lists: () => [...alertQueryKeys.all, 'list'] as const,
  list: (projectId: string, filters?: Record<string, unknown>) =>
    [...alertQueryKeys.lists(), projectId, filters] as const,
  details: () => [...alertQueryKeys.all, 'detail'] as const,
  detail: (alertId: string) => [...alertQueryKeys.details(), alertId] as const,
};

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchAlerts(
  projectId?: string,
  filters?: { severity?: AlertSeverity; acknowledged?: boolean },
): Promise<{ alerts: StructuralAlert[]; stats: AlertStats | null }> {
  logger.debug('Fetching structural alerts', { projectId, filters });

  const alerts = await apiService.getStructuralAlerts(projectId, filters);

  // Calculate stats from alerts
  const stats: AlertStats = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    error: alerts.filter(a => a.severity === 'error').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
    unacknowledged: alerts.filter(a =>
      a.requiresAcknowledgment && (!a.acknowledgedBy || a.acknowledgedBy.length === 0),
    ).length,
    expiringSoon: alerts.filter(a => {
      if (!a.expiresAt) return false;
      const expiry = new Date(a.expiresAt);
      const dayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      return expiry < dayFromNow;
    }).length,
  };

  logger.debug('Fetched structural alerts', { projectId, count: alerts.length });
  return { alerts, stats };
}

async function fetchAlert(alertId: string): Promise<StructuralAlert | null> {
  logger.debug('Fetching alert', { alertId });
  const alert = await apiService.getAlertById(alertId);
  if (!alert) {
    logger.warn('Alert not found', { alertId });
  }
  return alert;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for fetching structural alerts for a project
 */
export function useStructuralAlerts(
  projectId?: string,
  options: UseStructuralAlertsOptions = {},
): UseStructuralAlertsReturn {
  const { enabled = true, staleTime = 30000, refetchInterval = 0, severity, acknowledged } = options;

  const filters = { severity, acknowledged };
  const hasFilters = severity !== undefined || acknowledged !== undefined;

  const query = useQuery({
    queryKey: hasFilters
      ? alertQueryKeys.list(projectId || 'all', filters)
      : alertQueryKeys.list(projectId || 'all'),
    queryFn: () => fetchAlerts(projectId, filters),
    enabled,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  const alerts = query.data?.alerts || [];
  const criticalCount = alerts.filter(
    a => a.severity === 'critical' || a.severity === 'error',
  ).length;

  return {
    alerts,
    stats: query.data?.stats || null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
    totalCount: alerts.length,
    criticalCount,
  };
}

/**
 * Hook for fetching a single alert by ID
 */
export function useAlert(
  alertId: string | undefined,
  options: Omit<UseStructuralAlertsOptions, 'severity' | 'acknowledged'> = {},
): UseAlertReturn {
  const { enabled = true, staleTime = 30000 } = options;

  const query = useQuery({
    queryKey: alertQueryKeys.detail(alertId || ''),
    queryFn: () => fetchAlert(alertId!),
    enabled: enabled && !!alertId,
    staleTime,
  });

  return {
    alert: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for acknowledging an alert
 */
export function useAcknowledgeAlert(projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['acknowledgeAlert'],
    mutationFn: async (alertId: string): Promise<StructuralAlert> => {
      logger.info('Acknowledging alert', { alertId });
      return apiService.acknowledgeAlert(alertId);
    },
    onMutate: async alertId => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: alertQueryKeys.list(projectId || 'all'),
      });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<{
        alerts: StructuralAlert[];
        stats: AlertStats;
      }>(alertQueryKeys.list(projectId || 'all'));

      // Optimistically update
      if (previousData) {
        queryClient.setQueryData(alertQueryKeys.list(projectId || 'all'), {
          ...previousData,
          alerts: previousData.alerts.map(a =>
            a.id === alertId
              ? { ...a, acknowledgedBy: [...(a.acknowledgedBy || []), 'current-user'] }
              : a,
          ),
        });
      }

      return { previousData };
    },
    onError: (error, _alertId, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(alertQueryKeys.list(projectId || 'all'), context.previousData);
      }
      logger.error('Failed to acknowledge alert', { error });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: alertQueryKeys.lists(),
      });
    },
  });
}

/**
 * Hook for creating a new alert
 */
export function useCreateAlert(projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['createAlert'],
    mutationFn: async (
      alert: Omit<StructuralAlert, 'id' | 'createdAt' | 'acknowledgedBy'>,
    ): Promise<StructuralAlert> => {
      logger.info('Creating alert', { title: alert.title });
      return apiService.createAlert(alert);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: alertQueryKeys.lists(),
      });
    },
    onError: (error) => {
      logger.error('Failed to create alert', { error });
    },
  });
}

// ============================================================================
// PREFETCH UTILITIES
// ============================================================================

/**
 * Prefetch alerts for a project (useful for navigation)
 */
export function usePrefetchAlerts() {
  const queryClient = useQueryClient();

  return (projectId: string) => {
    queryClient.prefetchQuery({
      queryKey: alertQueryKeys.list(projectId),
      queryFn: () => fetchAlerts(projectId),
    });
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useStructuralAlerts;
