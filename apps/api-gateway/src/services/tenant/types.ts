/**
 * Tenant Management Types
 *
 * Type definitions and DTOs for multi-tenant management API.
 * Supports PIPEDA compliance and enterprise scaling requirements.
 *
 * @module services/tenant/types
 * @version 1.0.0
 */

import { TenantStatus, SubscriptionTier } from '@prisma/client';

// ==============================================================================
// Subscription Tier Configuration
// ==============================================================================

/**
 * Subscription tier limits configuration
 */
export const SUBSCRIPTION_TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    maxProjects: 1,
    maxUsers: 5,
    maxStorageGb: 5,
    features: ['basic'],
  },
  BASIC: {
    maxProjects: 5,
    maxUsers: 25,
    maxStorageGb: 25,
    features: ['basic', 'analytics'],
  },
  PROFESSIONAL: {
    maxProjects: 25,
    maxUsers: 100,
    maxStorageGb: 100,
    features: ['basic', 'analytics', 'advanced', 'api'],
  },
  ENTERPRISE: {
    maxProjects: -1, // Unlimited
    maxUsers: -1, // Unlimited
    maxStorageGb: -1, // Unlimited
    features: ['basic', 'analytics', 'advanced', 'api', 'sso', 'custom'],
  },
};

// ==============================================================================
// Core Types
// ==============================================================================

/**
 * Tier limits configuration
 */
export interface TierLimits {
  maxProjects: number;
  maxUsers: number;
  maxStorageGb: number;
  features: string[];
}

/**
 * Tenant entity (database record)
 */
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  subscriptionTier: SubscriptionTier;
  primaryEmail: string | null;
  billingEmail: string | null;
  phone: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  customDomain: string | null;
  maxProjects: number;
  maxUsers: number;
  maxStorageGb: number;
  dataRegion: string;
  complianceFlags: string[];
  retentionDays: number;
  settings: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
  stripeCustomerId: string | null;
  billingCycleDay: number;
  trialEndsAt: Date | null;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant with usage statistics
 */
export interface TenantWithUsage extends Tenant {
  usage: TenantUsage;
}

/**
 * Tenant usage statistics
 */
export interface TenantUsage {
  projectCount: number;
  userCount: number;
  storageUsedGb: number;
  limits: {
    projects: { used: number; max: number; percentage: number };
    users: { used: number; max: number; percentage: number };
    storage: { used: number; max: number; percentage: number };
  };
  isOverLimit: boolean;
  overLimitFields: string[];
}

// ==============================================================================
// Request DTOs
// ==============================================================================

/**
 * Create tenant request
 */
export interface CreateTenantRequest {
  slug: string;
  name: string;
  primaryEmail: string;
  billingEmail?: string;
  phone?: string;
  subscriptionTier?: SubscriptionTier;
  dataRegion?: string;
  complianceFlags?: string[];
  settings?: Record<string, unknown>;
}

/**
 * Update tenant request
 */
export interface UpdateTenantRequest {
  name?: string;
  primaryEmail?: string;
  billingEmail?: string;
  phone?: string;
  logoUrl?: string;
  primaryColor?: string;
  customDomain?: string;
  dataRegion?: string;
  complianceFlags?: string[];
  settings?: Record<string, unknown>;
  features?: Record<string, unknown>;
}

/**
 * Update subscription tier request
 */
export interface UpdateSubscriptionRequest {
  subscriptionTier: SubscriptionTier;
  customLimits?: {
    maxProjects?: number;
    maxUsers?: number;
    maxStorageGb?: number;
  };
}

/**
 * Suspend tenant request
 */
export interface SuspendTenantRequest {
  reason: string;
  suspendedBy: string;
}

/**
 * Reactivate tenant request
 */
export interface ReactivateTenantRequest {
  reactivatedBy: string;
  notes?: string;
}

/**
 * Add user to tenant request
 */
export interface AddTenantUserRequest {
  userId: string;
  role?: string;
}

/**
 * Remove user from tenant request
 */
export interface RemoveTenantUserRequest {
  userId: string;
  removeProjectRoles?: boolean;
}

// ==============================================================================
// Response DTOs
// ==============================================================================

/**
 * Tenant list response
 */
