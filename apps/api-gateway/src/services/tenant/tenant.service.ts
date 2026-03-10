/**
 * Tenant Management Service
 *
 * Enterprise-grade tenant management with CRUD operations, subscription handling,
 * usage limits enforcement, and PIPEDA compliance support.
 *
 * @module services/tenant/tenant.service
 * @version 1.0.0
 */

import {
  PrismaClient,
  TenantStatus,
  SubscriptionTier,
  Prisma,
} from '@prisma/client';
import { Pool, PoolClient } from 'pg';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import { EnterpriseAuditLogger } from '@ectropy/shared/audit';
import {
  Tenant,
  TenantWithUsage,
  TenantUsage,
  TenantSummary,
  TenantDetailResponse,
  TenantUserSummary,
  TenantProjectSummary,
  TenantListResponse,
  TenantListQuery,
  CreateTenantRequest,
  UpdateTenantRequest,
  UpdateSubscriptionRequest,
  UsageCheckResult,
  TenantManagementError,
  TenantErrorCode,
  SUBSCRIPTION_TIER_LIMITS,
  isValidSlug,
  isValidHexColor,
  isValidStatusTransition,
  canDowngradeTier,
  buildTenantUrn,
} from './types.js';

// ==============================================================================
// Service Configuration
// ==============================================================================

export interface TenantServiceConfig {
  prisma: PrismaClient;
  pool: Pool;
  auditLogger?: EnterpriseAuditLogger;
}

// ==============================================================================
// Tenant Service
// ==============================================================================

export class TenantService {
  private prisma: PrismaClient;
  private pool: Pool;
  private auditLogger: EnterpriseAuditLogger;

