/**
 * ==============================================================================
 * USER MANAGEMENT SERVICES (M2.2-M2.7)
 * ==============================================================================
 * Enterprise service layer for self-service customer onboarding
 * Milestone: User Management M2 (Backend Services Layer)
 * ==============================================================================
 */

// Types
export * from './types.js';

// Services
export { EmailTemplateService } from './email-template.service.js';
export { UserRegistrationService } from './user-registration.service.js';
export { UserInvitationService } from './user-invitation.service.js';
export { TenantProvisioningService } from './tenant-provisioning.service.js';
export { UserAuthorizationService } from './user-authorization.service.js';
export { CRMIntegrationService } from './crm-integration.service.js';
