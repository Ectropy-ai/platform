/**
 * Shared types and interfaces for Ectropy platform
 */

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string; // Primary role from StakeholderRole enum (matches Prisma schema)
  roles: string[]; // All assigned roles for multi-role support
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  name?: string; // Computed field: firstName + lastName
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface GraphQLContext {
  roles?: Array<{
    userId: string;
    projectId: string;
    role: string;
    permissions: string[];
  }>;
  permissions?: string[];
  isAuthenticated: boolean;
}

export interface PredictionValue {
  value: number;
  confidence: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Version information
export const SHARED_TYPES_VERSION = '1.0.0';