  constructor(config: TenantServiceConfig) {
    this.prisma = config.prisma;
    this.pool = config.pool;
    this.auditLogger =
      config.auditLogger ||
      EnterpriseAuditLogger.getInstance({
        enablePersistence: true,
        retentionDays: 2555,
        complianceFrameworks: ['SOX', 'PIPEDA', 'GDPR'],
        sensitiveFieldRedaction: true,
      });
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Create a new tenant
   */
  async createTenant(
    request: CreateTenantRequest,
    createdBy: string
  ): Promise<Tenant> {
    // Validate slug format
    if (!isValidSlug(request.slug)) {
      throw new TenantManagementError(
        'Invalid slug format. Must be lowercase alphanumeric with hyphens, 3-100 characters.',
        TenantErrorCode.INVALID_SLUG,
        { slug: request.slug }
      );
    }

    // Check for existing tenant with same slug
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: request.slug },
    });

    if (existing) {
      throw new TenantManagementError(
        `Tenant with slug '${request.slug}' already exists`,
        TenantErrorCode.TENANT_ALREADY_EXISTS,
        { slug: request.slug }
      );
    }

    // Get tier limits
    const tier = request.subscriptionTier || SubscriptionTier.FREE;
    const tierLimits = SUBSCRIPTION_TIER_LIMITS[tier];

    // Calculate trial end date (14 days from now)
    const trialEndsAt =
      tier === SubscriptionTier.FREE
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : null;

    // Create tenant
    const tenant = await this.prisma.tenant.create({
      data: {
        slug: request.slug,
        name: request.name,
        status: TenantStatus.TRIAL,
        subscription_tier: tier,
        primary_email: request.primaryEmail,
        billing_email: request.billingEmail || request.primaryEmail,
        phone: request.phone,
        max_projects:
          tierLimits.maxProjects === -1 ? 9999 : tierLimits.maxProjects,
        max_users: tierLimits.maxUsers === -1 ? 9999 : tierLimits.maxUsers,
        max_storage_gb:
          tierLimits.maxStorageGb === -1 ? 9999 : tierLimits.maxStorageGb,
        data_region: request.dataRegion || 'us-west-2',
        compliance_flags: request.complianceFlags || [],
        settings: (request.settings || {}) as Prisma.InputJsonValue,
        trial_ends_at: trialEndsAt,
      },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.created',
      userId: createdBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenant.id}`,
      outcome: 'success',
      metadata: {
        slug: tenant.slug,
        name: tenant.name,
        tier: tenant.subscription_tier,
        dataRegion: tenant.data_region,
      },
    });

    logger.info('Tenant created', {
      tenantId: tenant.id,
      slug: tenant.slug,
      createdBy,
    });

    return this.mapPrismaToTenant(tenant);
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<Tenant | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    return tenant ? this.mapPrismaToTenant(tenant) : null;
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    return tenant ? this.mapPrismaToTenant(tenant) : null;
  }

  /**
   * Get tenant with full usage statistics
   */
  async getTenantWithUsage(tenantId: string): Promise<TenantWithUsage | null> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) return null;

    const usage = await this.getTenantUsage(tenantId);

    return { ...tenant, usage };
  }

  /**
   * Get tenant details with users, projects, and audit summary
   */
  async getTenantDetails(
    tenantId: string
  ): Promise<TenantDetailResponse | null> {
    const tenantWithUsage = await this.getTenantWithUsage(tenantId);
    if (!tenantWithUsage) return null;

    // Get users
    const users = await this.getTenantUsers(tenantId);

    // Get projects
    const projects = await this.getTenantProjects(tenantId);

    // Get audit summary
    const auditSummary = await this.getAuditSummary(tenantId);

    return {
      tenant: tenantWithUsage,
      users,
      projects,
      auditSummary,
    };
  }

  /**
   * List tenants with pagination and filtering
   */
  async listTenants(query: TenantListQuery = {}): Promise<TenantListResponse> {
    const {
      page = 1,
      pageSize = 20,
      status,
      subscriptionTier,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    // Build where clause
    const where: Prisma.TenantWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (subscriptionTier) {
      where.subscription_tier = subscriptionTier;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { primary_email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.tenant.count({ where });

    // Build orderBy
    const orderByMap: Record<string, Prisma.TenantOrderByWithRelationInput> = {
      name: { name: sortOrder },
      createdAt: { created_at: sortOrder },
      status: { status: sortOrder },
      subscriptionTier: { subscription_tier: sortOrder },
    };

    // Get tenants with counts
    const tenants = await this.prisma.tenant.findMany({
      where,
      orderBy: orderByMap[sortBy] || { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            users: true,
            projects: true,
          },
        },
      },
    });

    // Map to summary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantSummaries: TenantSummary[] = tenants.map((t: any) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      subscriptionTier: t.subscription_tier,
      primaryEmail: t.primary_email,
      userCount: t._count.users,
      projectCount: t._count.projects,
      createdAt: t.created_at,
    }));

    return {
      tenants: tenantSummaries,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Update tenant
   */
  async updateTenant(
    tenantId: string,
    updates: UpdateTenantRequest,
    updatedBy: string
  ): Promise<Tenant> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    // Validate primary color if provided
    if (updates.primaryColor && !isValidHexColor(updates.primaryColor)) {
      throw new TenantManagementError(
        'Invalid color format. Must be hex color like #FF5733.',
        TenantErrorCode.INVALID_SLUG,
        { primaryColor: updates.primaryColor }
      );
    }

    // Build update data
    const data: Prisma.TenantUpdateInput = {};

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.primaryEmail !== undefined)
      data.primary_email = updates.primaryEmail;
    if (updates.billingEmail !== undefined)
      data.billing_email = updates.billingEmail;
    if (updates.phone !== undefined) data.phone = updates.phone;
    if (updates.logoUrl !== undefined) data.logo_url = updates.logoUrl;
    if (updates.primaryColor !== undefined)
      data.primary_color = updates.primaryColor;
    if (updates.customDomain !== undefined)
      data.custom_domain = updates.customDomain;
    if (updates.dataRegion !== undefined) data.data_region = updates.dataRegion;
    if (updates.complianceFlags !== undefined)
      data.compliance_flags = updates.complianceFlags;
    if (updates.settings !== undefined)
      data.settings = updates.settings as Prisma.InputJsonValue;
    if (updates.features !== undefined)
      data.features = updates.features as Prisma.InputJsonValue;

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data,
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.updated',
      userId: updatedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenantId}`,
      outcome: 'success',
      metadata: { updates: Object.keys(updates) },
    });

    logger.info('Tenant updated', {
      tenantId,
      updatedBy,
      fields: Object.keys(updates),
    });

    return this.mapPrismaToTenant(updated);
  }

  /**
   * Delete tenant (soft delete via ARCHIVED status)
   */
  async deleteTenant(tenantId: string, deletedBy: string): Promise<void> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    // Must be CANCELLED before archiving
    if (tenant.status !== TenantStatus.CANCELLED) {
      throw new TenantManagementError(
        'Tenant must be cancelled before archiving',
        TenantErrorCode.INVALID_STATUS_TRANSITION,
        { currentStatus: tenant.status }
      );
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.ARCHIVED },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.archived',
      userId: deletedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenantId}`,
      outcome: 'success',
      metadata: { previousStatus: tenant.status },
    });

    logger.info('Tenant archived', { tenantId, deletedBy });
  }

  // ============================================================================
  // Status Management
  // ============================================================================

  /**
   * Suspend a tenant
   */
  async suspendTenant(
    tenantId: string,
    reason: string,
    suspendedBy: string
  ): Promise<Tenant> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    if (!isValidStatusTransition(tenant.status, TenantStatus.SUSPENDED)) {
      throw new TenantManagementError(
        `Cannot suspend tenant with status '${tenant.status}'`,
        TenantErrorCode.INVALID_STATUS_TRANSITION,
        { currentStatus: tenant.status }
      );
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.SUSPENDED,
        suspended_at: new Date(),
      },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.suspended',
      userId: suspendedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenantId}`,
      outcome: 'success',
      metadata: { reason, previousStatus: tenant.status },
    });

    logger.warn('Tenant suspended', { tenantId, reason, suspendedBy });

    return this.mapPrismaToTenant(updated);
  }

  /**
   * Reactivate a suspended tenant
   */
  async reactivateTenant(
    tenantId: string,
    reactivatedBy: string,
    notes?: string
  ): Promise<Tenant> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    if (tenant.status !== TenantStatus.SUSPENDED) {
      throw new TenantManagementError(
        'Only suspended tenants can be reactivated',
        TenantErrorCode.INVALID_STATUS_TRANSITION,
        { currentStatus: tenant.status }
      );
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.ACTIVE,
        suspended_at: null,
      },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.reactivated',
      userId: reactivatedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenantId}`,
      outcome: 'success',
      metadata: { notes },
    });

    logger.info('Tenant reactivated', { tenantId, reactivatedBy });

    return this.mapPrismaToTenant(updated);
  }

  /**
   * Cancel a tenant subscription
   */
  async cancelTenant(
    tenantId: string,
    reason: string,
    cancelledBy: string
  ): Promise<Tenant> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    if (!isValidStatusTransition(tenant.status, TenantStatus.CANCELLED)) {
      throw new TenantManagementError(
        `Cannot cancel tenant with status '${tenant.status}'`,
        TenantErrorCode.INVALID_STATUS_TRANSITION,
        { currentStatus: tenant.status }
      );
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.CANCELLED,
        cancelled_at: new Date(),
      },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.cancelled',
      userId: cancelledBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenantId}`,
      outcome: 'success',
      metadata: { reason, previousStatus: tenant.status },
    });

    logger.warn('Tenant cancelled', { tenantId, reason, cancelledBy });

    return this.mapPrismaToTenant(updated);
  }

  /**
   * Activate a trial tenant (convert to ACTIVE)
   */
  async activateTenant(tenantId: string, activatedBy: string): Promise<Tenant> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    if (!isValidStatusTransition(tenant.status, TenantStatus.ACTIVE)) {
      throw new TenantManagementError(
        `Cannot activate tenant with status '${tenant.status}'`,
        TenantErrorCode.INVALID_STATUS_TRANSITION,
        { currentStatus: tenant.status }
      );
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.ACTIVE,
        trial_ends_at: null,
      },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.activated',
      userId: activatedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenantId}`,
      outcome: 'success',
      metadata: { previousStatus: tenant.status },
    });

    logger.info('Tenant activated', { tenantId, activatedBy });

    return this.mapPrismaToTenant(updated);
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * Update tenant subscription tier
   */
  async updateSubscription(
    tenantId: string,
    request: UpdateSubscriptionRequest,
    updatedBy: string
  ): Promise<Tenant> {
    const tenantWithUsage = await this.getTenantWithUsage(tenantId);
    if (!tenantWithUsage) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    const currentTierIndex = Object.values(SubscriptionTier).indexOf(
      tenantWithUsage.subscriptionTier
    );
    const newTierIndex = Object.values(SubscriptionTier).indexOf(
      request.subscriptionTier
    );

    // Check if this is a downgrade
    if (newTierIndex < currentTierIndex) {
      const downgradeCheck = canDowngradeTier(
        tenantWithUsage.usage,
        request.subscriptionTier
      );
      if (!downgradeCheck.allowed) {
        throw new TenantManagementError(
          downgradeCheck.reason || 'Downgrade not allowed',
          TenantErrorCode.DOWNGRADE_NOT_ALLOWED,
          {
            currentTier: tenantWithUsage.subscriptionTier,
            requestedTier: request.subscriptionTier,
            usage: tenantWithUsage.usage,
          }
        );
      }
    }

    // Get new tier limits
    const newLimits = SUBSCRIPTION_TIER_LIMITS[request.subscriptionTier];

    // Apply custom limits if provided (for Enterprise tier)
    const maxProjects =
      request.customLimits?.maxProjects ??
      (newLimits.maxProjects === -1 ? 9999 : newLimits.maxProjects);
    const maxUsers =
      request.customLimits?.maxUsers ??
      (newLimits.maxUsers === -1 ? 9999 : newLimits.maxUsers);
    const maxStorageGb =
      request.customLimits?.maxStorageGb ??
      (newLimits.maxStorageGb === -1 ? 9999 : newLimits.maxStorageGb);

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscription_tier: request.subscriptionTier,
        max_projects: maxProjects,
        max_users: maxUsers,
        max_storage_gb: maxStorageGb,
      },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.subscription_changed',
      userId: updatedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `tenant/${tenantId}`,
      outcome: 'success',
      metadata: {
        previousTier: tenantWithUsage.subscriptionTier,
        newTier: request.subscriptionTier,
        newLimits: { maxProjects, maxUsers, maxStorageGb },
      },
    });

    logger.info('Tenant subscription updated', {
      tenantId,
      previousTier: tenantWithUsage.subscriptionTier,
      newTier: request.subscriptionTier,
      updatedBy,
    });

    return this.mapPrismaToTenant(updated);
  }

  // ============================================================================
  // Usage & Limits
  // ============================================================================

  /**
   * Get tenant usage statistics
   */
  async getTenantUsage(tenantId: string): Promise<TenantUsage> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            users: true,
            projects: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new TenantManagementError(
        'Tenant not found',
        TenantErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    // Calculate storage (simplified - in production, aggregate from actual storage)
    const storageUsedGb = await this.calculateStorageUsage(tenantId);

    const projectCount = tenant._count.projects;
    const userCount = tenant._count.users;

    // Calculate percentages
    const projectPercentage =
      tenant.max_projects > 0
        ? Math.round((projectCount / tenant.max_projects) * 100)
        : 0;
    const userPercentage =
      tenant.max_users > 0
        ? Math.round((userCount / tenant.max_users) * 100)
        : 0;
    const storagePercentage =
      tenant.max_storage_gb > 0
        ? Math.round((storageUsedGb / tenant.max_storage_gb) * 100)
        : 0;

    // Determine if over limit
    const overLimitFields: string[] = [];
    if (projectCount > tenant.max_projects) overLimitFields.push('projects');
    if (userCount > tenant.max_users) overLimitFields.push('users');
    if (storageUsedGb > tenant.max_storage_gb) overLimitFields.push('storage');

    return {
      projectCount,
      userCount,
      storageUsedGb,
      limits: {
        projects: {
          used: projectCount,
          max: tenant.max_projects,
          percentage: projectPercentage,
        },
        users: {
          used: userCount,
          max: tenant.max_users,
          percentage: userPercentage,
        },
        storage: {
          used: storageUsedGb,
          max: tenant.max_storage_gb,
          percentage: storagePercentage,
        },
      },
      isOverLimit: overLimitFields.length > 0,
      overLimitFields,
    };
  }

  /**
   * Check if tenant can add a resource (project, user, etc.)
   */
  async checkUsageLimit(
    tenantId: string,
    resource: 'projects' | 'users' | 'storage',
    additionalAmount: number = 1
  ): Promise<UsageCheckResult> {
    const usage = await this.getTenantUsage(tenantId);

    let current: number;
    let limit: number;

    switch (resource) {
      case 'projects':
        current = usage.projectCount;
        limit = usage.limits.projects.max;
        break;
      case 'users':
        current = usage.userCount;
        limit = usage.limits.users.max;
        break;
      case 'storage':
        current = usage.storageUsedGb;
        limit = usage.limits.storage.max;
        break;
    }

    const allowed = current + additionalAmount <= limit;

    return {
      allowed,
      resource,
      current,
      limit,
      message: allowed
        ? undefined
        : `${resource} limit exceeded: ${current}/${limit} (adding ${additionalAmount} would exceed limit)`,
    };
  }

  /**
   * Enforce usage limit (throws if exceeded)
   */
  async enforceUsageLimit(
    tenantId: string,
    resource: 'projects' | 'users' | 'storage',
    additionalAmount: number = 1
  ): Promise<void> {
    const check = await this.checkUsageLimit(
      tenantId,
      resource,
      additionalAmount
    );

    if (!check.allowed) {
      throw new TenantManagementError(
        check.message || 'Usage limit exceeded',
        TenantErrorCode.LIMIT_EXCEEDED,
        { resource, current: check.current, limit: check.limit }
      );
    }
  }

  // ============================================================================
  // User Management
  // ============================================================================

  /**
   * Get users for a tenant
   */
  async getTenantUsers(tenantId: string): Promise<TenantUserSummary[]> {
    const users = await this.prisma.user.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        is_platform_admin: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return users.map((u: any) => ({
      id: u.id,
      email: u.email || '',
      name: u.full_name,
      role: u.role,
      isPlatformAdmin: u.is_platform_admin || false,
      lastLoginAt: null, // Would need session tracking
      createdAt: u.created_at,
    }));
  }

  /**
   * Add user to tenant
   */
  async addUserToTenant(
    tenantId: string,
    userId: string,
    addedBy: string
  ): Promise<void> {
    // Check usage limit
    await this.enforceUsageLimit(tenantId, 'users');

    // Check user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new TenantManagementError(
        'User not found',
        TenantErrorCode.USER_NOT_FOUND,
        { userId }
      );
    }

    if (user.tenant_id === tenantId) {
      throw new TenantManagementError(
        'User already belongs to this tenant',
        TenantErrorCode.USER_ALREADY_IN_TENANT,
        { userId, tenantId }
      );
    }

    // Update user's tenant
    await this.prisma.user.update({
      where: { id: userId },
      data: { tenant_id: tenantId },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.user_added',
      userId: addedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `user/${userId}`,
      outcome: 'success',
      metadata: { tenantId },
    });

    logger.info('User added to tenant', { userId, tenantId, addedBy });
  }

  /**
   * Remove user from tenant
   */
  async removeUserFromTenant(
    tenantId: string,
    userId: string,
    removedBy: string,
    removeProjectRoles: boolean = true
  ): Promise<void> {
    // Check user exists and belongs to tenant
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.tenant_id !== tenantId) {
      throw new TenantManagementError(
        'User not found in this tenant',
        TenantErrorCode.USER_NOT_FOUND,
        { userId, tenantId }
      );
    }

    // Check if this is the last admin
    const adminCount = await this.prisma.user.count({
      where: {
        tenant_id: tenantId,
        is_platform_admin: true,
      },
    });

    if (user.is_platform_admin && adminCount <= 1) {
      throw new TenantManagementError(
        'Cannot remove the last administrator from the tenant',
        TenantErrorCode.CANNOT_REMOVE_LAST_ADMIN,
        { userId, tenantId }
      );
    }

    // Remove project roles if requested
    if (removeProjectRoles) {
      await this.prisma.projectRole.deleteMany({
        where: { user_id: userId },
      });
    }

    // Remove user from tenant
    await this.prisma.user.update({
      where: { id: userId },
      data: { tenant_id: null },
    });

    // Audit log
    await this.auditLogger.logAdminAction({
      action: 'tenant.user_removed',
      userId: removedBy,
      sourceIp: '0.0.0.0', // Server-side action
      resource: `user/${userId}`,
      outcome: 'success',
      metadata: { tenantId, removeProjectRoles },
    });

    logger.info('User removed from tenant', { userId, tenantId, removedBy });
  }

  // ============================================================================
  // Project Management
  // ============================================================================

  /**
   * Get projects for a tenant
   */
  async getTenantProjects(tenantId: string): Promise<TenantProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: { construction_elements: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      elementCount: p._count.construction_elements,
      createdAt: p.created_at,
      updatedAt: p.updated_at || p.created_at,
    }));
  }

  // ============================================================================
  // Audit & Analytics
  // ============================================================================

  /**
   * Get audit summary for tenant
   */
  async getAuditSummary(
    tenantId: string
  ): Promise<{ lastActivity: Date | null; actionsThisMonth: number }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [lastActivity, actionsThisMonth] = await Promise.all([
      this.prisma.auditLog.findFirst({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
      this.prisma.auditLog.count({
        where: {
          tenant_id: tenantId,
          created_at: { gte: startOfMonth },
        },
      }),
    ]);

    return {
      lastActivity: lastActivity?.created_at || null,
      actionsThisMonth,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Calculate storage usage for a tenant
   */
  private async calculateStorageUsage(tenantId: string): Promise<number> {
    // In production, this would aggregate from file storage, IFC uploads, etc.
    // For now, estimate based on project count
    const projectCount = await this.prisma.project.count({
      where: { tenant_id: tenantId },
    });

    // Estimate ~0.5GB per project
    return Math.round(projectCount * 0.5 * 10) / 10;
  }

  /**
   * Map Prisma tenant to domain Tenant type
   */
  private mapPrismaToTenant(prisma: any): Tenant {
    return {
      id: prisma.id,
      slug: prisma.slug,
      name: prisma.name,
      status: prisma.status,
      subscriptionTier: prisma.subscription_tier,
      primaryEmail: prisma.primary_email,
      billingEmail: prisma.billing_email,
      phone: prisma.phone,
      logoUrl: prisma.logo_url,
      primaryColor: prisma.primary_color,
      customDomain: prisma.custom_domain,
      maxProjects: prisma.max_projects,
      maxUsers: prisma.max_users,
      maxStorageGb: prisma.max_storage_gb,
      dataRegion: prisma.data_region,
      complianceFlags: prisma.compliance_flags || [],
      retentionDays: prisma.retention_days,
      settings: prisma.settings,
      features: prisma.features,
      stripeCustomerId: prisma.stripe_customer_id,
      billingCycleDay: prisma.billing_cycle_day,
      trialEndsAt: prisma.trial_ends_at,
      suspendedAt: prisma.suspended_at,
      cancelledAt: prisma.cancelled_at,
      createdAt: prisma.created_at,
      updatedAt: prisma.updated_at,
    };
  }
}

// ==============================================================================
// Singleton
// ==============================================================================

let tenantServiceInstance: TenantService | null = null;

/**
 * Get or create tenant service singleton
 */
export function getTenantService(config: TenantServiceConfig): TenantService {
  if (!tenantServiceInstance) {
    tenantServiceInstance = new TenantService(config);
  }
  return tenantServiceInstance;
}

/**
 * Initialize tenant service
 */
export function initializeTenantService(
  config: TenantServiceConfig
): TenantService {
  tenantServiceInstance = new TenantService(config);
  return tenantServiceInstance;
}

export default TenantService;
