/**
 * useEngineeringTasks - Shared hook for engineering task data
 *
 * ENTERPRISE DATA LAYER (Sprint 5 - 2026-01-24)
 *
 * Provides centralized engineering task data fetching with:
 * - Project-scoped queries
 * - Automatic caching and deduplication
 * - Loading and error states
 * - Task statistics
 * - Type-safe return values
 *
 * @example
 * ```tsx
 * function TaskList({ projectId }: { projectId: string }) {
 *   const { tasks, stats, isLoading, error } = useEngineeringTasks(projectId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Alert severity="error">{error.message}</Alert>;
 *
 *   return tasks.map(t => <TaskCard key={t.id} task={t} />);
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, EngineeringTask, TaskStats } from '../../services/api';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface UseEngineeringTasksOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Refetch interval (ms, 0 to disable) */
  refetchInterval?: number;
  /** Filter by status */
  status?: EngineeringTask['status'];
  /** Filter by priority */
  priority?: EngineeringTask['priority'];
  /** Filter by type */
  type?: EngineeringTask['type'];
}

export interface UseEngineeringTasksReturn {
  /** List of engineering tasks */
  tasks: EngineeringTask[];
  /** Task statistics */
  stats: TaskStats | null;
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
}

export interface UseTaskReturn {
  /** Single task */
  task: EngineeringTask | null;
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

export const taskQueryKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskQueryKeys.all, 'list'] as const,
  list: (projectId: string, filters?: Record<string, unknown>) =>
    [...taskQueryKeys.lists(), projectId, filters] as const,
  details: () => [...taskQueryKeys.all, 'detail'] as const,
  detail: (taskId: string) => [...taskQueryKeys.details(), taskId] as const,
};

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchTasks(
  projectId?: string,
  filters?: { status?: string; priority?: string; type?: string },
): Promise<{ tasks: EngineeringTask[]; stats: TaskStats | null }> {
  logger.debug('Fetching engineering tasks', { projectId, filters });

  const tasks = await apiService.getEngineeringTasks(projectId, filters);

  // Calculate stats from tasks
  const stats: TaskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
    review: tasks.filter(t => t.status === 'review').length,
    overdue: tasks.filter(t => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < new Date() && t.status !== 'completed';
    }).length,
    completionRate: tasks.length > 0
      ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100)
      : 0,
  };

  logger.debug('Fetched engineering tasks', { projectId, count: tasks.length });
  return { tasks, stats };
}

async function fetchTask(taskId: string): Promise<EngineeringTask | null> {
  logger.debug('Fetching task', { taskId });
  const task = await apiService.getTaskById(taskId);
  if (!task) {
    logger.warn('Task not found', { taskId });
  }
  return task;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for fetching engineering tasks for a project
 */
export function useEngineeringTasks(
  projectId?: string,
  options: UseEngineeringTasksOptions = {},
): UseEngineeringTasksReturn {
  const { enabled = true, staleTime = 30000, refetchInterval = 0, status, priority, type } = options;

  const filters = { status, priority, type };
  const hasFilters = status || priority || type;

  const query = useQuery({
    queryKey: hasFilters
      ? taskQueryKeys.list(projectId || 'all', filters)
      : taskQueryKeys.list(projectId || 'all'),
    queryFn: () => fetchTasks(projectId, filters),
    enabled,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  return {
    tasks: query.data?.tasks || [],
    stats: query.data?.stats || null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
    totalCount: query.data?.tasks?.length || 0,
  };
}

/**
 * Hook for fetching a single task by ID
 */
export function useTask(
  taskId: string | undefined,
  options: Omit<UseEngineeringTasksOptions, 'status' | 'priority' | 'type'> = {},
): UseTaskReturn {
  const { enabled = true, staleTime = 30000 } = options;

  const query = useQuery({
    queryKey: taskQueryKeys.detail(taskId || ''),
    queryFn: () => fetchTask(taskId!),
    enabled: enabled && !!taskId,
    staleTime,
  });

  return {
    task: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for updating task status
 */
export function useUpdateTaskStatus(projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateTaskStatus'],
    mutationFn: async ({
      taskId,
      status,
    }: {
      taskId: string;
      status: EngineeringTask['status'];
    }): Promise<EngineeringTask> => {
      logger.info('Updating task status', { taskId, status });
      return apiService.updateTaskStatus(taskId, status);
    },
    onMutate: async ({ taskId, status }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: taskQueryKeys.list(projectId || 'all'),
      });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<{ tasks: EngineeringTask[]; stats: TaskStats }>(
        taskQueryKeys.list(projectId || 'all'),
      );

      // Optimistically update
      if (previousData) {
        queryClient.setQueryData(taskQueryKeys.list(projectId || 'all'), {
          ...previousData,
          tasks: previousData.tasks.map(t =>
            t.id === taskId ? { ...t, status, updatedAt: new Date().toISOString() } : t,
          ),
        });
      }

      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(taskQueryKeys.list(projectId || 'all'), context.previousData);
      }
      logger.error('Failed to update task status', { error });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: taskQueryKeys.lists(),
      });
    },
  });
}

/**
 * Hook for creating a new task
 */
export function useCreateTask(projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['createTask'],
    mutationFn: async (
      task: Omit<EngineeringTask, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
    ): Promise<EngineeringTask> => {
      logger.info('Creating task', { title: task.title });
      return apiService.createTask(task);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskQueryKeys.lists(),
      });
    },
    onError: (error) => {
      logger.error('Failed to create task', { error });
    },
  });
}

// ============================================================================
// PREFETCH UTILITIES
// ============================================================================

/**
 * Prefetch tasks for a project (useful for navigation)
 */
export function usePrefetchTasks() {
  const queryClient = useQueryClient();

  return (projectId: string) => {
    queryClient.prefetchQuery({
      queryKey: taskQueryKeys.list(projectId),
      queryFn: () => fetchTasks(projectId),
    });
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useEngineeringTasks;
