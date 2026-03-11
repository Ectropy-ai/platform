/**
 * Demo User Provisioning Route
 *
 * Server-to-server endpoint for n8n demo-approval-pipeline.
 * Creates a tenant + user + invitation for approved demo requests.
 *
 * Authentication: API key with scope-based authorization
 * Endpoint: POST /api/admin/provision-demo-user
 *
 * @module routes/admin/provision-demo-user
 */

import express, { type Request, type Response, type Router } from 'express';
import crypto from 'crypto';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import {
  asyncHandler,
  createResponse,
} from '../../../../../libs/shared/utils/src/simple-errors.js';
import { getPrismaClient } from '../../database/prisma.js';
import { apiKeyMiddleware } from '../../middleware/api-key.middleware.js';
import { emailService } from '../../services/email.service.js';

// Import Express type augmentation for req.user and req.apiKey
import '../../../../../libs/shared/types/src/express.js';

/**
 * Slugify a company name for tenant slug generation.
 * Produces URL-safe lowercase slugs: "Acme Corp" → "acme-corp"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
    .replace(/[\s_]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
}

/**
 * Create the demo provisioning router.
 * Mounted at /api/admin in main.ts — route path is /provision-demo-user.
 */
export function createDemoProvisioningRoutes(): Router {
  const router = express.Router();
  const prisma = getPrismaClient();

  /**
   * POST /api/admin/provision-demo-user
   *
   * Provision a new demo tenant + user from CRM approval.
   *
   * Request body:
   *   { email: string, name: string, company: string, crm_contact_id?: string }
   *
   * Response:
   *   { user_id, tenant_id, invitation_token, expires_at }
   */
  router.post(
    '/provision-demo-user',
    apiKeyMiddleware.dualAuth(['provision_demo_user', '*']),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { email, name, company, crm_contact_id } = req.body;

      // --- Validate required fields ---
      if (!email || typeof email !== 'string') {
        res.status(400).json({
          error: 'email is required',
          code: 'MISSING_EMAIL',
        });
        return;
      }
      if (!name || typeof name !== 'string') {
        res.status(400).json({
          error: 'name is required',
          code: 'MISSING_NAME',
        });
        return;
      }
      if (!company || typeof company !== 'string') {
        res.status(400).json({
          error: 'company is required',
          code: 'MISSING_COMPANY',
        });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const slug = `demo-${slugify(company)}-${crypto.randomUUID().slice(0, 8)}`;

      // --- Trial end date: 14 days from now ---
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14);

      // --- Invitation token: 7-day expiry ---
      const invitationToken = crypto.randomUUID();
      const invitationExpiresAt = new Date();
      invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7);

      // --- Transactional: tenant + user ---
      const result = await prisma.$transaction(async (tx) => {
        // 1. Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: company,
            slug,
            status: 'ACTIVE',
            subscription_tier: 'FREE',
            trial_ends_at: trialEndDate,
          },
        });

        // 2. Upsert user (may already exist from waitlist/OAuth)
        const user = await tx.user.upsert({
          where: { email: normalizedEmail },
          create: {
            email: normalizedEmail,
            full_name: name,
            company,
            is_authorized: true,
            authorized_at: new Date(),
            tenant_id: tenant.id,
            role: 'consultant',
          },
          update: {
            is_authorized: true,
            authorized_at: new Date(),
            tenant_id: tenant.id,
            full_name: name,
            company,
          },
        });

        return { tenant, user };
      });

      // --- Send invitation email (fire-and-forget) ---
      emailService
        .sendUserInvitation(
          normalizedEmail,
          'Ectropy',
          company,
          invitationToken,
          'consultant'
        )
        .catch((err) => {
          logger.error('[Demo Provisioning] Failed to send invitation email', {
            email: normalizedEmail,
            error: err instanceof Error ? err.message : String(err),
          });
        });

      logger.info('[Demo Provisioning] Demo user provisioned', {
        userId: result.user.id,
        tenantId: result.tenant.id,
        tenantSlug: slug,
        email: normalizedEmail,
        company,
        crmContactId: crm_contact_id || null,
        provisionedBy: req.apiKey?.name || req.user?.email || 'unknown',
      });

      res.status(200).json(
        createResponse.success({
          user_id: result.user.id,
          tenant_id: result.tenant.id,
          tenant_slug: slug,
          invitation_token: invitationToken,
          expires_at: invitationExpiresAt.toISOString(),
        })
      );
    })
  );

  return router;
}
