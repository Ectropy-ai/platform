/**
 * Shared Query Hooks - Central Export
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * All React Query hooks are exported from this file for easy imports.
 *
 * @example
 * ```typescript
 * import {
 *   useProjects,
 *   useElements,
 *   useProposals,
 *   useSystemHealth
 * } from '../hooks/queries';
 * ```
 */

// Project hooks
export {
  useProjects,
  useProject,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  usePrefetchProjects,
} from './useProjects';

export type {
  UseProjectsOptions,
  UseProjectsReturn,
  UseProjectReturn,
  CreateProjectInput,
  UpdateProjectInput,
} from './useProjects';

// Element hooks
export {
  useElements,
  useElement,
  useAllElements,
  useUpdateElement,
  useBatchUpdateProgress,
  usePrefetchElements,
} from './useElements';

export type {
  UseElementsOptions,
  UseElementsReturn,
  UseElementReturn,
  UpdateElementInput,
} from './useElements';

// Governance/Proposal hooks
export {
  useProposals,
  useProposal,
  useProposalVotes,
  useDAOTemplates,
  useCreateProposal,
  useVoteOnProposal,
  useActiveProposals,
  useHasVoted,
} from './useProposals';

export type {
  DAOProposal,
  DAOVote,
  DAOTemplate,
  UseProposalsOptions,
  UseProposalsReturn,
  CreateProposalInput,
  VoteInput,
} from './useProposals';

// System/Admin hooks
export {
  useUsers,
  useUpdateUserStatus,
  useSystemHealth,
  useSystemStats,
  useAuditLogs,
  useTasks,
  useCreateTask,
  useUpdateTaskStatus,
  useAlerts,
  useAcknowledgeAlert,
} from './useSystemData';

export type {
  User,
  SystemHealth,
  SystemStats,
  AuditLog,
  EngineeringTask,
  StructuralAlert,
} from './useSystemData';

// Admin dashboard hooks (System monitoring & user management)
export {
  useSystemStatus,
  useSystemMetrics,
  useAdminUsers,
  useAdminDashboardData,
  useUpdateAdminUserStatus,
  useDeleteAdminUser,
  adminQueryKeys,
} from './useAdminData';

export type {
  SystemStatus,
  SystemMetrics,
  AdminUser,
  PlatformStats,
  ServiceHealth,
  UseSystemStatusOptions,
  UseSystemStatusReturn,
  UseSystemMetricsOptions,
  UseSystemMetricsReturn,
  UseAdminUsersOptions,
  UseAdminUsersReturn,
  UseAdminDashboardDataOptions,
  UseAdminDashboardDataReturn,
  UpdateUserStatusInput,
  DeleteUserInput,
} from './useAdminData';

// Speckle configuration hooks (Sprint 5 - Enterprise Token Management)
export {
  useSpeckleConfig,
  speckleConfigKeys,
  getTokenStatusMessage,
  isRecoverableSpeckleError,
} from './useSpeckleConfig';

export type {
  SpeckleConfig,
  UseSpeckleConfigOptions,
  UseSpeckleConfigReturn,
} from './useSpeckleConfig';

// Demo scenario hooks (Enterprise synthetic data)
export {
  useScenarios,
  useScenarioDetails,
  useScenarioInstances,
  useScenarioInstance,
  useInstantiateScenario,
  usePlaybackControl,
  useDeleteScenarioInstance,
  usePlayback,
  useDemoScenarioWorkflow,
  usePrefetchScenarios,
  usePrefetchScenarioDetails,
} from './useDemoScenarios';

export type {
  DemoScenario,
  DemoScenarioDetails,
  ScenarioInstance,
  PlaybackState,
  PlaybackSpeed,
  PlaybackAction,
  TimelinePosition,
  PersonaDetail,
  MilestoneDetail,
  TimelineEvent,
  InstantiateOptions,
  PlaybackControlOptions,
} from './useDemoScenarios';

// Project data hooks (Real dashboard data - replaces mock data)
export {
  useEngineeringData,
  useStructuralAlerts,
  useConstructionData,
  useCrewMembers,
  useBudgetData,
  useProjectActivities,
  useProjectDashboardData,
} from './useProjectData';

