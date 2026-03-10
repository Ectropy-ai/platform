/**
 * ==============================================================================
 * ECTROPY CONSOLE API SERVICE
 * ==============================================================================
 * HTTP client for console-specific API endpoints.
 * Handles tenant management, user authorization, and system health.
 *
 * Base URL: /api/console (routes to API Gateway)
 * Authentication: OAuth session cookie (credentials: 'include')
 * ==============================================================================
 */

import type {
  TenantListResponse,
  Tenant,
  CreateTenantRequest,
  UserListResponse,
  ConsoleUser,
  AuthorizeUserRequest,
  RevokeUserRequest,
  InviteUserRequest,
  InviteUserResponse,
  SystemHealthResponse,
  ApiResponse,
  ConsoleFilters,
  ProvisionDemoRequest,
  ProvisionDemoResponse,
  CleanupDemosRequest,
  CleanupDemosResponse,
} from '../types/console.types';

// ==============================================================================
// Configuration
// ==============================================================================

const getApiBaseUrl = (): string => {
  // Development: proxy through Vite
  if (import.meta.env.DEV) {
    return '';
  }
  // Production: same origin as console
  return '';
};

const API_BASE = getApiBaseUrl();

// ==============================================================================
// HTTP Utilities
// ==============================================================================

/**
 * Read CSRF token from XSRF-TOKEN cookie (Double Submit Cookie pattern).
 * The API gateway sets this cookie on every non-OAuth response via
 * security.middleware.ts:163-168. State-changing requests must return
 * the token in the X-CSRF-Token header for validation.
 */
function getCSRFToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const cookie = document.cookie
    .split(';')
    .find((c) => c.trim().startsWith('XSRF-TOKEN='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add CSRF token for state-changing requests (Double Submit Cookie pattern)
  // Aligns with web-dashboard pattern (api.ts:242-249)
  const method = options.method?.toUpperCase() || 'GET';
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const csrfToken = getCSRFToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const defaultOptions: RequestInit = {
    credentials: 'include', // Include OAuth session cookie
    headers,
  };

  try {
    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || `HTTP ${response.status}`,
        code: data.code || response.status.toString(),
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: data.data ?? data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      code: 'NETWORK_ERROR',
      timestamp: new Date().toISOString(),
    };
  }
}

// ==============================================================================
// Authentication
// ==============================================================================

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  roles: string[];
}

export async function getCurrentUser(): Promise<ApiResponse<CurrentUser>> {
  return apiRequest<CurrentUser>('/api/auth/me');
}

// ==============================================================================
// Tenant Management
// ==============================================================================

export async function getTenants(
  filters: ConsoleFilters = {}
): Promise<ApiResponse<TenantListResponse>> {
  const params = new URLSearchParams();

  if (filters.search) params.append('search', filters.search);
  if (filters.status && filters.status !== 'ALL')
    params.append('status', filters.status);
  if (filters.tier && filters.tier !== 'ALL')
    params.append('tier', filters.tier);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const query = params.toString();
  return apiRequest<TenantListResponse>(
    `/api/console/tenants${query ? `?${query}` : ''}`
  );
}

export async function getTenant(
  tenantId: string
): Promise<ApiResponse<Tenant>> {
  return apiRequest<Tenant>(
    `/api/console/tenants/${encodeURIComponent(tenantId)}`
  );
}

