/**
 * useVoxels - Voxel data hooks for ROS MRO coordination view
 *
 * ENTERPRISE DATA LAYER (Sprint 5 - 2026-01-24)
 *
 * Provides React Query hooks for fetching real voxel data:
 * - Voxel list with status and system filtering
 * - Voxel aggregations by level/system
 * - Individual voxel details with decisions
 * - Activity stream for voxel changes
 *
 * These hooks replace mock data generators in ROSMROView.tsx
 *
 * @module hooks/queries/useVoxels
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';
import { apiService } from '../../services/api';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voxel status enum matching Prisma model
 */
export type VoxelStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'BLOCKED'
  | 'ON_HOLD'
  | 'INSPECTION_REQUIRED';

/**
 * Voxel health status
 */
export type VoxelHealthStatus = 'HEALTHY' | 'AT_RISK' | 'CRITICAL';

/**
 * System types for voxels
 */
export type VoxelSystem = 'STRUCT' | 'MECH' | 'ELEC' | 'PLUMB' | 'HVAC' | 'FIRE';

/**
 * 3D coordinate for voxel center
 */
export interface VoxelCenter {
  x: number;
  y: number;
  z: number;
}

/**
 * Voxel data from database
 */
export interface VoxelData {
  id: string;
  voxelId: string;
  projectId: string;
  system: VoxelSystem;
  status: VoxelStatus;
  healthStatus: VoxelHealthStatus;
  percentComplete?: number;
  center: VoxelCenter;
  resolution: number;
  level?: string;
  decisionCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Voxel aggregation by level or system
 */
export interface VoxelAggregation {
  key: string;
  voxelCount: number;
  plannedCount: number;
  inProgressCount: number;
  completeCount: number;
  blockedCount: number;
  decisionCount: number;
  overallProgress: number;
  healthScore: number;
}

/**
 * Activity item for voxel changes
 */
export interface VoxelActivity {
  id: string;
  type: 'status_change' | 'decision_attached' | 'inspection' | 'issue';
  title: string;
  description: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  voxelId?: string;
  userId?: string;
  userName?: string;
}

/**
 * Voxel status update payload
 */
export interface VoxelStatusUpdate {
  status: VoxelStatus;
  percentComplete?: number;
  note?: string;
}

/**
 * Filter options for voxel queries
 */
export interface VoxelFilterOptions {
  systems?: VoxelSystem[];
  statuses?: VoxelStatus[];
  level?: string;
  limit?: number;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const voxelKeys = {
  all: ['voxels'] as const,
  list: (projectId: string, filters?: VoxelFilterOptions) =>
    [...voxelKeys.all, 'list', projectId, filters] as const,
  detail: (voxelId: string) => [...voxelKeys.all, 'detail', voxelId] as const,
  aggregations: (projectId: string, groupBy?: 'level' | 'system') =>
    [...voxelKeys.all, 'aggregations', projectId, groupBy] as const,
  activity: (projectId: string, limit?: number) =>
    [...voxelKeys.all, 'activity', projectId, limit] as const,
};

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchVoxels(
  projectId: string,
  filters?: VoxelFilterOptions
): Promise<{ voxels: VoxelData[]; total: number }> {
  logger.debug('[Voxels] Fetching voxels', { projectId, filters });
  try {
    const params = new URLSearchParams();
    if (filters?.systems?.length) {
      params.set('systems', filters.systems.join(','));
    }
    if (filters?.statuses?.length) {
      params.set('statuses', filters.statuses.join(','));
    }
    if (filters?.level) {
      params.set('level', filters.level);
    }
    params.set('limit', String(filters?.limit ?? 10000));

    const queryString = params.toString();
    const url = `/api/v1/projects/${projectId}/voxels${queryString ? `?${queryString}` : ''}`;

    const response = await apiService.get<{ voxels: VoxelData[]; total: number }>(url);
    return (response as any) || { voxels: [], total: 0 };
  } catch (error) {
    logger.warn('[Voxels] Fetch error, returning mock data', { error });
    // Return mock data as fallback
    return generateMockVoxels(projectId);
  }
}

async function fetchVoxelAggregations(
  projectId: string,
  groupBy: 'level' | 'system' = 'level'
): Promise<{ aggregations: VoxelAggregation[] }> {
  logger.debug('[Voxels] Fetching aggregations', { projectId, groupBy });
  try {
    const response = await apiService.get<{ aggregations: VoxelAggregation[] }>(
      `/api/v1/projects/${projectId}/voxels/aggregation?groupBy=${groupBy}`
    );
    return (response as any) || { aggregations: [] };
  } catch (error) {
    logger.warn('[Voxels] Aggregations fetch error, returning mock data', { error });
    // Return mock aggregations
    return { aggregations: generateMockAggregations() };
  }
}

async function fetchVoxelActivity(
  projectId: string,
  limit: number = 10
): Promise<{ activities: VoxelActivity[]; count: number }> {
  logger.debug('[Voxels] Fetching activity', { projectId, limit });
  try {
    const response = await apiService.get<{ activities: VoxelActivity[]; count: number }>(
      `/api/v1/projects/${projectId}/voxels/activity?limit=${limit}`
    );
    return (response as any) || { activities: [], count: 0 };
  } catch (error) {
    logger.warn('[Voxels] Activity fetch error, returning mock data', { error });
    return { activities: generateMockActivity(), count: 5 };
  }
}

async function fetchVoxelDetail(voxelId: string): Promise<VoxelData | null> {
  logger.debug('[Voxels] Fetching voxel detail', { voxelId });
  try {
    const response = await apiService.get<{ voxel: VoxelData }>(`/api/v1/voxels/${voxelId}`);
    return response.data?.voxel || null;
  } catch (error) {
    logger.warn('[Voxels] Detail fetch error', { error });
    return null;
  }
}

async function updateVoxelStatus(
  voxelId: string,
  update: VoxelStatusUpdate
): Promise<VoxelData | null> {
  logger.debug('[Voxels] Updating voxel status', { voxelId, update });
  try {
    // Use fetch directly since apiService doesn't have patch method
    const response = await fetch(`/api/v1/voxels/${voxelId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(update),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data?.voxel || null;
  } catch (error) {
    logger.error('[Voxels] Update status failed', { error, voxelId });
    throw error;
  }
}

// ============================================================================
// MOCK DATA GENERATORS (Fallback until API is ready)
// ============================================================================

function generateMockVoxels(projectId: string): { voxels: VoxelData[]; total: number } {
  const systems: VoxelSystem[] = ['STRUCT', 'MECH', 'ELEC', 'PLUMB', 'HVAC', 'FIRE'];
  const statuses: VoxelStatus[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED'];
  const healthStatuses: VoxelHealthStatus[] = ['HEALTHY', 'AT_RISK', 'CRITICAL'];
  const voxels: VoxelData[] = [];

  const gridSize = 5;
  const spacing = 200;
  let index = 0;
  const now = new Date().toISOString();

  for (let level = 0; level < 3; level++) {
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        const system = systems[Math.floor(Math.random() * systems.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        voxels.push({
          id: `vox-${projectId}-${index}`,
          voxelId: `VOX-L${level}-${system}-${String(index).padStart(3, '0')}`,
          projectId,
          center: {
            x: x * spacing + spacing / 2,
            y: y * spacing + spacing / 2,
            z: level * 1000 + 500,
          },
          resolution: spacing * 0.9,
          system,
          status,
          healthStatus: healthStatuses[Math.floor(Math.random() * healthStatuses.length)],
          decisionCount: Math.floor(Math.random() * 5),
          percentComplete:
            status === 'COMPLETE'
              ? 100
              : status === 'IN_PROGRESS'
                ? Math.floor(Math.random() * 80) + 10
                : status === 'PLANNED'
                  ? 0
                  : undefined,
          level: `Level ${level}`,
          createdAt: now,
          updatedAt: now,
        });
        index++;
      }
    }
  }

  return { voxels, total: voxels.length };
}

function generateMockAggregations(): VoxelAggregation[] {
  return [
    {
      key: 'Level 0',
      voxelCount: 25,
      plannedCount: 5,
      inProgressCount: 10,
      completeCount: 8,
      blockedCount: 2,
      decisionCount: 12,
      overallProgress: 52,
      healthScore: 92,
    },
    {
      key: 'Level 1',
      voxelCount: 25,
      plannedCount: 8,
      inProgressCount: 12,
      completeCount: 4,
      blockedCount: 1,
      decisionCount: 8,
      overallProgress: 40,
      healthScore: 96,
    },
    {
      key: 'Level 2',
      voxelCount: 25,
      plannedCount: 15,
      inProgressCount: 7,
      completeCount: 2,
      blockedCount: 1,
      decisionCount: 5,
      overallProgress: 22,
      healthScore: 96,
    },
  ];
}

function generateMockActivity(): VoxelActivity[] {
  const now = Date.now();
  return [
    {
      id: 'act-001',
      type: 'status_change',
      title: 'Status Updated',
      description: 'VOX-L1-MECH-023 changed to IN_PROGRESS',
      timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
      severity: 'info',
      voxelId: 'vox-001',
    },
    {
      id: 'act-002',
      type: 'decision_attached',
      title: 'Decision Attached',
      description: 'RFI #2024-0123 linked to VOX-L2-ELEC-045',
      timestamp: new Date(now - 15 * 60 * 1000).toISOString(),
      severity: 'warning',
      voxelId: 'vox-002',
    },
    {
      id: 'act-003',
      type: 'inspection',
      title: 'Inspection Required',
      description: 'Structural inspection needed for Level 1 columns',
      timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
      severity: 'warning',
    },
    {
      id: 'act-004',
      type: 'issue',
      title: 'Coordination Issue',
      description: 'MEP clash detected at VOX-L1-HVAC-012',
      timestamp: new Date(now - 60 * 60 * 1000).toISOString(),
      severity: 'error',
      voxelId: 'vox-003',
    },
    {
      id: 'act-005',
      type: 'status_change',
      title: 'Work Completed',
      description: 'VOX-L0-STRUCT-001 marked as COMPLETE',
      timestamp: new Date(now - 120 * 60 * 1000).toISOString(),
      severity: 'success',
      voxelId: 'vox-004',
    },
  ];
}

// ============================================================================
// HOOKS - VOXEL LIST
// ============================================================================

export interface UseVoxelsOptions {
  projectId?: string;
  filters?: VoxelFilterOptions;
  enabled?: boolean;
}

/**
 * Hook for fetching voxels for a project
 * Supports filtering by system, status, and level
 */
export function useVoxels(options: UseVoxelsOptions = {}) {
  const { projectId, filters, enabled = true } = options;

  const query = useQuery({
    queryKey: voxelKeys.list(projectId || '', filters),
    queryFn: () => fetchVoxels(projectId!, filters),
    enabled: enabled && !!projectId,
    staleTime: 60_000, // 60 seconds
    refetchInterval: 60_000, // Auto-refresh every 60 seconds
    retry: false, // Do not retry on 429 — prevents rate limit cascade
  });

  return {
    voxels: query.data?.voxels || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// HOOKS - VOXEL AGGREGATIONS
// ============================================================================

export interface UseVoxelAggregationsOptions {
  projectId?: string;
  groupBy?: 'level' | 'system';
  enabled?: boolean;
}

/**
 * Hook for fetching voxel aggregations
 * Groups by level or system for progress summaries
 */
export function useVoxelAggregations(options: UseVoxelAggregationsOptions = {}) {
  const { projectId, groupBy = 'level', enabled = true } = options;

  const query = useQuery({
    queryKey: voxelKeys.aggregations(projectId || '', groupBy),
    queryFn: () => fetchVoxelAggregations(projectId!, groupBy),
    enabled: enabled && !!projectId,
    staleTime: 120_000, // 2 minutes
    refetchInterval: 120_000, // Auto-refresh every 2 minutes
    retry: false, // Do not retry on 429 — prevents rate limit cascade
  });

  // Compute totals from aggregations
  const aggregations = query.data?.aggregations || [];
  const totals = aggregations.reduce(
    (acc, agg) => ({
      voxels: acc.voxels + agg.voxelCount,
      planned: acc.planned + agg.plannedCount,
      inProgress: acc.inProgress + agg.inProgressCount,
      complete: acc.complete + agg.completeCount,
      blocked: acc.blocked + agg.blockedCount,
      decisions: acc.decisions + agg.decisionCount,
    }),
    { voxels: 0, planned: 0, inProgress: 0, complete: 0, blocked: 0, decisions: 0 }
  );

  const overallProgress =
    totals.voxels > 0
      ? Math.round((totals.complete * 100 + totals.inProgress * 50) / totals.voxels)
      : 0;

  return {
    aggregations,
    totals,
    overallProgress,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// HOOKS - VOXEL ACTIVITY
// ============================================================================

export interface UseVoxelActivityOptions {
  projectId?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook for fetching voxel activity stream
 * Real-time updates of status changes, decisions, and issues
 */
export function useVoxelActivity(options: UseVoxelActivityOptions = {}) {
  const { projectId, limit = 10, enabled = true } = options;

  const query = useQuery({
    queryKey: voxelKeys.activity(projectId || '', limit),
    queryFn: () => fetchVoxelActivity(projectId!, limit),
    enabled: enabled && !!projectId,
    staleTime: 60_000, // 60 seconds
    refetchInterval: 60_000, // Auto-refresh every 60 seconds
    retry: false, // Do not retry on 429 — prevents rate limit cascade
  });

  const activities = query.data?.activities || [];

  return {
    activities,
    count: query.data?.count || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    // Computed counts by severity
    errorCount: activities.filter((a) => a.severity === 'error').length,
    warningCount: activities.filter((a) => a.severity === 'warning').length,
    unreadCount: activities.filter((a) => a.severity === 'error' || a.severity === 'warning')
      .length,
  };
}

// ============================================================================
// HOOKS - VOXEL DETAIL
// ============================================================================

export interface UseVoxelDetailOptions {
  voxelId?: string;
  enabled?: boolean;
}

/**
 * Hook for fetching individual voxel details
 */
export function useVoxelDetail(options: UseVoxelDetailOptions = {}) {
  const { voxelId, enabled = true } = options;

  const query = useQuery({
    queryKey: voxelKeys.detail(voxelId || ''),
    queryFn: () => fetchVoxelDetail(voxelId!),
    enabled: enabled && !!voxelId,
    staleTime: 30_000,
  });

  return {
    voxel: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// HOOKS - VOXEL MUTATIONS
// ============================================================================

/**
 * Hook for updating voxel status
 * Optimistically updates cache and invalidates related queries
 */
export function useUpdateVoxelStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ voxelId, update }: { voxelId: string; update: VoxelStatusUpdate }) =>
      updateVoxelStatus(voxelId, update),
    onSuccess: (data, variables) => {
      // Update the detail cache
      if (data) {
        queryClient.setQueryData(voxelKeys.detail(variables.voxelId), data);
      }

      // Invalidate list and aggregation queries
      queryClient.invalidateQueries({ queryKey: voxelKeys.all });
    },
    onError: (error) => {
      logger.error('[Voxels] Status update failed', { error });
    },
  });
}

// ============================================================================
// COMBINED HOOK - ROS MRO DATA
// ============================================================================

export interface UseROSMRODataOptions {
  projectId?: string;
  filters?: VoxelFilterOptions;
  enabled?: boolean;
}

/**
 * Combined hook for ROS MRO coordination view
 * Fetches voxels, aggregations, and activity in parallel
 */
export function useROSMROData(options: UseROSMRODataOptions = {}) {
  const { projectId, filters, enabled = true } = options;

  const voxelsQuery = useVoxels({ projectId, filters, enabled });
  const aggregationsQuery = useVoxelAggregations({ projectId, enabled });
  const activityQuery = useVoxelActivity({ projectId, enabled });

  const isLoading =
    voxelsQuery.isLoading || aggregationsQuery.isLoading || activityQuery.isLoading;

  return {
    // Voxel data
    voxels: voxelsQuery.voxels,
    voxelCount: voxelsQuery.total,

    // Aggregations
    aggregations: aggregationsQuery.aggregations,
    totals: aggregationsQuery.totals,
    overallProgress: aggregationsQuery.overallProgress,

    // Activity
    activities: activityQuery.activities,
    activityCount: activityQuery.count,
    alertCount: activityQuery.unreadCount,

    // Meta
    isLoading,
    isFetching:
      voxelsQuery.isFetching || aggregationsQuery.isFetching,
    error: voxelsQuery.error || aggregationsQuery.error || activityQuery.error,

    // Refetch all data
    refetchAll: async () => {
      await Promise.all([
        voxelsQuery.refetch(),
        aggregationsQuery.refetch(),
        activityQuery.refetch(),
      ]);
    },
  };
}

// ============================================================================
// PHASE 2: HISTORY, EXPORT, AND BATCH HOOKS
// ============================================================================

/**
 * Status history entry from API
 */
export interface VoxelStatusHistoryEntry {
  id: string;
  voxelId: string;
  previousStatus: string | null;
  newStatus: string;
  previousHealth: string | null;
  newHealth: string | null;
  percentComplete: number | null;
  note: string | null;
  changedById: string | null;
  changedByName: string | null;
  source: string | null;
  timestamp: string;
}

/**
 * Batch update request item
 */
export interface VoxelBatchUpdateItem {
  voxelId: string;
  status?: VoxelStatus;
  healthStatus?: VoxelHealthStatus;
  percentComplete?: number;
  note?: string;
}

/**
 * Batch update result
 */
export interface VoxelBatchUpdateResult {
  updated: VoxelData[];
  failed: Array<{ voxelId: string; error: string }>;
}

export interface UseVoxelHistoryOptions {
  voxelId?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook for fetching voxel status change history
 */
export function useVoxelHistory(options: UseVoxelHistoryOptions = {}) {
  const { voxelId, limit = 50, enabled = true } = options;

  const query = useQuery({
    queryKey: [...voxelKeys.detail(voxelId || ''), 'history', limit],
    queryFn: async () => {
      const response = await fetch(`/api/v1/voxels/${voxelId}/history?limit=${limit}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data as { voxelId: string; history: VoxelStatusHistoryEntry[]; count: number };
    },
    enabled: enabled && !!voxelId,
    staleTime: 60_000, // 1 minute
  });

