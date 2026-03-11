/**
 * ==============================================================================
 * USER REGISTRATION SERVICE (M2.2)
 * ==============================================================================
 * Lifecycle management: waitlist → email_sent → email_verified → trial → paid
 * Milestone: User Management M2.2 (Backend Services Layer)
 * Purpose: Self-service registration with automated lifecycle transitions
 * ==============================================================================
 */

import {
  PrismaClient,
  LifecycleStage,
  EmailTemplateType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { logger } from '@ectropy/shared/utils';
import { emailService } from '../email.service.js';
import { EmailTemplateService } from './email-template.service.js';
import { TwentyGraphQLClient, PersonService } from '@luh-tech/crm';
import {
  UserManagementError,
  UserManagementErrorCode,
  CreateRegistrationRequest,
  VerifyEmailRequest,
  StartTrialRequest,
  ConvertToPaidRequest,
  RegistrationResponse,
  LifecycleTransitionMetadata,
  DEFAULT_TRIAL_DURATION_DAYS,
  DEFAULT_VERIFICATION_TOKEN_LENGTH,
  LIFECYCLE_STAGE_TRANSITIONS,
} from './types.js';

/**
 * User Registration Service - Manage customer lifecycle
 *
 * Enterprise Patterns:
 * - Retry logic with exponential backoff for email sending
 * - Transaction safety for multi-step operations
 * - Comprehensive error logging
 * - CRM integration: fire-and-forget at every lifecycle transition
 * - Lifecycle analytics tracking
 */
export class UserRegistrationService {
  private emailTemplateService: EmailTemplateService;
  private crmEnabled: boolean;
  private personService: PersonService | null;

  constructor(
    private prisma: PrismaClient,
    private config: {
      frontendUrl: string;
      verificationLinkPattern: string;
      trialDurationDays?: number;
      // CRM config — optional, defaults to env vars
      crmEnabled?: boolean;
      crmApiUrl?: string;
      crmApiKey?: string;
    }
  ) {
    this.emailTemplateService = new EmailTemplateService(prisma);
    this.crmEnabled = config.crmEnabled ?? process.env.CRM_ENABLED === 'true';
    if (this.crmEnabled && (config.crmApiKey || process.env.CRM_API_KEY)) {
      const client = new TwentyGraphQLClient({
        apiUrl:
          config.crmApiUrl ??
          process.env.CRM_API_URL ??
          'https://crm.luh.tech/graphql',
        apiKey: config.crmApiKey ?? process.env.CRM_API_KEY ?? '',
      });
      this.personService = new PersonService(client);
    } else {
      this.personService = null;
    }
    logger.info('[UserRegistrationService] Initialized', {
      frontendUrl: config.frontendUrl,
      trialDurationDays:
        config.trialDurationDays || DEFAULT_TRIAL_DURATION_DAYS,
    });
  }

  /**
   * Create new registration (Capture lead from landing page)
   *
   * Lifecycle: WAITLIST
   * CRM: Sync as lead immediately (fire-and-forget)
   * Next step: sendVerificationEmail()
   *
   * @param request - Registration data from landing page
   * @returns Created registration
   */
  async createRegistration(
    request: CreateRegistrationRequest
  ): Promise<RegistrationResponse> {
    // Check if email already registered
    const existing = await this.prisma.userRegistration.findUnique({
      where: { email: request.email.toLowerCase() },
    });

    if (existing) {
      throw new UserManagementError(
        `Email ${request.email} is already registered`,
        UserManagementErrorCode.EMAIL_ALREADY_REGISTERED,
        { email: request.email, existingStage: existing.lifecycle_stage }
      );
    }

    // Create registration record
    const registration = await this.prisma.userRegistration.create({
      data: {
        email: request.email.toLowerCase(),
        full_name: request.fullName,
        lifecycle_stage: LifecycleStage.WAITLIST,
        registration_source: request.registrationSource || 'landing_page',
        utm_source: request.utmSource,
        utm_medium: request.utmMedium,
        utm_campaign: request.utmCampaign,
        referrer: request.referrer,
        ip_address: request.ipAddress,
        user_agent: request.userAgent,
        metadata: request.metadata as any,
      },
    });

    logger.info('[UserRegistrationService] Registration created', {
      registrationId: registration.id,
      email: request.email,
      source: request.registrationSource,
      utm: {
        source: request.utmSource,
        medium: request.utmMedium,
        campaign: request.utmCampaign,
      },
    });

    // Track lifecycle transition
    await this.trackLifecycleTransition({
      from: LifecycleStage.WAITLIST, // Initial state
      to: LifecycleStage.WAITLIST,
      registrationId: registration.id,
      triggeredBy: 'system',
      metadata: {
        source: request.registrationSource,
        utmSource: request.utmSource,
      },
    });

    // CRM: Upsert person (fire-and-forget — never blocks registration)
    if (this.personService) {
      const nameParts = (registration.full_name ?? '').trim().split(/\s+/);
      this.personService
        .upsertByEmail({
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || '',
          email: registration.email,
        })
        .catch((error) => {
          logger.error('[UserRegistrationService] CRM lead sync error', {
            registrationId: registration.id,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        });
    }

    return this.mapToResponse(registration);
  }

  /**
   * Send verification email
   *
   * Lifecycle: WAITLIST → EMAIL_SENT
   * Next step: verifyEmail()
   *
   * @param registrationId - Registration ID
   * @returns Updated registration
   */
  async sendVerificationEmail(
    registrationId: string
  ): Promise<RegistrationResponse> {
    const registration = await this.prisma.userRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      throw new UserManagementError(
        'Registration not found',
        UserManagementErrorCode.USER_NOT_FOUND,
        { registrationId }
      );
    }

    // Check if already verified
    if (registration.verified_at) {
      throw new UserManagementError(
        'Email already verified',
        UserManagementErrorCode.EMAIL_ALREADY_VERIFIED,
        { registrationId, verifiedAt: registration.verified_at }
      );
    }

    // Generate verification token (cryptographically secure)
    const verificationToken = randomBytes(
      DEFAULT_VERIFICATION_TOKEN_LENGTH
    ).toString('hex');

    // Update registration with token
    const updated = await this.prisma.userRegistration.update({
      where: { id: registrationId },
      data: {
        verification_token: verificationToken,
        verification_sent_at: new Date(),
        lifecycle_stage: LifecycleStage.EMAIL_SENT,
      },
    });

    // Build verification link
    const verificationLink = `${this.config.frontendUrl}${this.config.verificationLinkPattern.replace(
      '{token}',
      verificationToken
    )}`;

    // Render email template
    const rendered = await this.emailTemplateService.renderTemplate({
      templateType: EmailTemplateType.VERIFICATION_EMAIL,
      variables: {
        user_name: registration.full_name || registration.email.split('@')[0],
        verification_link: verificationLink,
      },
    });

    // Send email with retry logic (inherited from emailService)
    const emailResult = await emailService.sendEmail({
      to: registration.email,
      subject: rendered.subject,
      html: rendered.bodyHtml,
      text: rendered.bodyText,
      tags: {
        type: 'verification',
        registrationId: registration.id,
      },
    });

    if (!emailResult.success) {
      logger.error('[UserRegistrationService] Verification email send failed', {
        registrationId,
        email: registration.email,
        error: emailResult.error,
      });

      throw new UserManagementError(
        'Failed to send verification email',
        UserManagementErrorCode.EMAIL_SEND_FAILED,
        { registrationId, error: emailResult.error }
      );
    }

    logger.info('[UserRegistrationService] Verification email sent', {
      registrationId,
      email: registration.email,
      messageId: emailResult.messageId,
    });

    // Track lifecycle transition
    await this.trackLifecycleTransition({
      from: LifecycleStage.WAITLIST,
      to: LifecycleStage.EMAIL_SENT,
      registrationId,
      triggeredBy: 'system',
      metadata: { emailSentAt: updated.verification_sent_at },
    });

    return this.mapToResponse(updated);
  }

  /**
   * Verify email with token
   *
   * Lifecycle: EMAIL_SENT → EMAIL_VERIFIED
   * CRM: Update person lifecycle stage (fire-and-forget)
   * Next step: startTrial()
   *
   * @param request - Verification token from email link
   * @returns Updated registration
   */
  async verifyEmail(
    request: VerifyEmailRequest
  ): Promise<RegistrationResponse> {
    const registration = await this.prisma.userRegistration.findUnique({
      where: { verification_token: request.token },
    });

    if (!registration) {
      throw new UserManagementError(
        'Invalid verification token',
        UserManagementErrorCode.INVALID_VERIFICATION_TOKEN,
        { token: `${request.token.substring(0, 8)}...` }
      );
    }

    // Check if already verified
    if (registration.verified_at) {
      logger.warn('[UserRegistrationService] Email already verified', {
        registrationId: registration.id,
        verifiedAt: registration.verified_at,
      });

      return this.mapToResponse(registration);
    }

    // Check token expiration (24 hours)
    const tokenAge =
      Date.now() - (registration.verification_sent_at?.getTime() || 0);
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (tokenAge > maxAge) {
      throw new UserManagementError(
        'Verification token expired',
        UserManagementErrorCode.VERIFICATION_TOKEN_EXPIRED,
        {
          registrationId: registration.id,
          sentAt: registration.verification_sent_at,
          ageHours: Math.round(tokenAge / (60 * 60 * 1000)),
        }
      );
    }

    // Mark as verified
    const updated = await this.prisma.userRegistration.update({
      where: { id: registration.id },
      data: {
        verified_at: new Date(),
        lifecycle_stage: LifecycleStage.EMAIL_VERIFIED,
      },
    });

    logger.info('[UserRegistrationService] Email verified', {
      registrationId: registration.id,
      email: registration.email,
      verifiedAt: updated.verified_at,
    });

    // Track lifecycle transition
    await this.trackLifecycleTransition({
      from: LifecycleStage.EMAIL_SENT,
      to: LifecycleStage.EMAIL_VERIFIED,
      registrationId: registration.id,
      triggeredBy: 'system',
      metadata: { verifiedAt: updated.verified_at },
    });

    // CRM: Update person lifecycle — email verified (fire-and-forget)
    if (this.personService) {
      const nameParts = (registration.full_name ?? '').trim().split(/\s+/);
      this.personService
        .upsertByEmail({
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || '',
          email: registration.email,
        })
        .then((person) =>
          this.personService!.updateLifecycleStage(person.id, 'email_verified')
        )
        .catch((error) => {
          logger.error(
            '[UserRegistrationService] CRM email-verified sync error',
            {
              registrationId: registration.id,
              error: error instanceof Error ? error.message : 'Unknown',
            }
          );
        });
    }

    return this.mapToResponse(updated);
  }

  /**
   * Start trial (Provision tenant + user)
   *
   * Lifecycle: EMAIL_VERIFIED → TRIAL
   * CRM: Sync as contact with tenantId (fire-and-forget)
   * Next step: convertToPaid() or trial expiration
   *
   * NOTE: This delegates to TenantProvisioningService for tenant creation
   *
   * @param request - Trial configuration
   * @returns Updated registration with tenant + user
   */
  async startTrial(request: StartTrialRequest): Promise<RegistrationResponse> {
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

    // Verify email is verified
    if (!registration.verified_at) {
      throw new UserManagementError(
        'Email must be verified before starting trial',
        UserManagementErrorCode.VALIDATION_ERROR,
        { registrationId: request.registrationId }
      );
    }

    // Check if trial already started
    if (registration.trial_started_at) {
      throw new UserManagementError(
        'Trial already started',
        UserManagementErrorCode.TRIAL_ALREADY_STARTED,
        {
          registrationId: request.registrationId,
          trialStartedAt: registration.trial_started_at,
        }
      );
    }

    // Calculate trial end date
    const trialDurationDays =
      this.config.trialDurationDays || DEFAULT_TRIAL_DURATION_DAYS;
    const trialEndsAt = new Date(
      Date.now() + trialDurationDays * 24 * 60 * 60 * 1000
    );

    // NOTE: Tenant provisioning happens via TenantProvisioningService
    // This service only tracks the lifecycle stage
    // The tenantId and userId will be set by TenantProvisioningService

    const updated = await this.prisma.userRegistration.update({
      where: { id: request.registrationId },
      data: {
        lifecycle_stage: LifecycleStage.TRIAL,
        trial_started_at: new Date(),
        trial_ends_at: trialEndsAt,
      },
    });

    logger.info('[UserRegistrationService] Trial started', {
      registrationId: request.registrationId,
      email: registration.email,
      trialEndsAt,
      durationDays: trialDurationDays,
    });

    // Track lifecycle transition
    await this.trackLifecycleTransition({
      from: LifecycleStage.EMAIL_VERIFIED,
      to: LifecycleStage.TRIAL,
      registrationId: request.registrationId,
      triggeredBy: 'system',
      metadata: {
        trialStartedAt: updated.trial_started_at,
        trialEndsAt: updated.trial_ends_at,
      },
    });

    // CRM: Update person lifecycle to trial (fire-and-forget)
    if (this.personService) {
      const nameParts = (registration.full_name ?? '').trim().split(/\s+/);
      this.personService
        .upsertByEmail({
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || '',
          email: registration.email,
        })
        .then((person) =>
          this.personService!.updateLifecycleStage(person.id, 'trial')
        )
        .catch((error) => {
          logger.error(
            '[UserRegistrationService] CRM trial-started sync error',
            {
              registrationId: request.registrationId,
              error: error instanceof Error ? error.message : 'Unknown',
            }
          );
        });
    }

    return this.mapToResponse(updated);
  }

  /**
   * Convert trial to paid subscription
   *
   * Lifecycle: TRIAL → PAID
   * CRM: Update contact lifecycle to PAID (fire-and-forget)
   * Final conversion step
   *
   * @param request - Paid subscription configuration
   * @returns Updated registration
   */
  async convertToPaid(
    request: ConvertToPaidRequest
  ): Promise<RegistrationResponse> {
    const registration = await this.prisma.userRegistration.findUnique({
      where: { id: request.registrationId },
      include: { tenant: true },
    });

    if (!registration) {
      throw new UserManagementError(
        'Registration not found',
        UserManagementErrorCode.USER_NOT_FOUND,
        { registrationId: request.registrationId }
      );
    }

    // Verify trial is active
    if (registration.lifecycle_stage !== LifecycleStage.TRIAL) {
      throw new UserManagementError(
        `Cannot convert from ${registration.lifecycle_stage} to PAID`,
        UserManagementErrorCode.VALIDATION_ERROR,
        {
          registrationId: request.registrationId,
          currentStage: registration.lifecycle_stage,
        }
      );
    }

    // Update registration
    const updated = await this.prisma.userRegistration.update({
      where: { id: request.registrationId },
      data: {
        lifecycle_stage: LifecycleStage.PAID,
        converted_at: new Date(),
        subscription_tier: request.subscriptionTier,
      },
    });

    logger.info('[UserRegistrationService] Trial converted to paid', {
      registrationId: request.registrationId,
      email: registration.email,
      tier: request.subscriptionTier,
      convertedAt: updated.converted_at,
      trialDuration: registration.trial_started_at
        ? Math.round(
            (updated.converted_at!.getTime() -
              registration.trial_started_at.getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : null,
    });

    // Track lifecycle transition with revenue data
    await this.trackLifecycleTransition({
      from: LifecycleStage.TRIAL,
      to: LifecycleStage.PAID,
      registrationId: request.registrationId,
      tenantId: registration.tenant_id || undefined,
      triggeredBy: registration.user_id || 'system',
      metadata: {
        subscriptionTier: request.subscriptionTier,
        convertedAt: updated.converted_at,
        stripeCustomerId: request.stripeCustomerId,
      },
    });

    // CRM: Update person lifecycle to PAID (fire-and-forget)
    if (this.personService) {
      const nameParts = (registration.full_name ?? '').trim().split(/\s+/);
      this.personService
        .upsertByEmail({
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || '',
          email: registration.email,
        })
        .then((person) =>
          this.personService!.updateLifecycleStage(person.id, 'paid')
        )
        .catch((error) => {
          logger.error(
            '[UserRegistrationService] CRM paid-conversion sync error',
            {
              registrationId: request.registrationId,
              error: error instanceof Error ? error.message : 'Unknown',
            }
          );
        });
    }

    return this.mapToResponse(updated);
  }

  /**
   * Get registration by email
   *
   * @param email - User email
   * @returns Registration or null
   */
  async getRegistrationByEmail(
    email: string
  ): Promise<RegistrationResponse | null> {
    const registration = await this.prisma.userRegistration.findUnique({
      where: { email: email.toLowerCase() },
    });

    return registration ? this.mapToResponse(registration) : null;
  }

  /**
   * Get registration by ID
   *
   * @param registrationId - Registration ID
   * @returns Registration or null
   */
  async getRegistrationById(
    registrationId: string
  ): Promise<RegistrationResponse | null> {
    const registration = await this.prisma.userRegistration.findUnique({
      where: { id: registrationId },
    });

    return registration ? this.mapToResponse(registration) : null;
  }

  /**
   * Track lifecycle transition for analytics
   *
   * Stores in subscription_history for conversion funnel analysis
   *
   * @param transition - Lifecycle transition metadata
   */
  private async trackLifecycleTransition(
    transition: LifecycleTransitionMetadata
  ): Promise<void> {
    // Only track if we have a tenant (after trial starts)
    if (!transition.tenantId) {
      logger.debug(
        '[UserRegistrationService] Skipping subscription_history (no tenant yet)',
        {
          registrationId: transition.registrationId,
          from: transition.from,
          to: transition.to,
        }
      );
      return;
    }

    try {
      await this.prisma.subscriptionHistory.create({
        data: {
          tenant_id: transition.tenantId,
          from_stage: transition.from,
          to_stage: transition.to,
          trigger: transition.triggeredBy,
          notes: JSON.stringify(transition.metadata),
          transitioned_at: new Date(),
        },
      });

      logger.debug('[UserRegistrationService] Lifecycle transition tracked', {
        registrationId: transition.registrationId,
        from: transition.from,
        to: transition.to,
        tenantId: transition.tenantId,
      });
    } catch (error) {
      // Non-blocking error - log but don't fail the operation
      logger.error(
        '[UserRegistrationService] Failed to track lifecycle transition',
        {
          registrationId: transition.registrationId,
          from: transition.from,
          to: transition.to,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }
  }

  /**
   * Map Prisma model to response
   */
  private mapToResponse(registration: any): RegistrationResponse {
    return {
      id: registration.id,
      email: registration.email,
      lifecycleStage: registration.lifecycle_stage,
      verificationSentAt: registration.verification_sent_at,
      verifiedAt: registration.verified_at,
      trialStartedAt: registration.trial_started_at,
      trialEndsAt: registration.trial_ends_at,
      convertedAt: registration.converted_at,
      tenantId: registration.tenant_id,
      userId: registration.user_id,
      createdAt: registration.created_at,
    };
  }
}
