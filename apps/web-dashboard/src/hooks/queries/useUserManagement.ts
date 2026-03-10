/**
 * useUserManagement - React Query hooks for admin user management
 *
 * MILESTONE: User Management M4 (Admin UI Layer)
 *
 * Provides centralized user management data fetching with:
 * - Automatic caching and deduplication
 * - Loading and error states
 * - Optimistic updates for mutations
 * - Type-safe return values
 *
 * @example
 * ```tsx
 * function UserManagementPage() {
 *   const { users, isLoading, error } = useUsers({ isAuthorized: false });
 *   const authorizeUser = useAuthorizeUser();
 *
 *   if (isLoading) return <CircularProgress />;
 *   if (error) return <Alert severity="error">{error.message}</Alert>;
 *
 *   return (
 *     <UserManagementTable
 *       users={users}
 *       onAuthorize={(user) => authorizeUser.mutate({ userId: user.id })}
 *     />
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userManagementService } from '../../services/user-management.service';
import {
  User,
  UserListResponse,
  UserFilters,
  AuthorizeUserRequest,
  RevokeAuthorizationRequest,
  UserAuthorizationResponse,
} from '../../types/user-management.types';
import { logger } from '../../services/logger';

// ==============================================================================
// QUERY KEYS
// ==============================================================================

/**
 * Query keys for user management operations
 * Following the factory pattern from DataProvider.tsx
 */
export const userManagementQueryKeys = {
  all: ['admin', 'users'] as const,
  lists: () => [...userManagementQueryKeys.all, 'list'] as const,
  list: (filters?: UserFilters) => [...userManagementQueryKeys.lists(), filters] as const,
  details: () => [...userManagementQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...userManagementQueryKeys.details(), id] as const,
};

// ==============================================================================
// TYPES
// ==============================================================================

export interface UseUsersOptions {
  /** Filter by authorization status */
  isAuthorized?: boolean;
  /** Search by email or name */
  search?: string;
  /** Results per page */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Refetch interval (ms, 0 to disable) */
  refetchInterval?: number;
}

