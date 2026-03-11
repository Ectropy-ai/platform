/**
 * ==============================================================================
 * TENANT PROVISIONING SERVICE (M2.4)
 * ==============================================================================
 * Automated tenant creation workflow for trial signups
 * Milestone: User Management M2.4 (Backend Services Layer)
 * Purpose: Zero-touch tenant provisioning with default project creation
 * ==============================================================================
 */

import {
  PrismaClient,
  SubscriptionTier,
  TenantStatus,
  StakeholderRole,
} from '@prisma/client';
import { logger } from '@ectropy/shared/utils';
import {
  TwentyGraphQLClient,
  PersonService,
  CompanyService,
} from '@luh-tech/crm';
import {
  UserManagementError,
  UserManagementErrorCode,
  ProvisionTenantRequest,
  TenantProvisioningResponse,
  TenantLimitsValidation,
} from './types.js';

const SUBSCRIPTION_TIER_LIMITS = {
  [SubscriptionTier.FREE]: { maxProjects: 1, maxUsers: 5, maxStorageGb: 5 },
  [SubscriptionTier.BASIC]: { maxProjects: 5, maxUsers: 10, maxStorageGb: 50 },
  [SubscriptionTier.PROFESSIONAL]: {
    maxProjects: 25,
    maxUsers: 50,
    maxStorageGb: 250,
  },
  [SubscriptionTier.ENTERPRISE]: {
    maxProjects: 9999,
    maxUsers: 9999,
    maxStorageGb: 9999,
  },
};

/**
 * Tenant Provisioning Service - Automated tenant creation
 *
 * Automation:
 * - Tenant slug generation (from company name)
 * - Default project creation
 * - Owner assignment with billing admin role
 * - Trial end date calculation
 * - Subscription history logging
 * - CRM company + contact sync (fire-and-forget)
 */
export class TenantProvisioningService {
  private crmEnabled: boolean;
  private personService: PersonService | null;
  private companyService: CompanyService | null;

  constructor(
    private prisma: PrismaClient,
    crmConfig?: {
      crmEnabled?: boolean;
      crmApiUrl?: string;
      crmApiKey?: string;
    }
  ) {
    this.crmEnabled =
      crmConfig?.crmEnabled ?? process.env.CRM_ENABLED === 'true';
    if (this.crmEnabled && (crmConfig?.crmApiKey || process.env.CRM_API_KEY)) {
      const client = new TwentyGraphQLClient({
        apiUrl:
          crmConfig?.crmApiUrl ??
          process.env.CRM_API_URL ??
          'https://crm.luh.tech/graphql',
        apiKey: crmConfig?.crmApiKey ?? process.env.CRM_API_KEY ?? '',
      });
      this.personService = new PersonService(client);
      this.companyService = new CompanyService(client);
    } else {
      this.personService = null;
      this.companyService = null;
    }
    logger.info('[TenantProvisioningService] Initialized');
  }

  /**
   * Provision tenant (create tenant + assign owner + create default project)
   *
   * CRM: Syncs company record + links owner contact (fire-and-forget)
   */
  async provisionTenant(
    request: ProvisionTenantRequest
  ): Promise<TenantProvisioningResponse> {
    const registration = await this.prisma.userRegistration.findUnique({
      where: { id: request.registrationId },
    });

    if (!registration) {
      throw new UserManagementError(
        'Registration not found',
        UserManagementErrorCode.USER_NOT_FOUND,
        { registrationId: request.registrationId }
      );
    }

    // Generate slug if not provided
    const slug =
      request.tenantConfig.slug || this.generateSlug(request.tenantConfig.name);

    // Check for existing tenant with same slug
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      throw new UserManagementError(
        `Tenant with slug '${slug}' already exists`,
        UserManagementErrorCode.TENANT_PROVISIONING_FAILED,
        { slug }
      );
    }

    // Get tier limits
    const tierLimits =
      SUBSCRIPTION_TIER_LIMITS[request.tenantConfig.subscriptionTier];

