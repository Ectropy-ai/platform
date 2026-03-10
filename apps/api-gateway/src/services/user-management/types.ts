/**
 * ==============================================================================
 * USER MANAGEMENT SERVICE TYPES
 * ==============================================================================
 * Type definitions for M2 User Management services
 * Milestone: User Management M2 (Backend Services Layer)
 * Target: March 2026 Canadian pilot customer onboarding
 * ==============================================================================
 */

import {
  LifecycleStage,
  InvitationStatus,
  EmailTemplateType,
  EmailTemplateStatus,
  SubscriptionTier,
  StakeholderRole,
} from '@prisma/client';

// Re-export Prisma enums for convenience
export {
  LifecycleStage,
  InvitationStatus,
  EmailTemplateType,
  EmailTemplateStatus,
  SubscriptionTier,
  StakeholderRole,
};

// ==============================================================================
// Error Handling
// ==============================================================================

export enum UserManagementErrorCode {
  // Registration errors
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  INVALID_VERIFICATION_TOKEN = 'INVALID_VERIFICATION_TOKEN',
  VERIFICATION_TOKEN_EXPIRED = 'VERIFICATION_TOKEN_EXPIRED',
  EMAIL_ALREADY_VERIFIED = 'EMAIL_ALREADY_VERIFIED',
  TRIAL_ALREADY_STARTED = 'TRIAL_ALREADY_STARTED',

  // Invitation errors
  INVITATION_NOT_FOUND = 'INVITATION_NOT_FOUND',
  INVITATION_EXPIRED = 'INVITATION_EXPIRED',
  INVITATION_ALREADY_ACCEPTED = 'INVITATION_ALREADY_ACCEPTED',
  INVITATION_REVOKED = 'INVITATION_REVOKED',
  DUPLICATE_PENDING_INVITATION = 'DUPLICATE_PENDING_INVITATION',

  // Tenant errors
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_LIMIT_EXCEEDED = 'TENANT_LIMIT_EXCEEDED',
  TENANT_PROVISIONING_FAILED = 'TENANT_PROVISIONING_FAILED',

  // Authorization errors
  USER_NOT_AUTHORIZED = 'USER_NOT_AUTHORIZED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',

  // Email template errors
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TEMPLATE_RENDERING_FAILED = 'TEMPLATE_RENDERING_FAILED',
  MISSING_REQUIRED_VARIABLES = 'MISSING_REQUIRED_VARIABLES',

  // CRM errors
  CRM_SYNC_FAILED = 'CRM_SYNC_FAILED',
  CRM_WEBHOOK_INVALID = 'CRM_WEBHOOK_INVALID',

  // Generic
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EMAIL_SEND_FAILED = 'EMAIL_SEND_FAILED',
}

export class UserManagementError extends Error {
  constructor(
    message: string,
    public code: UserManagementErrorCode,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UserManagementError';
  }
}

// ==============================================================================
// User Registration Types
// ==============================================================================

