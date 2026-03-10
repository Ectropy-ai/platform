/**
 * ==============================================================================
 * ECTROPY CONSOLE TYPES
 * ==============================================================================
 * Type definitions for the Ectropy Employee Console.
 * Covers tenants, users, system health, and monitoring data.
 * ==============================================================================
 */

// ==============================================================================
// Tenant Types
// ==============================================================================

export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type SubscriptionTier = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface TenantUsage {
  userCount: number;
  projectCount: number;
  storageUsedGb: number;
}

export interface TenantLimits {
  maxUsers: number;
  maxProjects: number;
  maxStorageGb: number;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  subscriptionTier: SubscriptionTier;
  primaryEmail: string | null;
  usage: TenantUsage;
  limits: TenantLimits;
  createdAt: string;
  trialEndsAt: string | null;
  suspendedAt: string | null;
}

export interface TenantListResponse {
  tenants: Tenant[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
  primaryEmail: string;
  subscriptionTier: SubscriptionTier;
  billingEmail?: string;
}

// ==============================================================================
// User Types
// ==============================================================================

export type StakeholderRole =
  | 'owner'
  | 'architect'
  | 'contractor'
  | 'engineer'
  | 'consultant'
  | 'inspector'
  | 'site_manager'
  | 'admin';

export interface ConsoleUser {
  id: string;
  email: string;
  fullName: string | null;
  role: StakeholderRole;
  roles: StakeholderRole[];
  isAuthorized: boolean;
  isPlatformAdmin: boolean;
  authorizedAt: string | null;
  authorizedBy: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  createdAt: string;
  lastLogin: string | null;
}

export interface UserListResponse {
  users: ConsoleUser[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AuthorizeUserRequest {
  userId: string;
  reason?: string;
}

export interface RevokeUserRequest {
  userId: string;
  reason: string;
}

export interface InviteUserRequest {
  email: string;
  fullName?: string;
  role: StakeholderRole;
  tenantId?: string;
  sendEmail: boolean;
  reason?: string;
}

export interface InviteUserResponse {
  id: string;
  email: string;
  fullName: string | null;
  role: StakeholderRole;
  isAuthorized: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  invitationSent: boolean;
  createdAt: string;
}

// ==============================================================================
// System Health Types
// ==============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTimeMs: number | null;
  lastChecked: string;
  details?: Record<string, unknown>;
}

export interface SystemMetrics {
  requestsPerMinute: number;
  errorRate: number;
  p95LatencyMs: number;
  activeConnections: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
}

export interface AlertSummary {
  critical: number;
  warning: number;
  info: number;
}

export interface SystemHealthResponse {
  overall: HealthStatus;
  services: {
    apiGateway: ServiceHealth;
    mcpServer: ServiceHealth;
    database: ServiceHealth;
    redis: ServiceHealth;
    speckle: ServiceHealth;
  };
  metrics: SystemMetrics;
  alerts: AlertSummary;
  timestamp: string;
}

// ==============================================================================
// API Response Types
// ==============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp: string;
}

// ==============================================================================
// UI State Types
// ==============================================================================

export interface ConsoleFilters {
  search?: string;
  status?: TenantStatus | 'ALL';
  tier?: SubscriptionTier | 'ALL';
  authorized?: boolean | 'ALL';
  limit?: number;
  offset?: number;
}

export interface DialogState<T = unknown> {
  open: boolean;
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ==============================================================================
// Demo Provisioning Types
// ==============================================================================

export type CatalogBuildingType =
  | 'residential-single-family'
  | 'residential-multi-family'
  | 'commercial-office'
  | 'commercial-large';

export interface ProvisionDemoRequest {
  buildingType: CatalogBuildingType;
  projectName?: string;
  sendWelcomeEmail?: boolean;
}

export interface ProvisionedProject {
  id: string;
  name: string;
  catalogBuildingType: string;
  speckleStreamId: string | null;
  status: string;
  estimatedBudget: string | null;
}

export interface ProvisionDemoResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    isAuthorized: boolean;
    wasAuthorized: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    wasCreated: boolean;
  };
  project: ProvisionedProject;
  viewerUrl: string;
  welcomeEmailSent: boolean;
  message: string;
}

export interface CleanupDemosRequest {
  olderThanDays?: number;
  dryRun?: boolean;
}

export interface CleanupDemosResponse {
  success: boolean;
  dryRun: boolean;
  deleted: number;
  projects: Array<{
    id: string;
    name: string;
    tenantId: string;
    createdAt: string;
  }>;
  message: string;
}
