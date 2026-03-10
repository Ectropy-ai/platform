/**
 * useDemoScenarios - React Query hooks for demo scenario management
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Provides centralized demo scenario data fetching with:
 * - Scenario listing and details
 * - Instance management (create, list, delete)
 * - Playback control (play, pause, stop, seek)
 * - Real-time state updates via polling or WebSocket
 *
 * @example
 * ```tsx
 * function ScenarioSelector() {
 *   const { scenarios, isLoading } = useScenarios();
 *   const instantiate = useInstantiateScenario();
 *
 *   return (
 *     <ScenarioList
 *       scenarios={scenarios}
 *       onSelect={(id) => instantiate.mutate({ scenarioId: id })}
 *     />
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';
import { apiClient } from '../../services/apiClient';

// ============================================================================
// TYPES
// ============================================================================

/** Demo scenario summary from API */
export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  duration: {
    weeks: number;
    description: string;
  };
  complexity: 'low' | 'medium' | 'high';
  personas: string[];
  milestonesCount: number;
  eventsCount: number;
}

/** Full demo scenario details */
export interface DemoScenarioDetails extends Omit<DemoScenario, 'personas'> {
  buildingType: string;
  personas: PersonaDetail[];
  milestones: MilestoneDetail[];
  timeline: TimelineEvent[];
  voxelGeneratorOptions?: VoxelOptions;
}

/** Persona details */
export interface PersonaDetail {
  id: string;
  name: string;
  role: string;
  company: string;
  behaviorProfile: {
    responseSpeed: number;
    thoroughness: number;
    escalationTendency: number;
  };
}

/** Milestone details */
export interface MilestoneDetail {
  id: string;
  name: string;
  position: TimelinePosition;
  description: string;
  presenterNotes?: string[];
}

/** Timeline event */
export interface TimelineEvent {
  id: string;
  type: string;
  position: TimelinePosition;
  persona: string;
  description: string;
}

/** Timeline position */
export interface TimelinePosition {
  week: number;
  day: number;
  hour: number;
}

/** Voxel generator options */
export interface VoxelOptions {
  buildingProfile: string;
  statusDistribution: Record<string, number>;
}

/** Scenario instance from API */
export interface ScenarioInstance {
  id: string;
  scenarioId: string;
  scenarioName?: string;
  state: 'ready' | 'playing' | 'paused' | 'completed';
  currentPosition: TimelinePosition;
  createdAt: string;
  updatedAt?: string;
  recordCounts?: {
    users: number;
    projects: number;
    voxels: number;
    decisions: number;
    inspections: number;
  };
  generatedRecords?: {
    users: string[];
    projects: string[];
    voxels: string[];
    decisions: string[];
    inspections: string[];
  };
  activePersonas?: string[];
}

/** Playback state from API */
export interface PlaybackState {
  instanceId: string;
  position: TimelinePosition;
  speed: PlaybackSpeed;
  isPlaying: boolean;
  executedEventsCount: number;
  nextEvent?: TimelineEvent;
}

/** Valid playback speeds */
export type PlaybackSpeed = 1 | 2 | 5 | 10 | 20 | 50 | 100;

/** Playback action types */
export type PlaybackAction =
  | 'play'
  | 'pause'
  | 'stop'
  | 'reset'
  | 'setSpeed'
  | 'jumpToMilestone'
  | 'jumpToPosition';

/** Instantiate scenario options */
export interface InstantiateOptions {
  scenarioId: string;
  seed?: number;
  activePersonas?: string[];
  startPosition?: TimelinePosition;
  projectNameOverride?: string;
}

