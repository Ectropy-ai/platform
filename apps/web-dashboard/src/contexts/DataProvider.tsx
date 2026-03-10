/**
 * DataProvider - React Query Integration for Web Dashboard
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Purpose: Centralized data fetching and caching using React Query v5.
 * Provides:
 * - QueryClient configuration with enterprise defaults
 * - Automatic caching and request deduplication
 * - Background refetching for stale data
 * - Optimistic updates support
 * - Error boundary integration
 *
 * @see https://tanstack.com/query/latest
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query';
import { logger } from '../services/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default query options for enterprise reliability
 */
const DEFAULT_QUERY_OPTIONS = {
  /** Time before data is considered stale (5 minutes) */
  staleTime: 5 * 60 * 1000,
  /** Time to keep unused data in cache (30 minutes) */
  gcTime: 30 * 60 * 1000, // Previously called cacheTime in v4
  /** Retry failed requests 3 times with exponential backoff */
  retry: 3,
  /** Retry delay function */
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  /** Refetch on window focus for data freshness */
  refetchOnWindowFocus: true,
  /** Don't refetch on reconnect by default */
  refetchOnReconnect: 'always' as const,
  /** Keep previous data while fetching new data */
  placeholderData: (previousData: unknown) => previousData,
};

/**
 * Default mutation options
 */
const DEFAULT_MUTATION_OPTIONS = {
  /** Retry mutations once on failure */
  retry: 1,
};

// ============================================================================
// QUERY CLIENT FACTORY
// ============================================================================

/**
 * Create a configured QueryClient instance
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: DEFAULT_QUERY_OPTIONS,
      mutations: DEFAULT_MUTATION_OPTIONS,
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Log query errors for monitoring
        logger.error('Query error', {
          queryKey: query.queryKey,
          error: error instanceof Error ? error.message : String(error),
        });
      },
      onSuccess: (data, query) => {
        // Optional: Log successful queries in debug mode
        logger.debug('Query success', {
          queryKey: query.queryKey,
          dataLength: Array.isArray(data) ? data.length : 'N/A',
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, variables, context, mutation) => {
        // Log mutation errors
        logger.error('Mutation error', {
          mutationKey: mutation.options.mutationKey,
          error: error instanceof Error ? error.message : String(error),
        });
      },
      onSuccess: (data, variables, context, mutation) => {
        logger.debug('Mutation success', {
          mutationKey: mutation.options.mutationKey,
        });
      },
    }),
  });
}

// ============================================================================
// CONTEXT
// ============================================================================

/**
 * Data context value interface
 */
