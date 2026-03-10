/**
 * useSystemData - Shared hooks for admin/system data
 *
 * ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23)
 *
 * Provides centralized system data fetching for admin dashboards:
 * - User management
 * - System health/stats
 * - Audit logs
 * - Engineering tasks (when API available)
 * - Structural alerts (when API available)
 *
 * NOTE: Some endpoints are not yet implemented in the backend.
 * Feature flags control visibility of these features.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../contexts/DataProvider';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: string;
  createdAt: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    name: string;
    status: 'up' | 'down' | 'unknown';
    latencyMs?: number;
  }[];
  database: {
    connected: boolean;
    latencyMs?: number;
  };
  cache: {
    connected: boolean;
    hitRate?: number;
  };
}

export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  activeProjects: number;
  storageUsedGB: number;
  apiRequestsToday: number;
  errorRate: number;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId?: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export interface EngineeringTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  projectId?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StructuralAlert {
  id: string;
  elementId: string;
  elementName: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchUsers(): Promise<User[]> {
  logger.debug('Fetching users');
  try {
    const response = await fetch('/api/v1/users', {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    logger.warn('Users API not available, returning empty array');
    return [];
  }
}

async function fetchSystemHealth(): Promise<SystemHealth | null> {
  logger.debug('Fetching system health');
  try {
    const response = await fetch('/api/health', {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    const data = await response.json();
    return {
      status: data.status === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: data.services || [],
      database: data.database || { connected: true },
      cache: data.cache || { connected: false },
    };
  } catch (error) {
    logger.warn('Health API not available');
    return null;
  }
}

async function fetchSystemStats(): Promise<SystemStats | null> {
  logger.debug('Fetching system stats');
  try {
    const response = await fetch('/api/v1/admin/stats', {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Stats API failed: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    logger.warn('Stats API not available');
    return null;
  }
}

async function fetchAuditLogs(filters?: { limit?: number; userId?: string }): Promise<AuditLog[]> {
  logger.debug('Fetching audit logs', { filters });
  try {
    const params = new URLSearchParams();
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.userId) params.set('userId', filters.userId);

    const response = await fetch(`/api/v1/admin/audit?${params}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Audit logs API failed: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    logger.warn('Audit logs API not available');
    return [];
  }
}

async function fetchTasks(filters?: { status?: string; priority?: string }): Promise<EngineeringTask[]> {
  logger.debug('Fetching engineering tasks', { filters });
  // NOTE: This endpoint is not yet implemented
  // Return empty array until backend is ready
  logger.warn('Engineering tasks API not implemented');
  return [];
}

async function fetchAlerts(filters?: { severity?: string; status?: string }): Promise<StructuralAlert[]> {
  logger.debug('Fetching structural alerts', { filters });
  // NOTE: This endpoint is not yet implemented
  // Return empty array until backend is ready
  logger.warn('Structural alerts API not implemented');
  return [];
}

// ============================================================================
// USER HOOKS
// ============================================================================

/**
 * Hook for fetching all users (admin only)
 */
export function useUsers(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.users.all,
    queryFn: fetchUsers,
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    users: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for updating user status (admin only)
 */
export function useUpdateUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateUserStatus'],
    mutationFn: async ({ userId, status }: { userId: string; status: User['status'] }) => {
      logger.info('Updating user status', { userId, status });
      const response = await fetch(`/api/v1/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update user: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      logger.error('Failed to update user status', { error });
    },
  });
}

// ============================================================================
// SYSTEM HOOKS
// ============================================================================

/**
 * Hook for fetching system health
 */
export function useSystemHealth(options: { enabled?: boolean; refetchInterval?: number } = {}) {
  const { enabled = true, refetchInterval = 30000 } = options;

  const query = useQuery({
    queryKey: queryKeys.system.health,
    queryFn: fetchSystemHealth,
    enabled,
    refetchInterval,
    staleTime: 10000, // 10 seconds
  });

  return {
    health: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching system stats
 */
export function useSystemStats(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.system.stats,
    queryFn: fetchSystemStats,
    enabled,
    staleTime: 60000, // 1 minute
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for fetching audit logs
 */
export function useAuditLogs(options: { enabled?: boolean; limit?: number; userId?: string } = {}) {
  const { enabled = true, limit = 50, userId } = options;
  const filters = { limit, userId };

  const query = useQuery({
    queryKey: queryKeys.system.auditLogs(filters),
    queryFn: () => fetchAuditLogs(filters),
    enabled,
    staleTime: 30000, // 30 seconds
  });

  return {
    logs: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

// ============================================================================
// ENGINEERING HOOKS (Feature-flagged - API not yet implemented)
// ============================================================================

/**
 * Hook for fetching engineering tasks
 * NOTE: Requires backend API implementation
 */
export function useTasks(options: { enabled?: boolean; status?: string; priority?: string } = {}) {
  const { enabled = true, status, priority } = options;
  const filters = { status, priority };

  const query = useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => fetchTasks(filters),
    enabled,
    staleTime: 60000,
  });

  return {
    tasks: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook for creating a task
 * NOTE: Requires backend API implementation
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['createTask'],
    mutationFn: async (input: Partial<EngineeringTask>): Promise<EngineeringTask> => {
      logger.info('Creating task', { title: input.title });
      throw new Error('Create task API not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

/**
 * Hook for updating task status
 * NOTE: Requires backend API implementation
 */
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateTaskStatus'],
    mutationFn: async ({ taskId, status }: { taskId: string; status: EngineeringTask['status'] }) => {
      logger.info('Updating task status', { taskId, status });
      throw new Error('Update task API not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

// ============================================================================
// ALERTS HOOKS (Feature-flagged - API not yet implemented)
// ============================================================================

/**
 * Hook for fetching structural alerts
 * NOTE: Requires backend API implementation
 */
export function useAlerts(options: { enabled?: boolean; severity?: string; status?: string } = {}) {
  const { enabled = true, severity, status } = options;
  const filters = { severity, status };

  const query = useQuery({
    queryKey: queryKeys.alerts.list(filters),
    queryFn: () => fetchAlerts(filters),
    enabled,
    staleTime: 30000,
    refetchInterval: 30000, // Auto-refresh alerts
  });

  return {
    alerts: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
    // Computed values
    criticalCount: (query.data || []).filter(a => a.severity === 'critical' && a.status === 'open').length,
    openCount: (query.data || []).filter(a => a.status === 'open').length,
  };
}

/**
 * Hook for acknowledging an alert
 * NOTE: Requires backend API implementation
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['acknowledgeAlert'],
    mutationFn: async (alertId: string) => {
      logger.info('Acknowledging alert', { alertId });
      throw new Error('Acknowledge alert API not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  fetchUsers,
  fetchSystemHealth,
  fetchSystemStats,
  fetchAuditLogs,
  fetchTasks,
  fetchAlerts,
};
