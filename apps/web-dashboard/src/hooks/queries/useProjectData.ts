/**
 * useProjectData - Project-level dashboard data hooks
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Provides React Query hooks for fetching real project data:
 * - Engineering tasks (PMDecision)
 * - Structural alerts (VoxelAlert)
 * - Construction tasks (Voxel)
 * - Crew members (Participant)
 * - Budget items (Voxel aggregation)
 * - Activity feed (AuditLog)
 *
 * These hooks replace inline mock data in role dashboards.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';
import { apiService } from '../../services/api';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Engineering task from PMDecision
 */
export interface EngineeringTask {
  id: string;
  task: string;
  status: 'completed' | 'in_progress' | 'pending';
  priority: 'high' | 'medium' | 'low';
  decisionId?: string;
  authorityLevel?: number;
}

/**
 * Engineering stats summary
 */
export interface EngineeringStats {
  activeAnalyses: number;
  completedCalculations: number;
  pendingApprovals: number;
  structuralAlerts: number;
}

/**
 * Structural alert from VoxelAlert
 */
export interface StructuralAlert {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  element: string;
  title?: string;
  createdAt?: string;
}

/**
 * Construction task from Voxel
 */
export interface ConstructionTask {
  id: string;
  task: string;
  status: 'completed' | 'in_progress' | 'pending';
  crew: string;
  deadline: string;
  progress: number;
  zone?: string;
  building?: string;
}

/**
 * Contractor stats summary
 */
export interface ContractorStats {
  totalTasks: number;
  completedTasks: number;
  activeCrew: number;
  onSchedule: number;
  overallProgress: number;
}

/**
 * Crew member from Participant
 */
export interface CrewMember {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'scheduled' | 'inactive';
  crew: string;
  email?: string;
  company?: string;
}

/**
 * Budget item from Voxel aggregation
 */
export interface BudgetItem {
  id: string;
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  status: 'completed' | 'in_progress' | 'pending';
}

/**
 * Budget summary
 */
export interface BudgetSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  projectProgress: number;
}

/**
 * Activity item from AuditLog
 */
export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  timestamp: string;
  user?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchEngineeringData(
  projectId: string
): Promise<{ tasks: EngineeringTask[]; stats: EngineeringStats }> {
  logger.debug('[ProjectData] Fetching engineering tasks', { projectId });
  try {
    const response = await apiService.get<{ tasks: EngineeringTask[]; stats: EngineeringStats }>(
      `/api/v1/projects/${projectId}/tasks`
    );
    // Access .data from ApiResponse wrapper
    return response.data || { tasks: [], stats: { activeAnalyses: 0, completedCalculations: 0, pendingApprovals: 0, structuralAlerts: 0 } };
  } catch (error) {
    logger.warn('[ProjectData] Engineering tasks API error, returning fallback', { error });
    return {
      tasks: [],
      stats: {
        activeAnalyses: 0,
        completedCalculations: 0,
        pendingApprovals: 0,
        structuralAlerts: 0,
      },
    };
  }
}

async function fetchStructuralAlerts(
  projectId: string
): Promise<{ alerts: StructuralAlert[]; count: number }> {
  logger.debug('[ProjectData] Fetching structural alerts', { projectId });
  try {
    const response = await apiService.get<{ alerts: StructuralAlert[]; count: number }>(
      `/api/v1/projects/${projectId}/alerts`
    );
    // Access .data from ApiResponse wrapper
    return response.data || { alerts: [], count: 0 };
  } catch (error) {
    logger.warn('[ProjectData] Structural alerts API error, returning fallback', { error });
    return { alerts: [], count: 0 };
  }
}

async function fetchConstructionData(
  projectId: string
): Promise<{ tasks: ConstructionTask[]; stats: ContractorStats }> {
  logger.debug('[ProjectData] Fetching construction tasks', { projectId });
  try {
    const response = await apiService.get<{ tasks: ConstructionTask[]; stats: ContractorStats }>(
      `/api/v1/projects/${projectId}/construction-tasks`
    );
    // Access .data from ApiResponse wrapper
    return response.data || { tasks: [], stats: { totalTasks: 0, completedTasks: 0, activeCrew: 0, onSchedule: 0, overallProgress: 0 } };
  } catch (error) {
    logger.warn('[ProjectData] Construction tasks API error, returning fallback', { error });
    return {
      tasks: [],
      stats: {
        totalTasks: 0,
        completedTasks: 0,
        activeCrew: 0,
        onSchedule: 0,
        overallProgress: 0,
      },
    };
  }
}

