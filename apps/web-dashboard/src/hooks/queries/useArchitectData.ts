/**
 * useArchitectData - Architect-specific dashboard data hooks
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Provides React Query hooks for fetching architect-focused data:
 * - Design statistics (projects, models, shares, approvals)
 * - Recent design activities
 * - Model analysis results
 * - Speckle stream information
 *
 * These hooks provide real data for the ArchitectDashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';
import { apiService } from '../../services/api';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Design statistics for architect dashboard
 */
export interface DesignStats {
  totalProjects: number;
  activeModels: number;
  sharedModels: number;
  pendingApprovals: number;
  recentUploads: number;
}

/**
 * Speckle stream/model information
 */
export interface SpeckleModel {
  id: string;
  name: string;
  streamId: string;
  objectId?: string;
  createdAt: string;
  updatedAt: string;
  elementsCount?: number;
  status: 'processing' | 'ready' | 'error';
}

/**
 * Design activity item
 */
export interface DesignActivity {
  id: string;
  action: string;
  type: 'upload' | 'edit' | 'share' | 'create' | 'analyze' | 'approve';
  timestamp: string;
  user?: string;
  modelName?: string;
  projectName?: string;
  details?: Record<string, unknown>;
}

/**
 * Model analysis result
 */
export interface ModelAnalysisResult {
  modelId: string;
  timestamp: string;
  cost?: {
    total: number;
    breakdown: {
      materials: number;
      labor: number;
      equipment: number;
    };
  };
  compliance?: {
    passed: number;
    failed: number;
    warnings: number;
  };
  quality?: {
    score: number;
    issues: string[];
  };
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchDesignStats(projectId?: string): Promise<DesignStats> {
  logger.debug('[ArchitectData] Fetching design stats', { projectId });
  try {
    // Fetch from multiple endpoints to build stats
    // Note: apiService.get returns ApiResponse<T>, data is in .data property
    const [projectsRes, streamsRes, approvalsRes] = await Promise.all([
      apiService.get<{ projects: any[]; total: number }>('/api/v1/projects'),
      projectId
        ? apiService.get<{ streams: any[]; count: number }>(
            `/api/speckle/projects/${projectId}/streams`,
          )
        : Promise.resolve({ data: { streams: [], count: 0 }, status: 'success' as const }),
      projectId
        ? apiService.get<{ decisions: any[]; count: number }>(
            `/api/v1/projects/${projectId}/decisions?status=REVIEW&type=DESIGN`,
          )
        : Promise.resolve({ data: { decisions: [], count: 0 }, status: 'success' as const }),
    ]);

    // Access nested .data from ApiResponse wrapper
    const projectsData = projectsRes.data || { projects: [], total: 0 };
    const streamsData = streamsRes.data || { streams: [], count: 0 };
    const approvalsData = approvalsRes.data || { decisions: [], count: 0 };

    const totalProjects = projectsData.total || projectsData.projects?.length || 0;
    const activeModels = streamsData.count || streamsData.streams?.length || 0;
    const sharedModels = (streamsData.streams || []).filter(
      (s: any) => s.isPublic || s.collaboratorsCount > 0,
    ).length;
    const pendingApprovals = approvalsData.count || approvalsData.decisions?.length || 0;

    return {
      totalProjects,
      activeModels,
      sharedModels,
      pendingApprovals,
      recentUploads: activeModels, // Approximation
    };
  } catch (error) {
    logger.warn('[ArchitectData] Design stats API error, returning fallback', { error });
    return {
      totalProjects: 0,
      activeModels: 0,
      sharedModels: 0,
      pendingApprovals: 0,
      recentUploads: 0,
    };
  }
}

async function fetchSpeckleModels(
  projectId: string,
): Promise<{ models: SpeckleModel[]; count: number }> {
  logger.debug('[ArchitectData] Fetching Speckle models', { projectId });
  try {
    const response = await apiService.get<{ streams: any[]; count: number }>(
      `/api/speckle/projects/${projectId}/streams`,
    );

    // Access nested .data from ApiResponse wrapper
    const data = response.data || { streams: [], count: 0 };

    const models: SpeckleModel[] = (data.streams || []).map((stream: any) => ({
      id: stream.id || stream.stream_id,
      name: stream.name || 'Unnamed Model',
      streamId: stream.id || stream.stream_id,
      objectId: stream.commits?.items?.[0]?.objectId,
      createdAt: stream.createdAt || stream.created_at,
      updatedAt: stream.updatedAt || stream.updated_at,
      elementsCount: stream.elementsCount,
      status: stream.status || 'ready',
    }));

    return { models, count: data.count || models.length };
  } catch (error) {
    logger.warn('[ArchitectData] Speckle models API error, returning fallback', { error });
    return { models: [], count: 0 };
  }
}

async function fetchDesignActivities(
  projectId: string,
  limit: number = 10,
): Promise<{ activities: DesignActivity[]; count: number }> {
  logger.debug('[ArchitectData] Fetching design activities', { projectId, limit });
  try {
    const response = await apiService.get<{ activities: any[]; count: number }>(
      `/api/v1/projects/${projectId}/activities?limit=${limit}&types=upload,edit,share,create,analyze`,
    );

    // Access nested .data from ApiResponse wrapper
    const data = response.data || { activities: [], count: 0 };

    const activities: DesignActivity[] = (data.activities || []).map((a: any) => ({
      id: a.id,
      action: a.action || formatActivityAction(a),
      type: mapActivityType(a.entityType || a.type),
      timestamp: a.timestamp || a.createdAt,
      user: a.user || a.actor,
      modelName: a.details?.modelName,
      projectName: a.details?.projectName,
      details: a.details,
    }));

    return { activities, count: data.count || activities.length };
  } catch (error) {
    logger.warn('[ArchitectData] Design activities API error, returning fallback', { error });
    return { activities: [], count: 0 };
  }
}

// Helper functions
function formatActivityAction(activity: any): string {
  const entityType = activity.entityType || 'item';
  const action = activity.action || 'updated';
  return `${action} ${entityType}`;
}

function mapActivityType(type: string): DesignActivity['type'] {
  const typeMap: Record<string, DesignActivity['type']> = {
    SPECKLE_STREAM: 'upload',
    MODEL: 'upload',
    PROJECT: 'create',
    SHARE: 'share',
    ANALYSIS: 'analyze',
    DECISION: 'approve',
  };
  return typeMap[type?.toUpperCase()] || 'edit';
}

// ============================================================================
// HOOKS - DESIGN STATS
// ============================================================================

interface UseDesignStatsOptions {
  projectId?: string;
  enabled?: boolean;
}

/**
 * Hook for fetching architect design statistics
 */
export function useDesignStats(options: UseDesignStatsOptions = {}) {
  const { projectId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.all, 'design-stats', projectId],
    queryFn: () => fetchDesignStats(projectId),
    enabled,
    staleTime: 120000, // 2 minutes
  });

  return {
    stats: query.data || {
      totalProjects: 0,
      activeModels: 0,
      sharedModels: 0,
      pendingApprovals: 0,
      recentUploads: 0,
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// HOOKS - SPECKLE MODELS
// ============================================================================

interface UseSpeckleModelsOptions {
  projectId?: string;
  enabled?: boolean;
}

/**
 * Hook for fetching Speckle models for a project
 */
export function useSpeckleModels(options: UseSpeckleModelsOptions = {}) {
  const { projectId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'speckle-models'],
    queryFn: () => fetchSpeckleModels(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 60000, // 1 minute
  });

  return {
    models: query.data?.models || [],
    count: query.data?.count || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// HOOKS - DESIGN ACTIVITIES
// ============================================================================

interface UseDesignActivitiesOptions {
  projectId?: string;
  enabled?: boolean;
  limit?: number;
}

/**
 * Hook for fetching architect design activities
 */
export function useDesignActivities(options: UseDesignActivitiesOptions = {}) {
  const { projectId, enabled = true, limit = 10 } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'design-activities', { limit }],
    queryFn: () => fetchDesignActivities(projectId!, limit),
    enabled: enabled && !!projectId,
    staleTime: 30000, // 30 seconds
  });

  return {
    activities: query.data?.activities || [],
    count: query.data?.count || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// COMBINED HOOK - ARCHITECT DASHBOARD DATA
// ============================================================================

interface UseArchitectDashboardDataOptions {
  projectId?: string;
  enabled?: boolean;
}

/**
 * Combined hook for all architect dashboard data
 */
export function useArchitectDashboardData(options: UseArchitectDashboardDataOptions = {}) {
  const { projectId, enabled = true } = options;

  const statsData = useDesignStats({
    projectId,
    enabled,
  });

  const modelsData = useSpeckleModels({
    projectId,
    enabled: enabled && !!projectId,
  });

  const activitiesData = useDesignActivities({
    projectId,
    enabled: enabled && !!projectId,
    limit: 10,
  });

  const isLoading = statsData.isLoading || modelsData.isLoading || activitiesData.isLoading;

  return {
    // Stats
    designStats: statsData.stats,

    // Models
    speckleModels: modelsData.models,
    modelCount: modelsData.count,

    // Activities
    designActivities: activitiesData.activities,

    // Meta
    isLoading,
    refetchAll: async () => {
      await Promise.all([statsData.refetch(), modelsData.refetch(), activitiesData.refetch()]);
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { fetchDesignStats, fetchSpeckleModels, fetchDesignActivities };
