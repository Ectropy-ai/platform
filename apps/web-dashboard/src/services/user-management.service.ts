/**
 * ==============================================================================
 * USER MANAGEMENT SERVICE (M4)
 * ==============================================================================
 * API client for admin user management operations
 * Milestone: User Management M4 (Admin UI Layer)
 * Purpose: Frontend service layer for user authorization and tenant management
 * ==============================================================================
 */

import { apiClient, ApiResponse } from './apiClient';
import {
  User,
  UserListResponse,
  UserFilters,
  AuthorizeUserRequest,
  RevokeAuthorizationRequest,
  UserAuthorizationResponse,
} from '../types/user-management.types';

/**
 * User Management Service - Frontend API client for admin operations
 *
 * Integrates with M3 backend endpoints:
 * - GET    /api/admin/user-management/users        List users
 * - POST   /api/admin/user-management/users/:id/authorize  Authorize user
 * - POST   /api/admin/user-management/users/:id/revoke     Revoke authorization
 *
 * Security:
 * - Platform admin role required for all operations (enforced by backend)
 * - JWT authentication via apiClient
 * - CSRF protection via apiClient
 */
export class UserManagementService {
  /**
   * List users with optional filtering and pagination
   *
   * @param filters - Query parameters for filtering users
   * @returns Promise<ApiResponse<UserListResponse>>
   *
   * Example:
   * ```typescript
   * const response = await userManagementService.listUsers({
   *   isAuthorized: false,
   *   search: 'john',
   *   limit: 50,
   *   offset: 0
   * });
   * ```
   */
  async listUsers(filters: UserFilters = {}): Promise<ApiResponse<UserListResponse>> {
    const params = new URLSearchParams();

    if (filters.isAuthorized !== undefined) {
      params.append('isAuthorized', filters.isAuthorized.toString());
    }

    if (filters.search && filters.search.trim()) {
      params.append('search', filters.search.trim());
    }

    if (filters.limit !== undefined) {
      params.append('limit', Math.min(filters.limit, 100).toString()); // Cap at 100
    }

    if (filters.offset !== undefined) {
      params.append('offset', Math.max(filters.offset, 0).toString()); // Ensure non-negative
    }

    const queryString = params.toString();
    const endpoint = `/api/admin/user-management/users${queryString ? `?${queryString}` : ''}`;

    return apiClient.get<UserListResponse>(endpoint);
  }

  /**
   * Authorize user for platform access
   *
   * @param request - Authorization request with userId and optional reason
   * @returns Promise<ApiResponse<UserAuthorizationResponse>>
   *
   * Example:
   * ```typescript
   * const response = await userManagementService.authorizeUser({
   *   userId: 'user-uuid',
   *   reason: 'Trial partner approved'
   * });
   * ```
   *
   * Validation:
   * - Cannot authorize users who are already authorized
   * - Cannot authorize platform admins (already authorized)
   * - Reason is optional but recommended for audit trail
   */
  async authorizeUser(
    request: AuthorizeUserRequest,
  ): Promise<ApiResponse<UserAuthorizationResponse>> {
    const { userId, reason } = request;

    // Client-side validation
    if (!userId || !userId.trim()) {
      return {
        success: false,
        error: 'User ID is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      };
    }

    const endpoint = `/api/admin/user-management/users/${encodeURIComponent(userId)}/authorize`;

    return apiClient.post<UserAuthorizationResponse>(endpoint, { reason });
  }

  /**
   * Revoke user authorization
   *
   * @param request - Revocation request with userId and required reason
   * @returns Promise<ApiResponse<UserAuthorizationResponse>>
   *
   * Example:
   * ```typescript
   * const response = await userManagementService.revokeAuthorization({
   *   userId: 'user-uuid',
   *   reason: 'Trial ended'
   * });
   * ```
   *
   * Validation:
   * - Cannot revoke users who are not currently authorized
   * - Cannot revoke platform admins (prevents lockout)
   * - Reason is REQUIRED for compliance audit trail
   */
  async revokeAuthorization(
    request: RevokeAuthorizationRequest,
  ): Promise<ApiResponse<UserAuthorizationResponse>> {
    const { userId, reason } = request;

    // Client-side validation
    if (!userId || !userId.trim()) {
      return {
        success: false,
        error: 'User ID is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      };
    }

    if (!reason || !reason.trim()) {
      return {
        success: false,
        error: 'Reason is required for revoking authorization',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      };
    }

    if (reason.length > 500) {
      return {
        success: false,
        error: 'Reason must not exceed 500 characters',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      };
    }

    const endpoint = `/api/admin/user-management/users/${encodeURIComponent(userId)}/revoke`;

    return apiClient.post<UserAuthorizationResponse>(endpoint, { reason: reason.trim() });
  }

  /**
   * Get user by ID (helper method for single user lookup)
   *
   * @param userId - User UUID
   * @returns Promise<ApiResponse<User | null>>
   *
   * Note: This uses the list endpoint with search filter
   * Backend M3 does not have a GET /users/:id endpoint
   */
  async getUserById(userId: string): Promise<ApiResponse<User | null>> {
    if (!userId || !userId.trim()) {
      return {
        success: false,
        error: 'User ID is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      };
    }

    // Use list endpoint to find specific user
    // This is less efficient but works with current M3 API
    const response = await this.listUsers({ limit: 1000 }); // Load all users

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || 'Failed to fetch users',
        code: response.code,
        timestamp: new Date().toISOString(),
      };
    }

    const user = response.data.users.find(u => u.id === userId);

    if (!user) {
      return {
        success: false,
        error: 'User not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get pending users (not yet authorized)
   *
   * @param filters - Additional filters (search, limit, offset)
   * @returns Promise<ApiResponse<UserListResponse>>
   *
   * Example:
   * ```typescript
   * const response = await userManagementService.getPendingUsers({
   *   limit: 50,
   *   offset: 0
   * });
   * ```
   */
  async getPendingUsers(
    filters: Omit<UserFilters, 'isAuthorized'> = {},
  ): Promise<ApiResponse<UserListResponse>> {
    return this.listUsers({
      ...filters,
      isAuthorized: false,
    });
  }

  /**
   * Get authorized users
   *
   * @param filters - Additional filters (search, limit, offset)
   * @returns Promise<ApiResponse<UserListResponse>>
   *
   * Example:
   * ```typescript
   * const response = await userManagementService.getAuthorizedUsers({
   *   limit: 50,
   *   offset: 0
   * });
   * ```
   */
  async getAuthorizedUsers(
    filters: Omit<UserFilters, 'isAuthorized'> = {},
  ): Promise<ApiResponse<UserListResponse>> {
    return this.listUsers({
      ...filters,
      isAuthorized: true,
    });
  }
}

/**
 * Singleton instance of the User Management Service
 * Use this instance throughout the application for consistency
 */
export const userManagementService = new UserManagementService();