export interface TenantListResponse {
  tenants: TenantSummary[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Tenant summary for list views
 */
export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  subscriptionTier: SubscriptionTier;
  primaryEmail: string | null;
  userCount: number;
  projectCount: number;
  createdAt: Date;
}

/**
 * Tenant detail response
 */
export interface TenantDetailResponse {
  tenant: TenantWithUsage;
  users: TenantUserSummary[];
  projects: TenantProjectSummary[];
  auditSummary: {
    lastActivity: Date | null;
    actionsThisMonth: number;
  };
}

/**
 * Tenant user summary
 */
export interface TenantUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  isPlatformAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/**
 * Tenant project summary
 */
export interface TenantProjectSummary {
  id: string;
  name: string;
  status: string;
  elementCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Usage check result
 */
export interface UsageCheckResult {
  allowed: boolean;
  resource: 'projects' | 'users' | 'storage';
  current: number;
  limit: number;
  message?: string;
}

// ==============================================================================
// Query Parameters
// ==============================================================================

/**
 * Tenant list query parameters
 */
export interface TenantListQuery {
  page?: number;
  pageSize?: number;
  status?: TenantStatus;
  subscriptionTier?: SubscriptionTier;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'status' | 'subscriptionTier';
  sortOrder?: 'asc' | 'desc';
}

// ==============================================================================
// Error Types
// ==============================================================================

/**
 * Tenant management error codes
 */
export enum TenantErrorCode {
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_ALREADY_EXISTS = 'TENANT_ALREADY_EXISTS',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  TENANT_CANCELLED = 'TENANT_CANCELLED',
  INVALID_SLUG = 'INVALID_SLUG',
  INVALID_TIER = 'INVALID_TIER',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_IN_TENANT = 'USER_ALREADY_IN_TENANT',
  CANNOT_REMOVE_LAST_ADMIN = 'CANNOT_REMOVE_LAST_ADMIN',
  DOWNGRADE_NOT_ALLOWED = 'DOWNGRADE_NOT_ALLOWED',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
}

/**
 * Tenant management error
 */
export class TenantManagementError extends Error {
  constructor(
    message: string,
    public readonly code: TenantErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TenantManagementError';
  }
}

// ==============================================================================
// URN Builders
// ==============================================================================

/**
 * Build tenant URN
 */
export function buildTenantUrn(slug: string): string {
  return `urn:luhtech:ectropy:tenant:${slug}`;
}

/**
 * Build tenant user URN
 */
export function buildTenantUserUrn(tenantSlug: string, userId: string): string {
  return `urn:luhtech:ectropy:tenant:${tenantSlug}:user:${userId}`;
}

// ==============================================================================
// Validation Helpers
// ==============================================================================

/**
 * Validate tenant slug format
 */
export function isValidSlug(slug: string): boolean {
  // Lowercase alphanumeric with hyphens, 3-100 chars, no leading/trailing hyphens
  const slugRegex = /^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])?$/;
  return slugRegex.test(slug);
}

/**
 * Validate hex color format
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Check if status transition is valid
 */
export function isValidStatusTransition(
  from: TenantStatus,
  to: TenantStatus
): boolean {
  const validTransitions: Record<TenantStatus, TenantStatus[]> = {
    TRIAL: ['ACTIVE', 'SUSPENDED', 'CANCELLED'],
    ACTIVE: ['SUSPENDED', 'CANCELLED'],
    SUSPENDED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
    CANCELLED: ['ARCHIVED'],
    ARCHIVED: [], // Terminal state
  };

  return validTransitions[from]?.includes(to) ?? false;
}

/**
 * Check if tier downgrade is allowed based on current usage
 */
export function canDowngradeTier(
  usage: TenantUsage,
  newTier: SubscriptionTier
): { allowed: boolean; reason?: string } {
  const newLimits = SUBSCRIPTION_TIER_LIMITS[newTier];

  if (newLimits.maxProjects !== -1 && usage.projectCount > newLimits.maxProjects) {
    return {
      allowed: false,
      reason: `Current project count (${usage.projectCount}) exceeds new tier limit (${newLimits.maxProjects})`,
    };
  }

  if (newLimits.maxUsers !== -1 && usage.userCount > newLimits.maxUsers) {
    return {
      allowed: false,
      reason: `Current user count (${usage.userCount}) exceeds new tier limit (${newLimits.maxUsers})`,
    };
  }

  if (newLimits.maxStorageGb !== -1 && usage.storageUsedGb > newLimits.maxStorageGb) {
    return {
      allowed: false,
      reason: `Current storage usage (${usage.storageUsedGb}GB) exceeds new tier limit (${newLimits.maxStorageGb}GB)`,
    };
  }

  return { allowed: true };
}