export async function createTenant(
  request: CreateTenantRequest
): Promise<ApiResponse<Tenant>> {
  return apiRequest<Tenant>('/api/console/tenants', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function updateTenant(
  tenantId: string,
  updates: Partial<CreateTenantRequest>
): Promise<ApiResponse<Tenant>> {
  return apiRequest<Tenant>(
    `/api/console/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(updates),
    }
  );
}

export async function suspendTenant(
  tenantId: string,
  reason: string
): Promise<ApiResponse<Tenant>> {
  return apiRequest<Tenant>(
    `/api/console/tenants/${encodeURIComponent(tenantId)}/suspend`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function activateTenant(
  tenantId: string
): Promise<ApiResponse<Tenant>> {
  return apiRequest<Tenant>(
    `/api/console/tenants/${encodeURIComponent(tenantId)}/activate`,
    {
      method: 'POST',
    }
  );
}

// ==============================================================================
// User Management (Cross-Tenant)
// ==============================================================================

export async function getUsers(
  filters: ConsoleFilters = {}
): Promise<ApiResponse<UserListResponse>> {
  const params = new URLSearchParams();

  if (filters.search) params.append('search', filters.search);
  if (filters.authorized !== undefined && filters.authorized !== 'ALL') {
    params.append('isAuthorized', filters.authorized.toString());
  }
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const query = params.toString();
  return apiRequest<UserListResponse>(
    `/api/console/users${query ? `?${query}` : ''}`
  );
}

export async function getUser(
  userId: string
): Promise<ApiResponse<ConsoleUser>> {
  return apiRequest<ConsoleUser>(
    `/api/console/users/${encodeURIComponent(userId)}`
  );
}

export async function authorizeUser(
  request: AuthorizeUserRequest
): Promise<ApiResponse<ConsoleUser>> {
  return apiRequest<ConsoleUser>(
    `/api/console/users/${encodeURIComponent(request.userId)}/authorize`,
    {
      method: 'POST',
      body: JSON.stringify({ reason: request.reason }),
    }
  );
}

export async function revokeUser(
  request: RevokeUserRequest
): Promise<ApiResponse<ConsoleUser>> {
  return apiRequest<ConsoleUser>(
    `/api/console/users/${encodeURIComponent(request.userId)}/revoke`,
    {
      method: 'POST',
      body: JSON.stringify({ reason: request.reason }),
    }
  );
}

export async function inviteUser(
  request: InviteUserRequest
): Promise<ApiResponse<InviteUserResponse>> {
  return apiRequest<InviteUserResponse>('/api/console/users/invite', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ==============================================================================
// Demo Provisioning (Unified Workflow)
// ==============================================================================

/**
 * Provision a complete demo for a user
 * Combines: Authorize user + Create tenant (if needed) + Create demo project
 * This is the one-click demo setup for partners and presentations
 */
export async function provisionDemo(
  userId: string,
  request: ProvisionDemoRequest
): Promise<ApiResponse<ProvisionDemoResponse>> {
  return apiRequest<ProvisionDemoResponse>(
    `/api/console/users/${encodeURIComponent(userId)}/provision-demo`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  );
}

/**
 * Cleanup old demo projects
 * Deletes demo projects older than specified days (default: 30)
 * Use dryRun: true to preview what would be deleted
 */
export async function cleanupDemos(
  request: CleanupDemosRequest = {}
): Promise<ApiResponse<CleanupDemosResponse>> {
  return apiRequest<CleanupDemosResponse>('/api/console/demo/cleanup', {
    method: 'DELETE',
    body: JSON.stringify(request),
  });
}

// ==============================================================================
// System Health
// ==============================================================================

export async function getSystemHealth(): Promise<
  ApiResponse<SystemHealthResponse>
> {
  return apiRequest<SystemHealthResponse>('/api/console/health');
}

export async function getMetrics(): Promise<
  ApiResponse<Record<string, number>>
> {
  return apiRequest<Record<string, number>>('/api/console/metrics');
}

// ==============================================================================
// Export Service Object
// ==============================================================================

export const consoleApi = {
  // Auth
  getCurrentUser,
  // Tenants
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  suspendTenant,
  activateTenant,
  // Users
  getUsers,
  getUser,
  authorizeUser,
  revokeUser,
  inviteUser,
  // Demo Provisioning
  provisionDemo,
  cleanupDemos,
  // Health
  getSystemHealth,
  getMetrics,
};

export default consoleApi;