export type {
  EngineeringTask as ProjectEngineeringTask,
  EngineeringStats,
  StructuralAlert as ProjectStructuralAlert,
  ConstructionTask,
  ContractorStats,
  CrewMember,
  BudgetItem,
  BudgetSummary,
  ActivityItem,
} from './useProjectData';

// Architect data hooks (Design & BIM model management)
export {
  useDesignStats,
  useSpeckleModels,
  useDesignActivities,
  useArchitectDashboardData,
} from './useArchitectData';

export type {
  DesignStats,
  SpeckleModel,
  DesignActivity,
  ModelAnalysisResult,
} from './useArchitectData';

// Voxel data hooks (ROS MRO coordination view - Sprint 5)
export {
  useVoxels,
  useVoxelAggregations,
  useVoxelActivity,
  useVoxelDetail,
  useUpdateVoxelStatus,
  useROSMROData,
  voxelKeys,
  generateMockVoxels,
  generateMockAggregations,
  generateMockActivity,
  // Phase 2: History, Export, Batch
  useVoxelHistory,
  useVoxelExport,
  useBatchUpdateVoxels,
} from './useVoxels';

export type {
  VoxelData,
  VoxelAggregation,
  VoxelActivity,
  VoxelStatus,
  VoxelHealthStatus,
  VoxelSystem,
  VoxelCenter,
  VoxelStatusUpdate,
  VoxelFilterOptions,
  UseVoxelsOptions,
  UseVoxelAggregationsOptions,
  UseVoxelActivityOptions,
  UseVoxelDetailOptions,
  UseROSMRODataOptions,
  // Phase 2: History, Export, Batch types
  VoxelStatusHistoryEntry,
  VoxelBatchUpdateItem,
  VoxelBatchUpdateResult,
  UseVoxelHistoryOptions,
  UseVoxelExportOptions,
} from './useVoxels';

// Voxel real-time stream hook (Sprint 5 - WebSocket)
export {
  useVoxelStream,
} from './useVoxelStream';

export type {
  ConnectionState,
  VoxelUpdateEvent,
  ActivityEvent,
  UseVoxelStreamOptions,
  UseVoxelStreamReturn,
} from './useVoxelStream';

// ============================================================================
// COMBINED DATA HOOK
// ============================================================================

import { useProjects } from './useProjects';
import { useElements, useAllElements } from './useElements';
import { useProposals } from './useProposals';
import type { DataSource } from '../../config/types/page-config.types';

/**
 * Hook for fetching multiple data sources at once
 * Useful for ConfigDrivenPage data requirements
 *
 * @example
 * ```tsx
 * const { data, isLoading, errors } = useDashboardData(['projects', 'elements', 'proposals']);
 * ```
 */
export function useDashboardData(dataSources: DataSource[], projectId?: string) {
  const projectsQuery = useProjects({
    enabled: dataSources.includes('projects'),
  });

  const elementsQuery = useAllElements({
    enabled: dataSources.includes('elements'),
  });

  const proposalsQuery = useProposals({
    enabled: dataSources.includes('proposals'),
  });

  const data: Partial<Record<DataSource, unknown[]>> = {};
  const loading: Partial<Record<DataSource, boolean>> = {};
  const errors: Partial<Record<DataSource, Error | null>> = {};

  if (dataSources.includes('projects')) {
    data.projects = projectsQuery.projects;
    loading.projects = projectsQuery.isLoading;
    errors.projects = projectsQuery.error;
  }

  if (dataSources.includes('elements')) {
    data.elements = elementsQuery.elements;
    loading.elements = elementsQuery.isLoading;
    errors.elements = elementsQuery.error;
  }

  if (dataSources.includes('proposals')) {
    data.proposals = proposalsQuery.proposals;
    loading.proposals = proposalsQuery.isLoading;
    errors.proposals = proposalsQuery.error;
  }

  const isLoading = Object.values(loading).some(l => l);
  const hasErrors = Object.values(errors).some(e => e !== null);

  return {
    data: data as Record<DataSource, unknown[]>,
    loading: loading as Record<DataSource, boolean>,
    errors: errors as Record<DataSource, Error | null>,
    isLoading,
    hasErrors,
    refetchAll: async () => {
      await Promise.all([
        dataSources.includes('projects') && projectsQuery.refetch(),
        dataSources.includes('elements') && elementsQuery.refetch(),
        dataSources.includes('proposals') && proposalsQuery.refetch(),
      ]);
    },
  };
}