    // Calculate trial end date (14 days from now)
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // Create tenant + user + membership + default project in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: request.tenantConfig.name,
          status: TenantStatus.TRIAL,
          subscription_tier: request.tenantConfig.subscriptionTier,
          primary_email: request.tenantConfig.primaryEmail,
          billing_email:
            request.tenantConfig.billingEmail ||
            request.tenantConfig.primaryEmail,
          max_projects: tierLimits.maxProjects,
          max_users: tierLimits.maxUsers,
          max_storage_gb: tierLimits.maxStorageGb,
          trial_ends_at: trialEndsAt,
        },
      });

      // 2. Create or update user
      let user = await tx.user.findUnique({
        where: { email: registration.email },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: registration.email,
            full_name:
              request.ownerInfo?.fullName ||
              registration.full_name ||
              registration.email,
            role: request.ownerInfo?.role || StakeholderRole.owner,
            roles: [request.ownerInfo?.role || StakeholderRole.owner],
            tenant_id: tenant.id,
            is_active: true,
            is_authorized: true,
            authorized_at: new Date(),
          },
        });
      } else {
        // Update existing user
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            tenant_id: tenant.id,
            full_name:
              request.ownerInfo?.fullName || user.full_name || user.email,
          },
        });
      }

      // 3. Create tenant membership
      await tx.tenantMember.create({
        data: {
          tenant_id: tenant.id,
          user_id: user.id,
          role: request.ownerInfo?.role || StakeholderRole.owner,
          is_active: true,
          is_owner: true,
          joined_at: new Date(),
        },
      });

      // 4. Update registration with tenant and user
      await tx.userRegistration.update({
        where: { id: request.registrationId },
        data: {
          tenant_id: tenant.id,
          user_id: user.id,
        },
      });

      // 5. Create default project
      const project = await tx.project.create({
        data: {
          tenant_id: tenant.id,
          name: `${tenant.name} - First Project`,
          description:
            'Your first project. Start by uploading a BIM model or creating construction elements.',
          owner_id: user.id,
          status: 'planning',
        },
      });

      // 6. Add owner to project
      await tx.projectRole.create({
        data: {
          project_id: project.id,
          user_id: user.id,
          role: 'owner',
        },
      });

      return { tenant, user, project };
    });

    logger.info('[TenantProvisioningService] Tenant provisioned', {
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
      userId: result.user.id,
      projectId: result.project.id,
      registrationId: request.registrationId,
    });

    // CRM: Sync company record (fire-and-forget — never blocks provisioning)
    if (this.companyService) {
      const domain = result.tenant.primary_email?.split('@')[1];
      this.companyService
        .upsertByDomain({
          name: result.tenant.name,
          domainName: domain,
        })
        .catch((error) => {
          logger.error(
            '[TenantProvisioningService] CRM company sync error (non-blocking)',
            {
              tenantId: result.tenant.id,
              error: error instanceof Error ? error.message : 'Unknown',
            }
          );
        });
    }

    // CRM: Sync owner contact (fire-and-forget)
    if (this.personService) {
      this.personService
        .upsertByEmail({
          email: result.user.email,
          firstName: result.user.full_name?.split(' ')[0] ?? result.user.email,
          lastName: result.user.full_name?.split(' ').slice(1).join(' ') ?? '',
        })
        .catch((error) => {
          logger.error(
            '[TenantProvisioningService] CRM owner contact sync error (non-blocking)',
            {
              tenantId: result.tenant.id,
              userId: result.user.id,
              error: error instanceof Error ? error.message : 'Unknown',
            }
          );
        });
    }

    return {
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
      userId: result.user.id,
      projectId: result.project.id,
      subscriptionEndsAt: trialEndsAt,
    };
  }

  /**
   * Validate tenant limits before adding resources
   */
  async validateTenantLimits(
    tenantId: string
  ): Promise<TenantLimitsValidation> {
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
      throw new UserManagementError(
        'Tenant not found',
        UserManagementErrorCode.TENANT_NOT_FOUND,
        { tenantId }
      );
    }

    const violations: string[] = [];

    if (tenant._count.projects >= tenant.max_projects) {
      violations.push(
        `Project limit exceeded: ${tenant._count.projects}/${tenant.max_projects}`
      );
    }

    if (tenant._count.users >= tenant.max_users) {
      violations.push(
        `User limit exceeded: ${tenant._count.users}/${tenant.max_users}`
      );
    }

    return {
      valid: violations.length === 0,
      limits: {
        maxProjects: tenant.max_projects,
        currentProjects: tenant._count.projects,
        maxUsers: tenant.max_users,
        currentUsers: tenant._count.users,
        maxStorageGb: tenant.max_storage_gb,
        currentStorageGb: 0, // TODO: Calculate from actual storage
      },
      violations,
    };
  }

  /**
   * Generate URL-safe slug from tenant name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100);
  }
}