export interface CreateRegistrationRequest {
  email: string;
  fullName?: string;
  registrationSource?: string; // landing_page, referral, etc.
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface StartTrialRequest {
  registrationId: string;
  tenantConfig?: {
    name: string;
    slug?: string;
    subscriptionTier?: SubscriptionTier;
  };
}

export interface ConvertToPaidRequest {
  registrationId: string;
  subscriptionTier: SubscriptionTier;
  stripeCustomerId?: string;
  billingEmail?: string;
}

export interface RegistrationResponse {
  id: string;
  email: string;
  lifecycleStage: LifecycleStage;
  verificationSentAt: Date | null;
  verifiedAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  convertedAt: Date | null;
  tenantId: string | null;
  userId: string | null;
  createdAt: Date;
}

export interface LifecycleTransitionMetadata {
  from: LifecycleStage;
  to: LifecycleStage;
  registrationId: string;
  tenantId?: string;
  userId?: string;
  triggeredBy: string; // system, user_id, admin_id
  metadata?: Record<string, unknown>;
}

// ==============================================================================
// User Invitation Types
// ==============================================================================

export interface CreateInvitationRequest {
  tenantId: string;
  email: string;
  role: StakeholderRole;
  message?: string;
  invitedBy: string;
  expiresInDays?: number; // Default 7
}

export interface AcceptInvitationRequest {
  token: string;
  userInfo?: {
    fullName?: string;
    password?: string; // If not using OAuth
  };
}

export interface RevokeInvitationRequest {
  invitationId: string;
  revokedBy: string;
  reason?: string;
}

export interface InvitationResponse {
  id: string;
  tenantId: string;
  email: string;
  role: StakeholderRole;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: Date;
  emailSentAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

// ==============================================================================
// Tenant Provisioning Types
// ==============================================================================

export interface ProvisionTenantRequest {
  registrationId: string;
  tenantConfig: {
    name: string;
    slug?: string; // Auto-generated if not provided
    subscriptionTier: SubscriptionTier;
    primaryEmail: string;
    billingEmail?: string;
  };
  ownerInfo?: {
    fullName?: string;
    role?: StakeholderRole;
  };
}

export interface TenantProvisioningResponse {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  projectId: string | null; // Default project created
  subscriptionEndsAt: Date | null;
}

export interface TenantLimitsValidation {
  valid: boolean;
  limits: {
    maxProjects: number;
    currentProjects: number;
    maxUsers: number;
    currentUsers: number;
    maxStorageGb: number;
    currentStorageGb: number;
  };
  violations: string[];
}

// ==============================================================================
// User Authorization Types
// ==============================================================================

export interface AuthorizeUserRequest {
  userId: string;
  authorizedBy: string;
  reason?: string;
}

export interface RevokeAuthorizationRequest {
  userId: string;
  revokedBy: string;
  reason: string;
}

export interface AuthorizationStatus {
  isAuthorized: boolean;
  authorizedAt: Date | null;
  authorizedBy: string | null;
  isPlatformAdmin: boolean;
}

// ==============================================================================
// Email Template Types
// ==============================================================================

export interface CreateTemplateRequest {
  templateType: EmailTemplateType;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  previewText?: string;
  requiredVariables: string[];
  createdBy: string;
  notes?: string;
}

export interface PublishTemplateRequest {
  templateId: string;
  activeFrom?: Date;
  activeUntil?: Date;
  publishedBy: string;
}

export interface RenderTemplateRequest {
  templateType: EmailTemplateType;
  variables: Record<string, string>;
}

export interface TemplateResponse {
  id: string;
  templateType: EmailTemplateType;
  status: EmailTemplateStatus;
  subject: string;
  version: number;
  requiredVariables: string[];
  activeFrom: Date | null;
  activeUntil: Date | null;
  createdAt: Date;
}

export interface RenderedTemplate {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  previewText?: string;
}

// ==============================================================================
// CRM Integration Types
// ==============================================================================

export interface CRMLeadData {
  email: string;
  fullName?: string;
  companyName?: string;
  phone?: string;
  source: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  lifecycleStage: LifecycleStage;
  metadata?: Record<string, unknown>;
}

export interface CRMContactData {
  email: string;
  fullName: string;
  tenantId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export interface CRMCompanyData {
  tenantId: string;
  name: string;
  slug: string;
  subscriptionTier: SubscriptionTier;
  primaryEmail: string | null;
  billingEmail?: string;
  userCount: number;
  projectCount: number;
  createdAt: Date;
}

export interface CRMWebhookEvent {
  eventType:
    | 'lead.qualified'
    | 'trial.started'
    | 'trial.converted'
    | 'subscription.cancelled';
  timestamp: Date;
  data: Record<string, unknown>;
  signature?: string; // For webhook validation
}

export interface CRMSyncResult {
  success: boolean;
  crmLeadId?: string;
  crmContactId?: string;
  crmCompanyId?: string;
  error?: string;
  syncedAt: Date;
}

// ==============================================================================
// Service Configuration
// ==============================================================================

export interface UserManagementServiceConfig {
  // Email configuration
  emailFrom: string;
  emailReplyTo?: string;

  // Frontend URLs for email links
  frontendUrl: string;
  verificationLinkPattern: string; // e.g., "/verify-email?token={token}"
  invitationLinkPattern: string; // e.g., "/accept-invitation?token={token}"

  // Trial configuration
  trialDurationDays: number; // Default 14
  trialReminderDays: number[]; // e.g., [7, 3, 1] - send reminders

  // Invitation configuration
  invitationExpirationDays: number; // Default 7
  invitationReminderDays: number[]; // e.g., [3] - send reminder after 3 days

  // Authorization cache
  authorizationCacheTtlSeconds: number; // Default 300 (5 minutes)

  // CRM integration
  crmEnabled: boolean;
  crmApiUrl?: string;
  crmApiKey?: string;
  crmWebhookSecret?: string;

  // Rate limiting
  registrationRateLimitPerIp: number; // Default 10 per hour
  invitationRateLimitPerTenant: number; // Default 50 per hour
}

// ==============================================================================
// Constants
// ==============================================================================

export const DEFAULT_TRIAL_DURATION_DAYS = 14;
export const DEFAULT_INVITATION_EXPIRATION_DAYS = 7;
export const DEFAULT_VERIFICATION_TOKEN_LENGTH = 64;
export const DEFAULT_INVITATION_TOKEN_LENGTH = 128;
export const DEFAULT_AUTHORIZATION_CACHE_TTL_SECONDS = 300; // 5 minutes

export const LIFECYCLE_STAGE_TRANSITIONS: Record<
  LifecycleStage,
  LifecycleStage[]
> = {
  WAITLIST: ['EMAIL_SENT', 'EMAIL_VERIFIED'],
  EMAIL_SENT: ['EMAIL_VERIFIED', 'WAITLIST'],
  EMAIL_VERIFIED: ['TRIAL', 'WAITLIST'],
  TRIAL: ['TRIAL_EXPIRED', 'PAID', 'CHURNED'],
  TRIAL_EXPIRED: ['TRIAL', 'PAID', 'CHURNED'],
  PAID: ['CHURNED', 'REACTIVATED'],
  CHURNED: ['REACTIVATED'],
  REACTIVATED: ['PAID', 'CHURNED'],
};

export const SUBSCRIPTION_TIER_PRICING: Record<
  SubscriptionTier,
  { mrr: number; arr: number }
> = {
  FREE: { mrr: 0, arr: 0 },
  BASIC: { mrr: 49, arr: 588 },
  PROFESSIONAL: { mrr: 199, arr: 2388 },
  ENTERPRISE: { mrr: 999, arr: 11988 }, // Custom pricing in practice
};
