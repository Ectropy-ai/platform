/**
 * ==============================================================================
 * USER INVITATION SERVICE (M2.3)
 * ==============================================================================
 * Secure token-based team invitations with 7-day expiration
 * Milestone: User Management M2.3 (Backend Services Layer)
 * Purpose: Enable team collaboration with secure invitation workflow
 * ==============================================================================
 */

import {
  PrismaClient,
  InvitationStatus,
  EmailTemplateType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { logger } from '@ectropy/shared/utils';
import { emailService } from '../email.service.js';
import { EmailTemplateService } from './email-template.service.js';
import {
  UserManagementError,
  UserManagementErrorCode,
  CreateInvitationRequest,
  AcceptInvitationRequest,
  RevokeInvitationRequest,
  InvitationResponse,
  DEFAULT_INVITATION_EXPIRATION_DAYS,
  DEFAULT_INVITATION_TOKEN_LENGTH,
} from './types.js';

/**
 * User Invitation Service - Secure team invitations
 *
 * Security:
 * - Cryptographically secure tokens (128-byte random)
 * - 7-day expiration policy
 * - Unique token constraint
 * - Audit trail (invited_by, accepted_by, revoked_by)
 */
export class UserInvitationService {
  private emailTemplateService: EmailTemplateService;

  constructor(
    private prisma: PrismaClient,
    private config: {
      frontendUrl: string;
      invitationLinkPattern: string;
      invitationExpirationDays?: number;
    }
  ) {
    this.emailTemplateService = new EmailTemplateService(prisma);
    logger.info('[UserInvitationService] Initialized');
  }

  /**
   * Create invitation
   */
  async createInvitation(
    request: CreateInvitationRequest
  ): Promise<InvitationResponse> {
    // Check for duplicate pending invitation
    const existing = await this.prisma.userInvitation.findFirst({
      where: {
        tenant_id: request.tenantId,
        email: request.email.toLowerCase(),
        status: InvitationStatus.PENDING,
      },
    });

    if (existing) {
      throw new UserManagementError(
        'Pending invitation already exists for this email',
        UserManagementErrorCode.DUPLICATE_PENDING_INVITATION,
        { tenantId: request.tenantId, email: request.email }
      );
    }

    // Generate secure token
    const token = randomBytes(DEFAULT_INVITATION_TOKEN_LENGTH).toString('hex');

    // Calculate expiration
    const expirationDays =
      request.expiresInDays ||
      this.config.invitationExpirationDays ||
      DEFAULT_INVITATION_EXPIRATION_DAYS;
    const expiresAt = new Date(
      Date.now() + expirationDays * 24 * 60 * 60 * 1000
    );

    // Create invitation
    const invitation = await this.prisma.userInvitation.create({
      data: {
        tenant_id: request.tenantId,
        email: request.email.toLowerCase(),
        token,
        role: request.role,
        status: InvitationStatus.PENDING,
        invited_by: request.invitedBy,
        message: request.message,
        expires_at: expiresAt,
      },
    });

    logger.info('[UserInvitationService] Invitation created', {
      invitationId: invitation.id,
      tenantId: request.tenantId,
      email: request.email,
      role: request.role,
      expiresAt,
    });

    return this.mapToResponse(invitation);
  }

  /**
   * Send invitation email
   */
  async sendInvitationEmail(invitationId: string): Promise<void> {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { id: invitationId },
      include: {
        tenant: true,
        inviter: true,
      },
    });

    if (!invitation) {
      throw new UserManagementError(
        'Invitation not found',
        UserManagementErrorCode.INVITATION_NOT_FOUND,
        { invitationId }
      );
    }

    // Build invitation link
    const invitationLink = `${this.config.frontendUrl}${this.config.invitationLinkPattern.replace('{token}', invitation.token)}`;

    // Render template
    const rendered = await this.emailTemplateService.renderTemplate({
      templateType: EmailTemplateType.INVITATION,
      variables: {
        inviter_name: invitation.inviter?.full_name || 'Team Admin',
        tenant_name: invitation.tenant.name,
        role: invitation.role,
        invitation_link: invitationLink,
      },
    });

    // Send email
    const emailResult = await emailService.sendEmail({
      to: invitation.email,
      subject: rendered.subject,
      html: rendered.bodyHtml,
      text: rendered.bodyText,
      tags: { type: 'invitation', invitationId },
    });

    if (!emailResult.success) {
      throw new UserManagementError(
        'Failed to send invitation email',
        UserManagementErrorCode.EMAIL_SEND_FAILED,
        { invitationId, error: emailResult.error }
      );
    }

    // Update invitation
    await this.prisma.userInvitation.update({
      where: { id: invitationId },
      data: { email_sent_at: new Date() },
    });

    logger.info('[UserInvitationService] Invitation email sent', {
      invitationId,
      email: invitation.email,
      messageId: emailResult.messageId,
    });
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(request: AcceptInvitationRequest): Promise<{
    invitationId: string;
    tenantId: string;
    email: string;
    role: string;
  }> {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token: request.token },
    });

    if (!invitation) {
      throw new UserManagementError(
        'Invalid invitation token',
        UserManagementErrorCode.INVITATION_NOT_FOUND,
        { token: `${request.token.substring(0, 8)}...` }
      );
    }

    // Check status
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new UserManagementError(
        'Invitation already accepted',
        UserManagementErrorCode.INVITATION_ALREADY_ACCEPTED,
        { invitationId: invitation.id }
      );
    }

    if (invitation.status === InvitationStatus.REVOKED) {
      throw new UserManagementError(
        'Invitation has been revoked',
        UserManagementErrorCode.INVITATION_REVOKED,
        { invitationId: invitation.id }
      );
    }

    // Check expiration
    if (new Date() > invitation.expires_at) {
      await this.prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });

      throw new UserManagementError(
        'Invitation has expired',
        UserManagementErrorCode.INVITATION_EXPIRED,
        { invitationId: invitation.id, expiresAt: invitation.expires_at }
      );
    }

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (!user) {
      // Create user account (OAuth will populate additional fields)
      user = await this.prisma.user.create({
        data: {
          email: invitation.email,
          full_name: request.userInfo?.fullName || invitation.email,
          role: invitation.role,
          roles: [invitation.role],
          tenant_id: invitation.tenant_id,
          is_active: true,
          is_authorized: true,
          authorized_at: new Date(),
        },
      });

      logger.info('[UserInvitationService] User created from invitation', {
        userId: user.id,
        email: invitation.email,
        tenantId: invitation.tenant_id,
      });
    }

    // Create tenant membership
    await this.prisma.tenantMember.create({
      data: {
        tenant_id: invitation.tenant_id,
        user_id: user.id,
        role: invitation.role,
        is_active: true,
        joined_at: new Date(),
      },
    });

    // Mark invitation as accepted
    await this.prisma.userInvitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.ACCEPTED,
        accepted_at: new Date(),
        accepted_by: user.id,
      },
    });

    logger.info('[UserInvitationService] Invitation accepted', {
      invitationId: invitation.id,
      userId: user.id,
      tenantId: invitation.tenant_id,
    });

    return {
      invitationId: invitation.id,
      tenantId: invitation.tenant_id,
      email: invitation.email,
      role: invitation.role,
    };
  }

  /**
   * Revoke invitation
   */
  async revokeInvitation(request: RevokeInvitationRequest): Promise<void> {
    await this.prisma.userInvitation.update({
      where: { id: request.invitationId },
      data: {
        status: InvitationStatus.REVOKED,
        revoked_at: new Date(),
        revoked_by: request.revokedBy,
      },
    });

    logger.info('[UserInvitationService] Invitation revoked', {
      invitationId: request.invitationId,
      revokedBy: request.revokedBy,
      reason: request.reason,
    });
  }

  /**
   * Expire old invitations (cron job)
   */
  async expireInvitations(): Promise<number> {
    const result = await this.prisma.userInvitation.updateMany({
      where: {
        status: InvitationStatus.PENDING,
        expires_at: { lt: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });

    logger.info('[UserInvitationService] Expired invitations', {
      count: result.count,
    });
    return result.count;
  }

  private mapToResponse(invitation: any): InvitationResponse {
    return {
      id: invitation.id,
      tenantId: invitation.tenant_id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      invitedBy: invitation.invited_by,
      expiresAt: invitation.expires_at,
      emailSentAt: invitation.email_sent_at,
      acceptedAt: invitation.accepted_at,
      revokedAt: invitation.revoked_at,
      createdAt: invitation.created_at,
    };
  }
}
