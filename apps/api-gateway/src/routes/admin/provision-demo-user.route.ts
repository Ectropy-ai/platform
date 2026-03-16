/**
 * Demo User Provisioning Route
 *
 * Provisions a new demo tenant + user for approved demo requests.
 * Supports dual authentication: API key (n8n pipeline) OR platform admin session (console).
 *
 * Authentication: API key with scope `provision_demo_user` OR platform admin session
 * Endpoint: POST /api/admin/provision-demo-user
 *
 * Dependencies: Prisma (shared singleton), api-key middleware, email service
 * Mounted at: /api/admin in main.ts — route path is /provision-demo-user
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
 *
 * @param text - Raw company name
 * @returns URL-safe slug
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
 *
 * @returns Express Router with POST /provision-demo-user
 */
export function createDemoProvisioningRoutes(): Router {
  const router = express.Router();
  const prisma = getPrismaClient();

  /**
   * POST /api/admin/provision-demo-user
   *
   * Provision a new demo tenant + user.
   * Auth: API key (scope: provision_demo_user) OR platform admin session.
   *
   * @param req.body.email    - Google email of the prospect (required)
   * @param req.body.name     - Full name (required)
   * @param req.body.company  - Company name, used for tenant slug (required)
   * @param req.body.crm_contact_id - Twenty CRM contact ID (optional)
   *
   * @returns 201 { user_id, tenant_id, email, demo_url }
   * @returns 400 missing required fields
   * @returns 403 not platform admin (session auth only)
   * @returns 409 email already exists
   * @returns 500 DB failure
   */
  router.post(
    '/provision-demo-user',
    apiKeyMiddleware.dualAuth(['provision_demo_user', '*']),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      // --- Platform admin guard for session-based auth ---
      // API key auth is scope-checked by dualAuth middleware already.
      // Session auth needs explicit platform admin check.
      if (req.user && !req.apiKey && !req.user.is_platform_admin) {
        res.status(403).json({
          error: 'Platform admin access required',
          code: 'FORBIDDEN',
        });
        return;
      }

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

      // --- Check for existing user (return 409 instead of upserting) ---
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          tenant_id: true,
          is_authorized: true,
          company: true,
        },
      });

      if (existingUser) {
        logger.warn('[Demo Provisioning] User already exists', {
          email: normalizedEmail,
          userId: existingUser.id,
          tenantId: existingUser.tenant_id,
        });
        res.status(409).json({
          error: 'User already exists',
          code: 'USER_EXISTS',
          existing_user: {
            user_id: existingUser.id,
            email: existingUser.email,
            tenant_id: existingUser.tenant_id,
            is_authorized: existingUser.is_authorized,
            company: existingUser.company,
          },
        });
        return;
      }

      const slug = `demo-${slugify(company)}-${crypto.randomUUID().slice(0, 8)}`;

      // --- Trial end date: 14 days from now ---
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14);

      // --- Transactional: tenant + user + demo project roles ---
      const result = await prisma.$transaction(async (tx) => {
        // 1. Create tenant with trial limits
        const tenant = await tx.tenant.create({
          data: {
            name: company,
            slug,
            status: 'TRIAL',
            subscription_tier: 'FREE',
            max_projects: 3,
            max_users: 5,
            max_storage_gb: 10,
            primary_email: normalizedEmail,
            trial_ends_at: trialEndDate,
          },
        });

        // 2. Create user
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            full_name: name,
            company,
            provider: 'google',
            is_authorized: true,
            is_platform_admin: false,
            authorized_at: new Date(),
            tenant_id: tenant.id,
            role: 'consultant',
            roles: ['consultant'],
          },
        });

        // 3. Assign CONSULTANT role on seeded demo projects
        //    Look for projects with tenant_id='demo-seed' or name containing 'Demo'
        const demoProjects = await tx.project.findMany({
          where: {
            OR: [
              { tenant_id: 'demo-seed' },
              { name: { contains: 'Demo', mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true },
        });

        if (demoProjects.length > 0) {
          for (const project of demoProjects) {
            await tx.projectRole.create({
              data: {
                project_id: project.id,
                user_id: user.id,
                role: 'consultant',
              },
            });
          }
          logger.info('[Demo Provisioning] Demo project roles assigned', {
            userId: user.id,
            projectCount: demoProjects.length,
            projectIds: demoProjects.map((p) => p.id),
          });
        } else {
          logger.warn(
            '[Demo Provisioning] No demo projects found for role assignment — user will start with empty project list',
            { userId: user.id }
          );
        }

        return { tenant, user, demoProjectCount: demoProjects.length };
      });

      // --- Send invitation email (fire-and-forget) ---
      // TODO: Replace with Resend invitation template when ready
      emailService
        .sendUserInvitation(
          normalizedEmail,
          'Ectropy',
          company,
          crypto.randomUUID(), // invitation token
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
        demoProjectsAssigned: result.demoProjectCount,
        provisionedBy: req.apiKey?.name || req.user?.email || 'unknown',
      });

      res.status(201).json(
        createResponse.success({
          user_id: result.user.id,
          tenant_id: result.tenant.id,
          email: normalizedEmail,
          demo_url: 'https://ectropy.ai',
        })
      );
    })
  );

  return router;
}
