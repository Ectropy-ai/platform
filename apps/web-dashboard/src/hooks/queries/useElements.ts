/**
 * useElements - Shared hook for construction element data
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Provides centralized construction element data fetching with:
 * - Project-scoped queries
 * - Automatic caching and deduplication
 * - Loading and error states
 * - Type-safe return values
 *
 * @example
 * ```tsx
 * function ElementList({ projectId }: { projectId: string }) {
 *   const { elements, isLoading, error } = useElements(projectId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <Alert severity="error">{error.message}</Alert>;
 *
 *   return elements.map(e => <ElementCard key={e.id} element={e} />);
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, ConstructionElement } from '../../services/api';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface UseElementsOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Refetch interval (ms, 0 to disable) */
  refetchInterval?: number;
  /** Filter by status */
  status?: string;
  /** Filter by type */
  type?: string;
}

export interface UseElementsReturn {
  /** List of construction elements */
  elements: ConstructionElement[];
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

export interface UseElementReturn {
  /** Single element */
  element: ConstructionElement | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

export interface UpdateElementInput {
  id: string;
  status?: ConstructionElement['status'];
  progress?: number;
  assignedTo?: string;
  notes?: string;
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchElements(
  projectId: string,
  filters?: { status?: string; type?: string },
): Promise<ConstructionElement[]> {
  logger.debug('Fetching elements', { projectId, filters });

  let elements = await apiService.getConstructionElements(projectId);

  // Apply client-side filters if provided
  if (filters?.status) {
    elements = elements.filter(e => e.status === filters.status);
  }
  if (filters?.type) {
    elements = elements.filter(e => e.type === filters.type);
  }

  logger.debug('Fetched elements', { projectId, count: elements.length });
  return elements;
}

async function fetchElement(
  elementId: string,
  projectId: string,
): Promise<ConstructionElement | null> {
  logger.debug('Fetching element', { elementId, projectId });
  const elements = await apiService.getConstructionElements(projectId);
  const element = elements.find(e => e.id === elementId) || null;
  if (!element) {
    logger.warn('Element not found', { elementId });
  }
  return element;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for fetching construction elements for a project
 */
export function useElements(
  projectId: string | undefined,
  options: UseElementsOptions = {},
): UseElementsReturn {
  const { enabled = true, staleTime, refetchInterval = 0, status, type } = options;

  const filters = { status, type };
  const hasFilters = status || type;

  const query = useQuery({
    queryKey: hasFilters
      ? queryKeys.elements.list(projectId || '', filters)
      : queryKeys.elements.list(projectId || ''),
    queryFn: () => fetchElements(projectId!, filters),
    enabled: enabled && !!projectId,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  return {
    elements: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
    totalCount: query.data?.length || 0,
  };
}

/**
 * Hook for fetching a single element by ID
 */
export function useElement(
  elementId: string | undefined,
  projectId: string | undefined,
  options: Omit<UseElementsOptions, 'status' | 'type'> = {},
): UseElementReturn {
  const { enabled = true, staleTime } = options;

  const query = useQuery({
    queryKey: queryKeys.elements.detail(elementId || ''),
    queryFn: () => fetchElement(elementId!, projectId!),
    enabled: enabled && !!elementId && !!projectId,
    staleTime,
  });

  return {
    element: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching elements across all user's projects
 * Useful for dashboard overview sections
 */
export function useAllElements(options: UseElementsOptions = {}): UseElementsReturn {
  const { enabled = true, staleTime, status, type } = options;

  const query = useQuery({
    queryKey: ['elements', 'all', { status, type }],
    queryFn: async () => {
      // First fetch all projects, then fetch elements for each
      const projects = await apiService.getProjects();
      const allElements: ConstructionElement[] = [];

      for (const project of projects) {
        try {
          const elements = await apiService.getConstructionElements(project.id);
          allElements.push(...elements);
        } catch (error) {
          logger.warn('Failed to fetch elements for project', { projectId: project.id, error });
        }
      }

      // Apply filters
      let filtered = allElements;
      if (status) {
        filtered = filtered.filter(e => e.status === status);
      }
      if (type) {
        filtered = filtered.filter(e => e.type === type);
      }

      return filtered;
    },
    enabled,
    staleTime,
  });

  return {
    elements: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
    totalCount: query.data?.length || 0,
  };
}

/**
 * Hook for updating an element
 */
export function useUpdateElement(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateElement'],
    mutationFn: async (input: UpdateElementInput): Promise<ConstructionElement> => {
      logger.info('Updating element', { id: input.id });
      // Note: This would call apiService.updateElement() when implemented
      throw new Error('Update element API not implemented');
    },
    onMutate: async input => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.elements.list(projectId),
      });

      // Snapshot previous value
      const previousElements = queryClient.getQueryData<ConstructionElement[]>(
        queryKeys.elements.list(projectId),
      );

      // Optimistically update
      if (previousElements) {
        queryClient.setQueryData<ConstructionElement[]>(
          queryKeys.elements.list(projectId),
          previousElements.map(e => (e.id === input.id ? { ...e, ...input } : e)),
        );
      }

      return { previousElements };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousElements) {
        queryClient.setQueryData(queryKeys.elements.list(projectId), context.previousElements);
      }
      logger.error('Failed to update element', { error });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.elements.list(projectId),
      });
    },
  });
}

/**
 * Hook for batch updating element progress (contractor workflow)
 */
export function useBatchUpdateProgress(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['batchUpdateProgress'],
    mutationFn: async (updates: Array<{ id: string; progress: number }>): Promise<void> => {
      logger.info('Batch updating progress', { count: updates.length });
      // Note: This would call a batch update API when implemented
      throw new Error('Batch update API not implemented');
    },
    onMutate: async updates => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.elements.list(projectId),
      });

      const previousElements = queryClient.getQueryData<ConstructionElement[]>(
        queryKeys.elements.list(projectId),
      );

      if (previousElements) {
        const updateMap = new Map(updates.map(u => [u.id, u.progress]));
        queryClient.setQueryData<ConstructionElement[]>(
          queryKeys.elements.list(projectId),
          previousElements.map(e => {
            const newProgress = updateMap.get(e.id);
            return newProgress !== undefined ? { ...e, progress: newProgress } : e;
          }),
        );
      }

      return { previousElements };
    },
    onError: (error, variables, context) => {
      if (context?.previousElements) {
        queryClient.setQueryData(queryKeys.elements.list(projectId), context.previousElements);
      }
      logger.error('Failed to batch update progress', { error });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.elements.list(projectId),
      });
    },
  });
}

// ============================================================================
// PREFETCH UTILITIES
// ============================================================================

/**
 * Prefetch elements for a project (useful for navigation)
 */
export function usePrefetchElements() {
  const queryClient = useQueryClient();

  return (projectId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.elements.list(projectId),
      queryFn: () => fetchElements(projectId),
    });
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useElements;