async function fetchCrewMembers(
  projectId: string
): Promise<{ crew: CrewMember[]; count: number; activeCount: number }> {
  logger.debug('[ProjectData] Fetching crew members', { projectId });
  try {
    const response = await apiService.get<{ crew: CrewMember[]; count: number; activeCount: number }>(
      `/api/v1/projects/${projectId}/crew`
    );
    // Access .data from ApiResponse wrapper
    return response.data || { crew: [], count: 0, activeCount: 0 };
  } catch (error) {
    logger.warn('[ProjectData] Crew members API error, returning fallback', { error });
    return { crew: [], count: 0, activeCount: 0 };
  }
}

async function fetchBudgetData(
  projectId: string
): Promise<{ items: BudgetItem[]; summary: BudgetSummary }> {
  logger.debug('[ProjectData] Fetching budget data', { projectId });
  try {
    const response = await apiService.get<{ items: BudgetItem[]; summary: BudgetSummary }>(
      `/api/v1/projects/${projectId}/budget`
    );
    // Access .data from ApiResponse wrapper
    return response.data || { items: [], summary: { totalBudget: 0, totalActual: 0, totalVariance: 0, projectProgress: 0 } };
  } catch (error) {
    logger.warn('[ProjectData] Budget data API error, returning fallback', { error });
    return {
      items: [],
      summary: {
        totalBudget: 0,
        totalActual: 0,
        totalVariance: 0,
        projectProgress: 0,
      },
    };
  }
}

async function fetchActivities(
  projectId: string,
  limit: number = 10
): Promise<{ activities: ActivityItem[]; count: number }> {
  logger.debug('[ProjectData] Fetching activities', { projectId, limit });
  try {
    const response = await apiService.get<{ activities: ActivityItem[]; count: number }>(
      `/api/v1/projects/${projectId}/activities?limit=${limit}`
    );
    // Access .data from ApiResponse wrapper
    return response.data || { activities: [], count: 0 };
  } catch (error) {
    logger.warn('[ProjectData] Activities API error, returning fallback', { error });
    return { activities: [], count: 0 };
  }
}

// ============================================================================
// HOOKS - ENGINEERING DATA
// ============================================================================

interface UseEngineeringDataOptions {
  projectId?: string;
  enabled?: boolean;
}

/**
 * Hook for fetching engineering tasks and stats
 */
