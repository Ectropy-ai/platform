/**
 * ==============================================================================
 * USER MANAGEMENT TYPES (M4)
 * ==============================================================================
 * TypeScript type definitions for admin user management interface
 * Milestone: User Management M4 (Admin UI Layer)
 * Purpose: Type-safe user authorization and tenant management
 * ==============================================================================
 */

// ==============================================================================
// User Management Types
// ==============================================================================

/**
 * User data from backend API
 */
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isAuthorized: boolean;
  isPlatformAdmin: boolean;
  authorizedAt: string | null;
  isActive: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  createdAt: string;
  lastLogin: string | null;
}

/**
 * User list API response
 */
export interface UserListResponse {
  users: User[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * User filter parameters
 */
export interface UserFilters {
  isAuthorized?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Authorize user request
 */
export interface AuthorizeUserRequest {
  userId: string;
  reason?: string;
}

/**
 * Revoke authorization request
 */
export interface RevokeAuthorizationRequest {
  userId: string;
  reason: string; // Required for revocation
}

/**
 * User authorization response
 */
export interface UserAuthorizationResponse {
  userId: string;
  email: string;
  authorized: boolean;
  authorizedAt?: string;
  revokedAt?: string;
}

// ==============================================================================
// UI State Types
// ==============================================================================

/**
 * User table column ID
 */
export type UserTableColumn =
  | 'email'
  | 'fullName'
  | 'role'
  | 'isAuthorized'
  | 'authorizedAt'
  | 'lastLogin'
  | 'tenant'
  | 'actions';

/**
 * User table sort order
 */
export interface UserTableSort {
  column: UserTableColumn;
  direction: 'asc' | 'desc';
}

/**
 * Dialog state for user authorization
 */
export interface UserAuthorizationDialogState {
  open: boolean;
  user: User | null;
  reason: string;
  loading: boolean;
  error: string | null;
}

// ==============================================================================
// API Client Types
// ==============================================================================

/**
 * API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  metadata?: Record<string, unknown>;
}

/**
 * API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Generic API response
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ==============================================================================
// Component Props
// ==============================================================================

/**
 * UserManagementTable props
 */
export interface UserManagementTableProps {
  users: User[];
  loading: boolean;
  onAuthorize: (user: User) => void;
  onRevoke: (user: User) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  totalRows: number;
}

/**
 * UserAuthorizeDialog props
 */
export interface UserAuthorizeDialogProps {
  open: boolean;
  user: User | null;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  loading: boolean;
}

/**
 * UserRevokeDialog props
 */
export interface UserRevokeDialogProps {
  open: boolean;
  user: User | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}

/**
 * UserFilters props
 */
export interface UserFiltersProps {
  filters: UserFilters;
  onFilterChange: (filters: UserFilters) => void;
  onClearFilters: () => void;
}