interface DataContextValue {
  /** QueryClient instance */
  queryClient: QueryClient;
  /** Invalidate all queries for a specific key */
  invalidateQueries: (queryKey: string[]) => Promise<void>;
  /** Prefetch data for a query */
  prefetchQuery: <T>(queryKey: string[], queryFn: () => Promise<T>) => Promise<void>;
  /** Clear all cached data */
  clearCache: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export interface DataProviderProps {
  children: ReactNode;
  /** Optional custom QueryClient (for testing) */
  queryClient?: QueryClient;
}

/**
 * DataProvider - Wraps application with React Query context
 *
 * @example
 * ```tsx
 * // In App.tsx
 * import { DataProvider } from './contexts/DataProvider';
 *
 * function App() {
 *   return (
 *     <DataProvider>
 *       <Router>
 *         <Routes />
 *       </Router>
 *     </DataProvider>
 *   );
 * }
 * ```
 */
export const DataProvider: React.FC<DataProviderProps> = ({
  children,
  queryClient: customClient,
}) => {
  // Create or use provided QueryClient
  const queryClient = useMemo(
    () => customClient || createQueryClient(),
    [customClient]
  );

  // Context value with utility functions
  const contextValue = useMemo<DataContextValue>(
    () => ({
      queryClient,

      invalidateQueries: async (queryKey: string[]) => {
        await queryClient.invalidateQueries({ queryKey });
        logger.debug('Invalidated queries', { queryKey });
      },

      prefetchQuery: async <T,>(queryKey: string[], queryFn: () => Promise<T>) => {
        await queryClient.prefetchQuery({
          queryKey,
          queryFn,
          staleTime: DEFAULT_QUERY_OPTIONS.staleTime,
        });
        logger.debug('Prefetched query', { queryKey });
      },

      clearCache: () => {
        queryClient.clear();
        logger.info('Query cache cleared');
      },
    }),
    [queryClient]
  );

  return (
    <DataContext.Provider value={contextValue}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </DataContext.Provider>
  );
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access DataContext utilities
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { invalidateQueries } = useDataContext();
 *
 *   const handleRefresh = () => {
 *     invalidateQueries(['projects']);
 *   };
 * }
 * ```
 */
export function useDataContext(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
}

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

/**
 * Centralized query key factory for consistency
 *
 * @example
 * ```typescript
 * // Use in queries
 * useQuery({
 *   queryKey: queryKeys.projects.all,
 *   queryFn: fetchProjects,
 * });
 *
 * // Use for invalidation
 * queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
 * ```
 */
export const queryKeys = {
  // Projects
  projects: {
    all: ['projects'] as const,
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.projects.lists(), filters] as const,
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.projects.details(), id] as const,
  },

  // Construction Elements
  elements: {
    all: ['elements'] as const,
    lists: () => [...queryKeys.elements.all, 'list'] as const,
    list: (projectId: string, filters?: Record<string, unknown>) =>
      [...queryKeys.elements.lists(), projectId, filters] as const,
    details: () => [...queryKeys.elements.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.elements.details(), id] as const,
  },

  // DAO Proposals
  proposals: {
    all: ['proposals'] as const,
    lists: () => [...queryKeys.proposals.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.proposals.lists(), filters] as const,
    details: () => [...queryKeys.proposals.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.proposals.details(), id] as const,
    votes: (proposalId: string) =>
      [...queryKeys.proposals.detail(proposalId), 'votes'] as const,
  },

  // Users (Admin)
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.users.lists(), filters] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.users.details(), id] as const,
  },

  // Tasks (Engineer)
  tasks: {
    all: ['tasks'] as const,
    lists: () => [...queryKeys.tasks.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.tasks.lists(), filters] as const,
    details: () => [...queryKeys.tasks.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tasks.details(), id] as const,
  },

  // Alerts (Engineer)
  alerts: {
    all: ['alerts'] as const,
    lists: () => [...queryKeys.alerts.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.alerts.lists(), filters] as const,
  },

  // Products (Manufacturer)
  products: {
    all: ['products'] as const,
    lists: () => [...queryKeys.products.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.products.lists(), filters] as const,
    details: () => [...queryKeys.products.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.products.details(), id] as const,
  },

  // Speckle Streams
  streams: {
    all: ['streams'] as const,
    lists: () => [...queryKeys.streams.all, 'list'] as const,
    list: (projectId?: string) =>
      [...queryKeys.streams.lists(), projectId] as const,
    details: () => [...queryKeys.streams.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.streams.details(), id] as const,
  },

  // System (Admin)
  system: {
    health: ['system', 'health'] as const,
    stats: ['system', 'stats'] as const,
    auditLogs: (filters?: Record<string, unknown>) =>
      ['system', 'auditLogs', filters] as const,
  },

  // DAO Templates
  governance: {
    templates: ['governance', 'templates'] as const,
  },

  // Demo Scenarios (Enterprise synthetic data)
  scenarios: {
    all: ['scenarios'] as const,
    lists: () => [...queryKeys.scenarios.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.scenarios.lists(), filters] as const,
    details: () => [...queryKeys.scenarios.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.scenarios.details(), id] as const,
    instances: {
      all: ['scenarios', 'instances'] as const,
      lists: () => [...queryKeys.scenarios.instances.all, 'list'] as const,
      list: (filters?: Record<string, unknown>) =>
        [...queryKeys.scenarios.instances.lists(), filters] as const,
      details: () => [...queryKeys.scenarios.instances.all, 'detail'] as const,
      detail: (id: string) =>
        [...queryKeys.scenarios.instances.details(), id] as const,
      playback: (id: string) =>
        [...queryKeys.scenarios.instances.detail(id), 'playback'] as const,
    },
  },
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default DataProvider;
export { createQueryClient, DEFAULT_QUERY_OPTIONS };