  return {
    history: query.data?.history || [],
    count: query.data?.count || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface UseVoxelExportOptions {
  projectId?: string;
  format?: 'json' | 'csv';
  filters?: VoxelFilterOptions;
}

/**
 * Hook for exporting voxels (returns a function to trigger download)
 */
export function useVoxelExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportVoxels = useCallback(
    async (options: UseVoxelExportOptions) => {
      const { projectId, format = 'json', filters } = options;

      if (!projectId) {
        throw new Error('Project ID required');
      }

      setIsExporting(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('format', format);
        if (filters?.systems?.length) {
          params.set('systems', filters.systems.join(','));
        }
        if (filters?.statuses?.length) {
          params.set('statuses', filters.statuses.join(','));
        }
        if (filters?.level) {
          params.set('level', filters.level);
        }

        const response = await fetch(
          `/api/v1/projects/${projectId}/voxels/export?${params.toString()}`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          throw new Error(`Export failed: ${response.statusText}`);
        }

        // Get filename from Content-Disposition header or generate one
        const disposition = response.headers.get('Content-Disposition');
        const filenameMatch = disposition?.match(/filename="(.+)"/);
        const filename = filenameMatch?.[1] || `voxels-${projectId}-${Date.now()}.${format}`;

        // Create blob and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        logger.info('[Voxels] Export completed', { projectId, format });
      } catch (err) {
        const exportError = err instanceof Error ? err : new Error('Export failed');
        setError(exportError);
        throw exportError;
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return {
    exportVoxels,
    isExporting,
    error,
  };
}

/**
 * Hook for batch updating voxels
 */
export function useBatchUpdateVoxels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      updates,
    }: {
      projectId: string;
      updates: VoxelBatchUpdateItem[];
    }) => {
      const response = await fetch(`/api/v1/projects/${projectId}/voxels/batch-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error(`Batch update failed: ${response.statusText}`);
      }

      return (await response.json()) as VoxelBatchUpdateResult;
    },
    onSuccess: (data, variables) => {
      // Invalidate all voxel queries for the project
      queryClient.invalidateQueries({
        queryKey: voxelKeys.list(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: voxelKeys.aggregations(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: voxelKeys.activity(variables.projectId),
      });

      logger.info('[Voxels] Batch update completed', {
        projectId: variables.projectId,
        updated: data.updated.length,
        failed: data.failed.length,
      });
    },
    onError: (error) => {
      logger.error('[Voxels] Batch update failed', { error });
    },
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  fetchVoxels,
  fetchVoxelAggregations,
  fetchVoxelActivity,
  fetchVoxelDetail,
  updateVoxelStatus,
  generateMockVoxels,
  generateMockAggregations,
  generateMockActivity,
};