export function useEngineeringData(options: UseEngineeringDataOptions = {}) {
  const { projectId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'tasks'],
    queryFn: () => fetchEngineeringData(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 60000, // 1 minute
  });

  return {
    tasks: query.data?.tasks || [],
    stats: query.data?.stats || {
      activeAnalyses: 0,
      completedCalculations: 0,
      pendingApprovals: 0,
      structuralAlerts: 0,
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching structural alerts
 */
export function useStructuralAlerts(options: UseEngineeringDataOptions = {}) {
  const { projectId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'alerts'],
    queryFn: () => fetchStructuralAlerts(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 30000, // 30 seconds - alerts are more time-sensitive
    refetchInterval: 30000, // Auto-refresh every 30s
  });

  return {
    alerts: query.data?.alerts || [],
    count: query.data?.count || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    // Computed severity counts
    criticalCount: (query.data?.alerts || []).filter(a => a.severity === 'error').length,
    warningCount: (query.data?.alerts || []).filter(a => a.severity === 'warning').length,
  };
}

// ============================================================================
// HOOKS - CONTRACTOR DATA
// ============================================================================

interface UseContractorDataOptions {
  projectId?: string;
  enabled?: boolean;
}

/**
 * Hook for fetching construction tasks and stats
 */
export function useConstructionData(options: UseContractorDataOptions = {}) {
  const { projectId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'construction-tasks'],
    queryFn: () => fetchConstructionData(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 60000,
  });

  return {
    tasks: query.data?.tasks || [],
    stats: query.data?.stats || {
      totalTasks: 0,
      completedTasks: 0,
      activeCrew: 0,
      onSchedule: 0,
      overallProgress: 0,
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching crew members
 */
export function useCrewMembers(options: UseContractorDataOptions = {}) {
  const { projectId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'crew'],
    queryFn: () => fetchCrewMembers(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 120000, // 2 minutes - crew changes less frequently
  });

  return {
    crew: query.data?.crew || [],
    count: query.data?.count || 0,
    activeCount: query.data?.activeCount || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// HOOKS - OWNER DATA
// ============================================================================

interface UseBudgetDataOptions {
  projectId?: string;
  enabled?: boolean;
}

/**
 * Hook for fetching budget items and summary
 */
export function useBudgetData(options: UseBudgetDataOptions = {}) {
  const { projectId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'budget'],
    queryFn: () => fetchBudgetData(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 300000, // 5 minutes - budget changes infrequently
  });

  return {
    items: query.data?.items || [],
    summary: query.data?.summary || {
      totalBudget: 0,
      totalActual: 0,
      totalVariance: 0,
      projectProgress: 0,
    },
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    // Computed values
    isUnderBudget: (query.data?.summary?.totalVariance || 0) < 0,
    variancePercent: query.data?.summary
      ? Math.abs(
          (query.data.summary.totalVariance / (query.data.summary.totalBudget || 1)) * 100
        ).toFixed(1)
      : '0',
  };
}

// ============================================================================
// HOOKS - ACTIVITY DATA
// ============================================================================

interface UseActivitiesOptions {
  projectId?: string;
  enabled?: boolean;
  limit?: number;
}

/**
 * Hook for fetching project activities
 */
export function useProjectActivities(options: UseActivitiesOptions = {}) {
  const { projectId, enabled = true, limit = 10 } = options;

  const query = useQuery({
    queryKey: [...queryKeys.projects.detail(projectId || ''), 'activities', { limit }],
    queryFn: () => fetchActivities(projectId!, limit),
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
// COMBINED HOOK - ALL PROJECT DATA
// ============================================================================

interface UseProjectDashboardDataOptions {
  projectId?: string;
  role?: 'engineer' | 'contractor' | 'owner' | 'architect' | 'admin';
  enabled?: boolean;
}

/**
 * Combined hook for role-specific dashboard data
 * Fetches only the data needed for the specified role
 */
export function useProjectDashboardData(options: UseProjectDashboardDataOptions = {}) {
  const { projectId, role = 'owner', enabled = true } = options;

  // Engineering data (for engineer role)
  const engineeringData = useEngineeringData({
    projectId,
    enabled: enabled && !!projectId && role === 'engineer',
  });

  const alertsData = useStructuralAlerts({
    projectId,
    enabled: enabled && !!projectId && role === 'engineer',
  });

  // Contractor data (for contractor role)
  const constructionData = useConstructionData({
    projectId,
    enabled: enabled && !!projectId && role === 'contractor',
  });

  const crewData = useCrewMembers({
    projectId,
    enabled: enabled && !!projectId && role === 'contractor',
  });

  // Owner data (for owner role)
  const budgetData = useBudgetData({
    projectId,
    enabled: enabled && !!projectId && role === 'owner',
  });

  // Activities (for all roles)
  const activitiesData = useProjectActivities({
    projectId,
    enabled: enabled && !!projectId,
    limit: 10,
  });

  const isLoading =
    engineeringData.isLoading ||
    alertsData.isLoading ||
    constructionData.isLoading ||
    crewData.isLoading ||
    budgetData.isLoading ||
    activitiesData.isLoading;

  return {
    // Engineering
    engineeringTasks: engineeringData.tasks,
    engineeringStats: engineeringData.stats,
    structuralAlerts: alertsData.alerts,
    alertCount: alertsData.count,

    // Contractor
    constructionTasks: constructionData.tasks,
    contractorStats: constructionData.stats,
    crewMembers: crewData.crew,
    crewCount: crewData.count,
    activeCrewCount: crewData.activeCount,

    // Owner
    budgetItems: budgetData.items,
    budgetSummary: budgetData.summary,
    isUnderBudget: budgetData.isUnderBudget,

    // Common
    activities: activitiesData.activities,

    // Meta
    isLoading,
    role,
    refetchAll: async () => {
      await Promise.all([
        role === 'engineer' && engineeringData.refetch(),
        role === 'engineer' && alertsData.refetch(),
        role === 'contractor' && constructionData.refetch(),
        role === 'contractor' && crewData.refetch(),
        role === 'owner' && budgetData.refetch(),
        activitiesData.refetch(),
      ]);
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  fetchEngineeringData,
  fetchStructuralAlerts,
  fetchConstructionData,
  fetchCrewMembers,
  fetchBudgetData,
  fetchActivities,
};