export interface UseUsersReturn {
  /** List of users */
  users: User[];
  /** Pagination metadata */
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  /** Loading state (initial fetch) */
  isLoading: boolean;
  /** Fetching state (background refetch) */
  isFetching: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

export interface UseAuthorizeUserReturn {
  /** Mutation function */
  mutate: (request: AuthorizeUserRequest) => void;
  /** Async mutation function */
  mutateAsync: (request: AuthorizeUserRequest) => Promise<UserAuthorizationResponse>;
  /** Loading state */
  isLoading: boolean;
  /** Success state */
  isSuccess: boolean;
  /** Error state */
  error: Error | null;
  /** Reset mutation state */
  reset: () => void;
}

export interface UseRevokeAuthorizationReturn {
  /** Mutation function */
  mutate: (request: RevokeAuthorizationRequest) => void;
  /** Async mutation function */
  mutateAsync: (request: RevokeAuthorizationRequest) => Promise<UserAuthorizationResponse>;
  /** Loading state */
  isLoading: boolean;
  /** Success state */
  isSuccess: boolean;
  /** Error state */
  error: Error | null;
  /** Reset mutation state */
  reset: () => void;
}

// ==============================================================================
// FETCH FUNCTIONS
// ==============================================================================

/**
 * Fetch users with filtering and pagination
 */
async function fetchUsers(filters: UserFilters = {}): Promise<UserListResponse> {
  logger.debug('[useUserManagement] Fetching users', { filters });

  const response = await userManagementService.listUsers(filters);

  if (!response.success || !response.data) {
    const errorMessage = response.error || 'Failed to fetch users';
    logger.error('[useUserManagement] Failed to fetch users', {
      error: errorMessage,
      code: response.code,
    });
    throw new Error(errorMessage);
  }

  logger.debug('[useUserManagement] Fetched users successfully', {
    count: response.data.users.length,
    total: response.data.pagination.total,
  });

  return response.data;
}

// ==============================================================================
// QUERY HOOKS
// ==============================================================================

/**
 * Hook for fetching users with filtering and pagination
 *
 * @example
 * ```tsx
 * // Fetch all pending users
 * const { users, isLoading, pagination } = useUsers({
 *   isAuthorized: false,
 *   limit: 50,
 *   offset: 0
 * });
 *
 * // Fetch authorized users with search
 * const { users } = useUsers({
 *   isAuthorized: true,
 *   search: 'john',
 *   limit: 25
 * });
 * ```
 */
export function useUsers(options: UseUsersOptions = {}): UseUsersReturn {
  const {
    isAuthorized,
    search,
    limit = 50,
    offset = 0,
    enabled = true,
    staleTime = 30000, // 30 seconds (users data changes frequently)
    refetchInterval = 0,
  } = options;

  const filters: UserFilters = {
    isAuthorized,
    search,
    limit,
    offset,
  };

  const query = useQuery({
    queryKey: userManagementQueryKeys.list(filters),
    queryFn: () => fetchUsers(filters),
    enabled,
    staleTime,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  });

  return {
    users: query.data?.users || [],
    pagination: query.data?.pagination || {
      total: 0,
      limit,
      offset,
      hasMore: false,
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching pending users (not yet authorized)
 *
 * @example
 * ```tsx
 * const { users, isLoading } = usePendingUsers({ limit: 50 });
 * ```
 */
export function usePendingUsers(
  options: Omit<UseUsersOptions, 'isAuthorized'> = {},
): UseUsersReturn {
  return useUsers({ ...options, isAuthorized: false });
}

/**
 * Hook for fetching authorized users
 *
 * @example
 * ```tsx
 * const { users, isLoading } = useAuthorizedUsers({ limit: 50 });
 * ```
 */
export function useAuthorizedUsers(
  options: Omit<UseUsersOptions, 'isAuthorized'> = {},
): UseUsersReturn {
  return useUsers({ ...options, isAuthorized: true });
}

// ==============================================================================
// MUTATION HOOKS
// ==============================================================================

/**
 * Hook for authorizing a user
 *
 * @example
 * ```tsx
 * const authorizeUser = useAuthorizeUser();
 *
 * const handleAuthorize = (userId: string) => {
 *   authorizeUser.mutate(
 *     { userId, reason: 'Trial partner approved' },
 *     {
 *       onSuccess: () => {
 *         toast.success('User authorized successfully');
 *       },
 *       onError: (error) => {
 *         toast.error(`Failed to authorize user: ${error.message}`);
 *       }
 *     }
 *   );
 * };
 * ```
 */
export function useAuthorizeUser(): UseAuthorizeUserReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: ['authorizeUser'],
    mutationFn: async (request: AuthorizeUserRequest): Promise<UserAuthorizationResponse> => {
      logger.info('[useUserManagement] Authorizing user', { userId: request.userId });

      const response = await userManagementService.authorizeUser(request);

      if (!response.success || !response.data) {
        const errorMessage = response.error || 'Failed to authorize user';
        logger.error('[useUserManagement] Failed to authorize user', {
          error: errorMessage,
          code: response.code,
          userId: request.userId,
        });
        throw new Error(errorMessage);
      }

      logger.info('[useUserManagement] User authorized successfully', {
        userId: request.userId,
      });

      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all user lists to refetch fresh data
      queryClient.invalidateQueries({ queryKey: userManagementQueryKeys.lists() });

      logger.debug('[useUserManagement] Invalidated user lists after authorization', {
        userId: variables.userId,
      });
    },
    onError: (error, variables) => {
      logger.error('[useUserManagement] Authorization mutation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: variables.userId,
      });
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook for revoking user authorization
 *
 * @example
 * ```tsx
 * const revokeAuthorization = useRevokeAuthorization();
 *
 * const handleRevoke = (userId: string, reason: string) => {
 *   revokeAuthorization.mutate(
 *     { userId, reason },
 *     {
 *       onSuccess: () => {
 *         toast.success('User authorization revoked');
 *       },
 *       onError: (error) => {
 *         toast.error(`Failed to revoke authorization: ${error.message}`);
 *       }
 *     }
 *   );
 * };
 * ```
 */
export function useRevokeAuthorization(): UseRevokeAuthorizationReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: ['revokeAuthorization'],
    mutationFn: async (request: RevokeAuthorizationRequest): Promise<UserAuthorizationResponse> => {
      logger.info('[useUserManagement] Revoking user authorization', {
        userId: request.userId,
      });

      const response = await userManagementService.revokeAuthorization(request);

      if (!response.success || !response.data) {
        const errorMessage = response.error || 'Failed to revoke authorization';
        logger.error('[useUserManagement] Failed to revoke authorization', {
          error: errorMessage,
          code: response.code,
          userId: request.userId,
        });
        throw new Error(errorMessage);
      }

      logger.info('[useUserManagement] User authorization revoked successfully', {
        userId: request.userId,
      });

      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all user lists to refetch fresh data
      queryClient.invalidateQueries({ queryKey: userManagementQueryKeys.lists() });

      logger.debug('[useUserManagement] Invalidated user lists after revocation', {
        userId: variables.userId,
      });
    },
    onError: (error, variables) => {
      logger.error('[useUserManagement] Revocation mutation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: variables.userId,
      });
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// ==============================================================================
// PREFETCH UTILITIES
// ==============================================================================

/**
 * Prefetch users data (useful for navigation hover states)
 *
 * @example
 * ```tsx
 * const prefetchUsers = usePrefetchUsers();
 *
 * <Button onMouseEnter={() => prefetchUsers()}>
 *   View Users
 * </Button>
 * ```
 */
export function usePrefetchUsers() {
  const queryClient = useQueryClient();

  return (filters: UserFilters = {}) => {
    queryClient.prefetchQuery({
      queryKey: userManagementQueryKeys.list(filters),
      queryFn: () => fetchUsers(filters),
      staleTime: 30000, // 30 seconds
    });
  };
}

// ==============================================================================
// EXPORTS
// ==============================================================================

export default useUsers;
