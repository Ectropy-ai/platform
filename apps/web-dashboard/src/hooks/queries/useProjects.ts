/**
 * useProjects - Shared hook for project data
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Provides centralized project data fetching with:
 * - Automatic caching and deduplication
 * - Loading and error states
 * - Optimistic updates for mutations
 * - Type-safe return values
 *
 * @example
 * ```tsx
 * function ProjectList() {
 *   const { projects, isLoading, error } = useProjects();
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Alert severity="error">{error.message}</Alert>;
 *
 *   return projects.map(p => <ProjectCard key={p.id} project={p} />);
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, Project } from '../../services/api';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface UseProjectsOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Refetch interval (ms, 0 to disable) */
  refetchInterval?: number;
}

export interface UseProjectsReturn {
  /** List of projects */
  projects: Project[];
  /** Loading state */
  isLoading: boolean;
  /** Fetching state (background refetch) */
  isFetching: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

export interface UseProjectReturn {
  /** Single project */
  project: Project | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  description?: string;
  status?: 'active' | 'completed' | 'planning';
  location?: string;
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchProjects(): Promise<Project[]> {
  logger.debug('Fetching projects');
  const projects = await apiService.getProjects();
  logger.debug('Fetched projects', { count: projects.length });
  return projects;
}

async function fetchProject(id: string): Promise<Project | null> {
  logger.debug('Fetching project', { id });
  const projects = await apiService.getProjects();
  const project = projects.find(p => p.id === id) || null;
  if (!project) {
    logger.warn('Project not found', { id });
  }
  return project;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for fetching all projects
 */
export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const { enabled = true, staleTime, refetchInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.projects.all,
    queryFn: fetchProjects,
    enabled,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  return {
    projects: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching a single project by ID
 */
export function useProject(
  id: string | undefined,
  options: UseProjectsOptions = {},
): UseProjectReturn {
  const { enabled = true, staleTime } = options;

  const query = useQuery({
    queryKey: queryKeys.projects.detail(id || ''),
    queryFn: () => fetchProject(id!),
    enabled: enabled && !!id,
    staleTime,
  });

  return {
    project: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for creating a project
 */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['createProject'],
    mutationFn: async (input: CreateProjectInput): Promise<Project> => {
      logger.info('Creating project', { name: input.name });
      // Note: This would call apiService.createProject() when implemented
      // For now, throw an error indicating the API is not implemented
      throw new Error('Create project API not implemented');
    },
    onSuccess: newProject => {
      // Update projects list cache
      queryClient.setQueryData<Project[]>(queryKeys.projects.all, old =>
        old ? [...old, newProject] : [newProject],
      );
      logger.info('Project created', { id: newProject.id });
    },
    onError: error => {
      logger.error('Failed to create project', { error });
    },
  });
}

/**
 * Hook for updating a project
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateProject'],
    mutationFn: async (input: UpdateProjectInput): Promise<Project> => {
      logger.info('Updating project', { id: input.id });
      // Note: This would call apiService.updateProject() when implemented
      throw new Error('Update project API not implemented');
    },
    onMutate: async input => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });

      // Snapshot previous value
      const previousProjects = queryClient.getQueryData<Project[]>(queryKeys.projects.all);

      // Optimistically update
      if (previousProjects) {
        queryClient.setQueryData<Project[]>(
          queryKeys.projects.all,
          previousProjects.map(p => (p.id === input.id ? { ...p, ...input } : p)),
        );
      }

      return { previousProjects };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects.all, context.previousProjects);
      }
      logger.error('Failed to update project', { error });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

/**
 * Hook for deleting a project
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['deleteProject'],
    mutationFn: async (id: string): Promise<void> => {
      logger.info('Deleting project', { id });
      // Note: This would call apiService.deleteProject() when implemented
      throw new Error('Delete project API not implemented');
    },
    onMutate: async id => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });

      const previousProjects = queryClient.getQueryData<Project[]>(queryKeys.projects.all);

      if (previousProjects) {
        queryClient.setQueryData<Project[]>(
          queryKeys.projects.all,
          previousProjects.filter(p => p.id !== id),
        );
      }

      return { previousProjects };
    },
    onError: (error, id, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects.all, context.previousProjects);
      }
      logger.error('Failed to delete project', { error, id });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

// ============================================================================
// PREFETCH UTILITIES
// ============================================================================

/**
 * Prefetch projects data (useful for navigation)
 */
export function usePrefetchProjects() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.projects.all,
      queryFn: fetchProjects,
    });
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useProjects;
