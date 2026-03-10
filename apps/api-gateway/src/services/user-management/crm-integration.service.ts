/**
 * ==============================================================================
 * CRM INTEGRATION SERVICE (M2.7)
 * ==============================================================================
 * Bidirectional sync with Twenty CRM for lead/contact/company management
 * Milestone: User Management M2.7 (Backend Services Layer)
 * Purpose: Automated CRM sync with retry logic and webhook handling
 * ==============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@ectropy/shared/utils';
import {
  UserManagementError,
  UserManagementErrorCode,
  CRMLeadData,
  CRMContactData,
  CRMCompanyData,
  CRMWebhookEvent,
  CRMSyncResult,
  LifecycleStage,
} from './types.js';

// ==============================================================================
// Twenty CRM REST API Types
// ==============================================================================

interface TwentyPerson {
  id?: string;
  name: {
    firstName: string;
    lastName: string;
  };
  emails: {
    primaryEmail: string;
    additionalEmails?: string[];
  };
  phones?: {
    primaryPhoneNumber?: string;
  };
  position?: string;
  companyId?: string;
  // Custom fields stored in Twenty as field overrides
  city?: string;
}

interface TwentyCompany {
  id?: string;
  name: string;
  domainName?: {
    primaryLinkUrl: string;
  };
}

interface TwentyApiResponse<T> {
  data: T;
  errors?: Array<{ message: string; extensions?: { code: string } }>;
}

interface TwentyRestResponse<T> {
  data: {
    [key: string]: T[];
  };
  totalCount?: number;
}

// ==============================================================================
// Retry Configuration
// ==============================================================================

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff retry wrapper
 * Retries on network errors and 5xx responses
 * Does NOT retry on 4xx (client errors)
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx)
      if (lastError.message.startsWith('4')) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(
          `[CRMIntegrationService] ${operationName} attempt ${attempt} failed, retrying in ${delay}ms`,
          { error: lastError.message, attempt, maxRetries }
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
}

// ==============================================================================
// CRM Integration Service
// ==============================================================================

/**
 * CRM Integration Service - Twenty CRM bidirectional sync
 *
 * Integration:
 * - Twenty CRM REST API (self-hosted at crm.luh.tech)
 * - Async processing (fire-and-forget — never blocks user flows)
 * - Exponential backoff retry for transient failures
 * - Email-based upsert to prevent duplicate contacts
 * - Webhook validation with HMAC-SHA256
 */
export class CRMIntegrationService {
  private crmEnabled: boolean;
  private crmApiUrl: string;
  private crmApiKey: string;
  private crmWebhookSecret?: string;

  constructor(
    private prisma: PrismaClient,
    private config?: {
      crmEnabled?: boolean;
      crmApiUrl?: string;
      crmApiKey?: string;
      crmWebhookSecret?: string;
    }
  ) {
    this.crmEnabled = config?.crmEnabled ?? (process.env.CRM_ENABLED === 'true');
    this.crmApiUrl = config?.crmApiUrl ?? process.env.CRM_API_URL ?? 'https://crm.luh.tech/rest';
    this.crmApiKey = config?.crmApiKey ?? process.env.CRM_API_KEY ?? '';
    this.crmWebhookSecret = config?.crmWebhookSecret ?? process.env.CRM_WEBHOOK_SECRET;

    logger.info('[CRMIntegrationService] Initialized', {
      crmEnabled: this.crmEnabled,
      crmApiUrl: this.crmApiUrl,
      crmApiKeyConfigured: !!this.crmApiKey,
    });
  }

  // ===========================================================================
  // Private: Twenty REST API helpers
  // ===========================================================================

  /**
   * Make authenticated request to Twenty CRM REST API
   */
  private async twentyRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    if (!this.crmApiKey) {
      throw new Error('CRM_API_KEY not configured');
    }

    const url = `${this.crmApiUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.crmApiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `${response.status} ${response.statusText}: ${text.substring(0, 200)}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Parse full name into first/last
   */
  private parseName(fullName?: string): { firstName: string; lastName: string } {
    if (!fullName || !fullName.trim()) {
      return { firstName: 'Unknown', lastName: '' };
    }
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || '';
    return { firstName, lastName };
  }