/** Playback control options */
export interface PlaybackControlOptions {
  instanceId: string;
  action: PlaybackAction;
  speed?: PlaybackSpeed;
  milestoneId?: string;
  position?: TimelinePosition;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

const BASE_URL = '/api/admin';

async function fetchScenarios(): Promise<DemoScenario[]> {
  logger.debug('Fetching demo scenarios');
  const response = await apiClient.get<{ scenarios: DemoScenario[]; total: number }>(
    `${BASE_URL}/scenarios`
  );

  if (response.success && response.data) {
    logger.debug('Fetched scenarios', { count: response.data.scenarios.length });
    return response.data.scenarios;
  }
  throw new Error('Failed to fetch scenarios');
}

async function fetchScenarioDetails(
  scenarioId: string
): Promise<DemoScenarioDetails> {
  logger.debug('Fetching scenario details', { scenarioId });
  const response = await apiClient.get<{ scenario: DemoScenarioDetails }>(
    `${BASE_URL}/scenarios/${scenarioId}`
  );

  if (response.success && response.data) {
    return response.data.scenario;
  }
  throw new Error(`Failed to fetch scenario: ${scenarioId}`);
}

async function fetchInstances(): Promise<ScenarioInstance[]> {
  logger.debug('Fetching scenario instances');
  const response = await apiClient.get<{ instances: ScenarioInstance[]; total: number }>(
    `${BASE_URL}/scenarios/instances`
  );

  if (response.success && response.data) {
    logger.debug('Fetched instances', { count: response.data.instances.length });
    return response.data.instances;
  }
  throw new Error('Failed to fetch instances');
}

async function fetchInstance(instanceId: string): Promise<ScenarioInstance> {
  logger.debug('Fetching scenario instance', { instanceId });
  const response = await apiClient.get<{
    instance: ScenarioInstance;
    playback: { isActive: boolean; state?: PlaybackState };
  }>(`${BASE_URL}/scenarios/instances/${instanceId}`);

  if (response.success && response.data) {
    return response.data.instance;
  }
  throw new Error(`Failed to fetch instance: ${instanceId}`);
}

async function instantiateScenario(
  options: InstantiateOptions
): Promise<ScenarioInstance> {
  logger.info('Instantiating scenario', { scenarioId: options.scenarioId });
  const response = await apiClient.post<{ instance: ScenarioInstance }>(
    `${BASE_URL}/scenarios/${options.scenarioId}/instantiate`,
    {
      seed: options.seed,
      activePersonas: options.activePersonas,
      startPosition: options.startPosition,
      projectNameOverride: options.projectNameOverride,
    }
  );

  if (response.success && response.data) {
    logger.info('Scenario instantiated', { instanceId: response.data.instance.id });
    return response.data.instance;
  }
  throw new Error('Failed to instantiate scenario');
}

async function controlPlayback(
  options: PlaybackControlOptions
): Promise<PlaybackState> {
  logger.info('Controlling playback', {
    instanceId: options.instanceId,
    action: options.action,
  });

  const response = await apiClient.post<{ playback: { state: PlaybackState } }>(
    `${BASE_URL}/scenarios/instances/${options.instanceId}/playback`,
    {
      action: options.action,
      speed: options.speed,
      milestoneId: options.milestoneId,
      position: options.position,
    }
  );

  if (response.success && response.data) {
    return response.data.playback.state;
  }
  throw new Error(`Failed to control playback: ${options.action}`);
}

async function deleteInstance(
  instanceId: string,
  deleteGeneratedData: boolean = false
): Promise<void> {
  logger.info('Deleting scenario instance', { instanceId, deleteGeneratedData });
  const queryParam = deleteGeneratedData ? '?deleteGeneratedData=true' : '';
  const response = await apiClient.delete<{ success: boolean }>(
    `${BASE_URL}/scenarios/instances/${instanceId}${queryParam}`
  );

  if (!response.success) {
    throw new Error(`Failed to delete instance: ${instanceId}`);
  }
  logger.info('Instance deleted', { instanceId });
}

// ============================================================================
// QUERY HOOKS
// ============================================================================

export interface UseScenariosOptions {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}

export interface UseScenariosReturn {
  scenarios: DemoScenario[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching all available demo scenarios
 */
export function useScenarios(
  options: UseScenariosOptions = {}
): UseScenariosReturn {
  const { enabled = true, staleTime, refetchInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.scenarios.all,
    queryFn: fetchScenarios,
    enabled,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  return {
    scenarios: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching a single scenario's details
 */
export function useScenarioDetails(
  scenarioId: string | undefined,
  options: UseScenariosOptions = {}
) {
  const { enabled = true, staleTime } = options;

  const query = useQuery({
    queryKey: queryKeys.scenarios.detail(scenarioId || ''),
    queryFn: () => fetchScenarioDetails(scenarioId!),
    enabled: enabled && !!scenarioId,
    staleTime,
  });

  return {
    scenario: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching all active scenario instances
 */
export function useScenarioInstances(options: UseScenariosOptions = {}) {
  const { enabled = true, staleTime, refetchInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.scenarios.instances.all,
    queryFn: fetchInstances,
    enabled,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  return {
    instances: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching a single scenario instance
 */
export function useScenarioInstance(
  instanceId: string | undefined,
  options: UseScenariosOptions = {}
) {
  const { enabled = true, staleTime, refetchInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.scenarios.instances.detail(instanceId || ''),
    queryFn: () => fetchInstance(instanceId!),
    enabled: enabled && !!instanceId,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  return {
    instance: query.data || null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Hook for instantiating a demo scenario
 */
export function useInstantiateScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['instantiateScenario'],
    mutationFn: instantiateScenario,
    onSuccess: (newInstance) => {
      // Add to instances cache
      queryClient.setQueryData<ScenarioInstance[]>(
        queryKeys.scenarios.instances.all,
        (old) => (old ? [...old, newInstance] : [newInstance])
      );
      logger.info('Scenario instantiated', { instanceId: newInstance.id });
    },
    onError: (error) => {
      logger.error('Failed to instantiate scenario', { error });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scenarios.instances.all,
      });
    },
  });
}

/**
 * Hook for controlling playback on an instance
 */
export function usePlaybackControl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['controlPlayback'],
    mutationFn: controlPlayback,
    onSuccess: (playbackState, variables) => {
      // Update instance cache with new state
      queryClient.setQueryData<ScenarioInstance>(
        queryKeys.scenarios.instances.detail(variables.instanceId),
        (old) =>
          old
            ? {
                ...old,
                state: playbackState.isPlaying ? 'playing' : 'paused',
                currentPosition: playbackState.position,
              }
            : old
      );
      logger.debug('Playback state updated', {
        instanceId: variables.instanceId,
        action: variables.action,
      });
    },
    onError: (error, variables) => {
      logger.error('Failed to control playback', {
        error,
        instanceId: variables.instanceId,
        action: variables.action,
      });
    },
  });
}

/**
 * Hook for deleting a scenario instance
 */
export function useDeleteScenarioInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['deleteScenarioInstance'],
    mutationFn: ({
      instanceId,
      deleteGeneratedData,
    }: {
      instanceId: string;
      deleteGeneratedData?: boolean;
    }) => deleteInstance(instanceId, deleteGeneratedData),
    onMutate: async ({ instanceId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.scenarios.instances.all,
      });

      // Snapshot previous value
      const previousInstances = queryClient.getQueryData<ScenarioInstance[]>(
        queryKeys.scenarios.instances.all
      );

      // Optimistically remove from cache
      if (previousInstances) {
        queryClient.setQueryData<ScenarioInstance[]>(
          queryKeys.scenarios.instances.all,
          previousInstances.filter((i) => i.id !== instanceId)
        );
      }

      return { previousInstances };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousInstances) {
        queryClient.setQueryData(
          queryKeys.scenarios.instances.all,
          context.previousInstances
        );
      }
      logger.error('Failed to delete instance', {
        error,
        instanceId: variables.instanceId,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scenarios.instances.all,
      });
    },
  });
}

// ============================================================================
// CONVENIENCE HOOKS
// ============================================================================

/**
 * Hook for managing playback with common actions
 */
export function usePlayback(instanceId: string | undefined) {
  const { mutate, isPending, error } = usePlaybackControl();
  const { instance, isLoading, refetch } = useScenarioInstance(instanceId, {
    refetchInterval: 2000, // Poll for state updates
  });

  return {
    // State
    instance,
    isLoading,
    isPending,
    error,
    state: instance?.state,
    position: instance?.currentPosition,

    // Actions
    play: () =>
      instanceId && mutate({ instanceId, action: 'play' }),
    pause: () =>
      instanceId && mutate({ instanceId, action: 'pause' }),
    stop: () =>
      instanceId && mutate({ instanceId, action: 'stop' }),
    reset: () =>
      instanceId && mutate({ instanceId, action: 'reset' }),
    setSpeed: (speed: PlaybackSpeed) =>
      instanceId && mutate({ instanceId, action: 'setSpeed', speed }),
    jumpToMilestone: (milestoneId: string) =>
      instanceId &&
      mutate({ instanceId, action: 'jumpToMilestone', milestoneId }),
    jumpToPosition: (position: TimelinePosition) =>
      instanceId &&
      mutate({ instanceId, action: 'jumpToPosition', position }),

    // Utilities
    refetch,
  };
}

/**
 * Hook for the complete demo scenario workflow
 */
export function useDemoScenarioWorkflow() {
  const { scenarios, isLoading: loadingScenarios } = useScenarios();
  const { instances, isLoading: loadingInstances } = useScenarioInstances();
  const instantiate = useInstantiateScenario();
  const deleteInstance = useDeleteScenarioInstance();

  return {
    // Data
    scenarios,
    instances,
    isLoading: loadingScenarios || loadingInstances,

    // Actions
    instantiate: instantiate.mutate,
    deleteInstance: deleteInstance.mutate,

    // Mutation state
    isInstantiating: instantiate.isPending,
    isDeleting: deleteInstance.isPending,
    instantiateError: instantiate.error,
    deleteError: deleteInstance.error,
  };
}

// ============================================================================
// PREFETCH UTILITIES
// ============================================================================

/**
 * Prefetch scenarios data
 */
export function usePrefetchScenarios() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.scenarios.all,
      queryFn: fetchScenarios,
    });
  };
}

/**
 * Prefetch scenario details
 */
export function usePrefetchScenarioDetails(scenarioId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.scenarios.detail(scenarioId),
      queryFn: () => fetchScenarioDetails(scenarioId),
    });
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useScenarios;