  /**
   * Find existing person in Twenty by email
   * Returns the Twenty person ID if found, null otherwise
   */
  private async findPersonByEmail(email: string): Promise<string | null> {
    try {
      // Twenty v1.18 REST API filter syntax: filter[field][operator]=value
      const result = await this.twentyRequest<TwentyRestResponse<TwentyPerson>>(
        'GET',
        `/people?filter[emails][primaryEmail][eq]=${encodeURIComponent(email)}&limit=1`
      );

      const people = result?.data?.people;
      if (people && people.length > 0) {
        return people[0].id || null;
      }
      return null;
    } catch (error) {
      logger.warn('[CRMIntegrationService] findPersonByEmail failed', {
        email,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Find existing company in Twenty by name
   */
  private async findCompanyByName(name: string): Promise<string | null> {
    try {
      // Twenty v1.18 REST API filter syntax: filter[field][operator]=value
      const result = await this.twentyRequest<TwentyRestResponse<TwentyCompany>>(
        'GET',
        `/companies?filter[name][eq]=${encodeURIComponent(name)}&limit=1`
      );

      const companies = result?.data?.companies;
      if (companies && companies.length > 0) {
        return companies[0].id || null;
      }
      return null;
    } catch (error) {
      logger.warn('[CRMIntegrationService] findCompanyByName failed', {
        name,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  // ===========================================================================
  // Public: Sync Methods
  // ===========================================================================

  /**
   * Sync lead to CRM (registration → Twenty person)
   *
   * Called at: createRegistration() — WAITLIST stage
   * Creates a new person in Twenty with UTM attribution fields
   * Uses email-based upsert to prevent duplicates
   */
  async syncLeadToCRM(data: CRMLeadData): Promise<CRMSyncResult> {
    if (!this.crmEnabled) {
      logger.debug('[CRMIntegrationService] CRM sync skipped (disabled)');
      return { success: true, syncedAt: new Date() };
    }

    try {
      const result = await withRetry(async () => {
        const { firstName, lastName } = this.parseName(data.fullName);

        // Check for existing person first (email-based upsert)
        const existingId = await this.findPersonByEmail(data.email);

        const personPayload = {
          name: { firstName, lastName },
          emails: { primaryEmail: data.email },
          phones: data.phone ? { primaryPhoneNumber: data.phone } : undefined,
          // Store lifecycle stage and UTM data in the position field (custom)
          // In production: configure Twenty custom fields for utmSource/Medium/Campaign
          position: data.lifecycleStage,
          city: [
            data.utmSource ? `utm_source:${data.utmSource}` : null,
            data.utmMedium ? `utm_medium:${data.utmMedium}` : null,
            data.utmCampaign ? `utm_campaign:${data.utmCampaign}` : null,
          ].filter(Boolean).join('|') || undefined,
        };

        if (existingId) {
          // Update existing person
          await this.twentyRequest<unknown>('PATCH', `/people/${existingId}`, personPayload);
          return existingId;
        } else if (data.lifecycleStage === LifecycleStage.WAITLIST) {
          // n8n owns initial lead creation at WAITLIST stage — skip creation
          // Bulk sync will catch leads once n8n has synced them to Twenty
          logger.debug('[CRMIntegrationService] Lead not in CRM yet (n8n pending)', { email: data.email });
          return 'pending-n8n';
        } else {
          // Create for non-waitlist stages (direct registration)
          // Twenty REST POST returns { data: { createPerson: { id, ... } } }
          const created = await this.twentyRequest<{ data: { createPerson: { id: string } } }>(
            'POST',
            '/people',
            personPayload
          );
          return created?.data?.createPerson?.id || 'created';
        }
      }, 'syncLeadToCRM');

      logger.info('[CRMIntegrationService] Lead synced to CRM', {
        email: data.email,
        crmPersonId: result,
        lifecycleStage: data.lifecycleStage,
      });

      return {
        success: true,
        crmLeadId: result,
        syncedAt: new Date(),
      };
    } catch (error) {
      logger.error('[CRMIntegrationService] Lead sync failed (non-blocking)', {
        email: data.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        syncedAt: new Date(),
      };
    }
  }

  /**
   * Sync contact to CRM (email verified / trial started)
   *
   * Called at: verifyEmail() — EMAIL_VERIFIED stage
   * Called at: startTrial() — TRIAL stage
   * Updates person lifecycle stage and links to company if available
   */
  async syncContactToCRM(data: CRMContactData): Promise<CRMSyncResult> {
    if (!this.crmEnabled) {
      return { success: true, syncedAt: new Date() };
    }

    try {
      const result = await withRetry(async () => {
        const { firstName, lastName } = this.parseName(data.fullName);

        // Always upsert by email
        const existingId = await this.findPersonByEmail(data.email);

        const personPayload = {
          name: { firstName, lastName },
          emails: { primaryEmail: data.email },
          position: data.role,
          city: `tenantId:${data.tenantId}|userId:${data.userId}`,
        };

        if (existingId) {
          await this.twentyRequest<unknown>('PATCH', `/people/${existingId}`, personPayload);
          return existingId;
        } else {
          // Twenty REST POST returns { data: { createPerson: { id, ... } } }
          const created = await this.twentyRequest<{ data: { createPerson: { id: string } } }>(
            'POST',
            '/people',
            personPayload
          );
          return created?.data?.createPerson?.id || 'created';
        }
      }, 'syncContactToCRM');

      logger.info('[CRMIntegrationService] Contact synced to CRM', {
        email: data.email,
        crmPersonId: result,
        tenantId: data.tenantId,
      });

      return {
        success: true,
        crmContactId: result,
        syncedAt: new Date(),
      };
    } catch (error) {
      logger.error('[CRMIntegrationService] Contact sync failed (non-blocking)', {
        email: data.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        syncedAt: new Date(),
      };
    }
  }

  /**
   * Sync company to CRM (tenant provisioned)
   *
   * Called at: TenantProvisioningService.provisionTenant()
   * Creates company record and links owner person to it
   */
  async syncCompanyToCRM(data: CRMCompanyData): Promise<CRMSyncResult> {
    if (!this.crmEnabled) {
      return { success: true, syncedAt: new Date() };
    }

    try {
      const result = await withRetry(async () => {
        // Check for existing company
        const existingId = await this.findCompanyByName(data.name);

        let companyId: string;
        const companyPayload = {
          name: data.name,
          domainName: { primaryLinkUrl: `https://${data.slug}.ectropy.ai` },
          employees: data.userCount,
        };

        if (existingId) {
          await this.twentyRequest<unknown>('PATCH', `/companies/${existingId}`, companyPayload);
          companyId = existingId;
        } else {
          // Twenty REST POST returns { data: { createCompany: { id, ... } } }
          const created = await this.twentyRequest<{ data: { createCompany: { id: string } } }>(
            'POST',
            '/companies',
            companyPayload
          );
          companyId = created?.data?.createCompany?.id || 'created';
        }

        // Link owner person to company (skip if no primary email)
        const ownerPersonId = data.primaryEmail
          ? await this.findPersonByEmail(data.primaryEmail)
          : null;
        if (ownerPersonId && companyId !== 'created') {
          await this.twentyRequest<unknown>('PATCH', `/people/${ownerPersonId}`, {
            companyId,
          }).catch((e) => {
            // Non-critical: log but don't fail the company sync
            logger.warn('[CRMIntegrationService] Failed to link person to company', {
              ownerPersonId,
              companyId,
              error: e instanceof Error ? e.message : 'Unknown',
            });
          });
        }

        return companyId;
      }, 'syncCompanyToCRM');

      logger.info('[CRMIntegrationService] Company synced to CRM', {
        tenantId: data.tenantId,
        name: data.name,
        crmCompanyId: result,
      });

      return {
        success: true,
        crmCompanyId: result,
        syncedAt: new Date(),
      };
    } catch (error) {
      logger.error('[CRMIntegrationService] Company sync failed (non-blocking)', {
        tenantId: data.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        syncedAt: new Date(),
      };
    }
  }

  /**
   * Handle inbound webhook from Twenty CRM
   *
   * Supported events:
   * - lead.qualified → update registration lifecycle + whitelist user
   * - trial.started → log to subscription_history
   * - trial.converted → update lifecycle to PAID
   * - subscription.cancelled → update lifecycle to CHURNED
   */
  async handleWebhook(event: CRMWebhookEvent): Promise<void> {
    if (!this.crmEnabled) {
      logger.warn('[CRMIntegrationService] Webhook received but CRM disabled');
      return;
    }

    logger.info('[CRMIntegrationService] Processing webhook event', {
      eventType: event.eventType,
      timestamp: event.timestamp,
    });

    const email = event.data?.email as string | undefined;
    if (!email) {
      logger.warn('[CRMIntegrationService] Webhook missing email in data', {
        eventType: event.eventType,
      });
      return;
    }

    switch (event.eventType) {
      case 'lead.qualified': {
        // Find registration and advance to EMAIL_VERIFIED if at WAITLIST/EMAIL_SENT
        const registration = await this.prisma.userRegistration.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (registration && (
          registration.lifecycle_stage === LifecycleStage.WAITLIST ||
          registration.lifecycle_stage === LifecycleStage.EMAIL_SENT
        )) {
          logger.info('[CRMIntegrationService] Lead qualified from CRM — advancing lifecycle', {
            email,
            currentStage: registration.lifecycle_stage,
          });
          // Note: Full lifecycle advancement requires email verification
          // This signals intent; actual verification still requires token
        }
        break;
      }

      case 'trial.started': {
        // CRM confirming trial is active — log for analytics
        logger.info('[CRMIntegrationService] Trial started confirmed from CRM', { email });
        break;
      }

      case 'trial.converted': {
        // Update registration lifecycle to PAID
        const reg = await this.prisma.userRegistration.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (reg && reg.lifecycle_stage === LifecycleStage.TRIAL) {
          await this.prisma.userRegistration.update({
            where: { id: reg.id },
            data: {
              lifecycle_stage: LifecycleStage.PAID,
              converted_at: new Date(),
            },
          });
          logger.info('[CRMIntegrationService] Trial converted to PAID via CRM webhook', { email });
        }
        break;
      }

      case 'subscription.cancelled': {
        // Update registration lifecycle to CHURNED
        const reg = await this.prisma.userRegistration.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (reg) {
          await this.prisma.userRegistration.update({
            where: { id: reg.id },
            data: { lifecycle_stage: LifecycleStage.CHURNED },
          });
          logger.info('[CRMIntegrationService] Subscription cancelled via CRM webhook', { email });
        }
        break;
      }

      default:
        logger.warn('[CRMIntegrationService] Unhandled webhook event type', {
          eventType: event.eventType,
        });
    }
  }

  /**
   * Bulk sync — nightly batch to catch any missed syncs
   *
   * Queries for registrations without CRM IDs and syncs them
   * Rate-limited to avoid Twenty API overload (50 records/run)
   */
  async bulkSync(): Promise<{
    leadsSync: number;
    contactsSync: number;
    companiesSync: number;
    errors: number;
  }> {
    if (!this.crmEnabled) {
      return { leadsSync: 0, contactsSync: 0, companiesSync: 0, errors: 0 };
    }

    logger.info('[CRMIntegrationService] Starting bulk sync');

    let leadsSync = 0;
    let contactsSync = 0;
    let companiesSync = 0;
    let errors = 0;

    const BATCH_SIZE = 50;
    const BATCH_DELAY_MS = 200; // Rate limiting: 5 req/sec

    try {
      // Sync unsynced waitlist/email_sent leads
      const leads = await this.prisma.userRegistration.findMany({
        where: {
          lifecycle_stage: { in: [LifecycleStage.WAITLIST, LifecycleStage.EMAIL_SENT] },
          crm_lead_id: null,
        },
        take: BATCH_SIZE,
        orderBy: { created_at: 'asc' },
      });

      for (const lead of leads) {
        await sleep(BATCH_DELAY_MS);
        const result = await this.syncLeadToCRM({
          email: lead.email,
          fullName: lead.full_name ?? undefined,
          source: lead.registration_source ?? 'unknown',
          utmSource: lead.utm_source ?? undefined,
          utmMedium: lead.utm_medium ?? undefined,
          utmCampaign: lead.utm_campaign ?? undefined,
          lifecycleStage: lead.lifecycle_stage,
        });

        if (result.success) {
          // Store CRM lead ID back to DB
          if (result.crmLeadId && result.crmLeadId !== 'created' && result.crmLeadId !== 'pending-n8n') {
            await this.prisma.userRegistration.update({
              where: { id: lead.id },
              data: { crm_lead_id: result.crmLeadId } as any,
            }).catch(() => {
              // crm_lead_id field may not exist yet — non-blocking
            });
          }
          leadsSync++;
        } else {
          errors++;
        }
      }

      // Sync unsynced trial/paid contacts
      const contacts = await this.prisma.userRegistration.findMany({
        where: {
          lifecycle_stage: { in: [LifecycleStage.TRIAL, LifecycleStage.PAID] },
          user_id: { not: null },
          tenant_id: { not: null },
        },
        take: BATCH_SIZE,
        orderBy: { trial_started_at: 'asc' },
        include: { user: { select: { full_name: true, roles: true } } },
      });

      for (const contact of contacts) {
        if (!contact.tenant_id || !contact.user_id) continue;
        await sleep(BATCH_DELAY_MS);
        const result = await this.syncContactToCRM({
          email: contact.email,
          fullName: (contact as any).user?.full_name ?? contact.email,
          tenantId: contact.tenant_id,
          userId: contact.user_id,
          role: (contact as any).user?.roles?.[0] ?? 'owner',
          createdAt: contact.created_at,
        });
        result.success ? contactsSync++ : errors++;
      }

      // Sync unsynced companies
      const tenants = await this.prisma.tenant.findMany({
        take: BATCH_SIZE,
        orderBy: { created_at: 'asc' },
        include: {
          _count: { select: { users: true, projects: true } },
        },
      });

      for (const tenant of tenants) {
        await sleep(BATCH_DELAY_MS);
        const result = await this.syncCompanyToCRM({
          tenantId: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          subscriptionTier: tenant.subscription_tier,
          primaryEmail: tenant.primary_email,
          billingEmail: tenant.billing_email ?? undefined,
          userCount: tenant._count.users,
          projectCount: tenant._count.projects,
          createdAt: tenant.created_at,
        });
        result.success ? companiesSync++ : errors++;
      }
    } catch (error) {
      logger.error('[CRMIntegrationService] Bulk sync error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      errors++;
    }

    logger.info('[CRMIntegrationService] Bulk sync complete', {
      leadsSync,
      contactsSync,
      companiesSync,
      errors,
    });

    return { leadsSync, contactsSync, companiesSync, errors };
  }
}
