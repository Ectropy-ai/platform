/**
 * Demo Data Seeding Route
 *
 * Server-to-server endpoint for n8n demo-approval-pipeline.
 * Seeds two demo projects with decisions and roles
 * for a provisioned demo tenant.
 *
 * Authentication: API key with scope-based authorization
 * Endpoint: POST /api/admin/seed-demo-data
 *
 * @module routes/admin/seed-demo-data
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

// Import Express type augmentation for req.user and req.apiKey
import '../../../../../libs/shared/types/src/express.js';

/** Demo project definitions */
const DEMO_PROJECTS = [
  {
    name: 'Demo Office Building',
    description:
      'A 12-story commercial office tower — $2.5M construction value. Includes structural, MEP, and envelope scopes with full BIM coordination.',
    total_budget: 2500000,
    status: 'active' as const,
  },
  {
    name: 'Sample Residential Complex',
    description:
      'A 48-unit residential complex — $1.8M construction value. Wood-frame with podium parking, two phases.',
    total_budget: 1800000,
    status: 'planning' as const,
  },
];

/** Sample decisions for each project */
function createDecisions(projectId: string, projectIndex: number) {
  const prefix = projectIndex === 0 ? 'OB' : 'RC';
  const now = new Date();

  return [
    {
      id: crypto.randomUUID(),
      urn: `urn:luhtech:demo:pm-decision:${prefix}-001`,
      project_id: projectId,
      decision_id: `DEC-DEMO-${prefix}-001`,
      title: 'Foundation System Selection',
      description:
        'Select between deep foundations (driven piles) vs shallow foundations (spread footings) based on geotechnical report.',
      type: 'APPROVAL' as const,
      status: 'APPROVED' as const,
      authority_required: 3,
      authority_current: 4,
      rationale:
        'Geotechnical report confirms bearing capacity adequate for spread footings at 6ft depth.',
      budget_estimated: 320000,
      budget_currency: 'USD',
      critical_path: true,
      approved_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      created_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      updated_at: now,
    },
    {
      id: crypto.randomUUID(),
      urn: `urn:luhtech:demo:pm-decision:${prefix}-002`,
      project_id: projectId,
      decision_id: `DEC-DEMO-${prefix}-002`,
      title: 'HVAC System Type',
      description:
        'Choose between VRF, chilled water, or packaged rooftop units for primary HVAC.',
      type: 'PROPOSAL' as const,
      status: 'PENDING' as const,
      authority_required: 4,
      authority_current: 2,
      budget_estimated: 480000,
      budget_currency: 'USD',
      critical_path: false,
      created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      updated_at: now,
    },
    {
      id: crypto.randomUUID(),
      urn: `urn:luhtech:demo:pm-decision:${prefix}-003`,
      project_id: projectId,
      decision_id: `DEC-DEMO-${prefix}-003`,
      title: 'Curtain Wall Glazing Specification',
      description:
        'Select glazing spec — triple IGU vs double IGU with low-e coating.',
      type: 'APPROVAL' as const,
      status: 'APPROVED' as const,
      authority_required: 3,
      authority_current: 3,
      rationale:
        'Energy model shows double IGU with low-e meets code and saves $140K vs triple.',
      budget_estimated: 210000,
      budget_currency: 'USD',
      critical_path: false,
      approved_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      updated_at: now,
    },
    {
      id: crypto.randomUUID(),
      urn: `urn:luhtech:demo:pm-decision:${prefix}-004`,
      project_id: projectId,
      decision_id: `DEC-DEMO-${prefix}-004`,
      title: 'Steel vs Concrete Structural Frame',
      description:
        'Primary structural system: structural steel moment frame vs cast-in-place concrete.',
      type: 'ESCALATION' as const,
      status: 'PENDING' as const,
      authority_required: 5,
      authority_current: 3,
      escalation_required: true,
      budget_estimated: 750000,
      budget_currency: 'USD',
      critical_path: true,
      delay_days: 14,
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      updated_at: now,
    },
    {
      id: crypto.randomUUID(),
      urn: `urn:luhtech:demo:pm-decision:${prefix}-005`,
      project_id: projectId,
      decision_id: `DEC-DEMO-${prefix}-005`,
      title: 'Fire Protection System Scope',
      description:
        'Full sprinkler coverage vs partial coverage with fire barriers.',
      type: 'APPROVAL' as const,
      status: 'REJECTED' as const,
      authority_required: 3,
      authority_current: 4,
      rationale:
        'Code review requires full sprinkler coverage for Type I-A construction. Partial coverage rejected.',
      budget_estimated: 195000,
      budget_currency: 'USD',
      critical_path: false,
      rejected_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      created_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      updated_at: now,
    },
  ];
}

/**
 * Create the demo data seeding router.
 * Mounted at /api/admin in main.ts — route path is /seed-demo-data.
 */
export function createSeedDemoDataRoutes(): Router {
  const router = express.Router();
  const prisma = getPrismaClient();

  /**
   * POST /api/admin/seed-demo-data
   *
   * Seed two demo projects with decisions, roles, and sample queries.
   *
   * Request body:
   *   { user_id: string, tenant_id: string }
   *
   * Response:
   *   { projects: [{ id, name, value }], decisions_count, roles_assigned }
   */
  router.post(
    '/seed-demo-data',
    apiKeyMiddleware.dualAuth(['seed_demo_data', '*']),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { user_id, tenant_id } = req.body;

      // --- Validate required fields ---
      if (!user_id || typeof user_id !== 'string') {
        res.status(400).json({
          error: 'user_id is required',
          code: 'MISSING_USER_ID',
        });
        return;
      }
      if (!tenant_id || typeof tenant_id !== 'string') {
        res.status(400).json({
          error: 'tenant_id is required',
          code: 'MISSING_TENANT_ID',
        });
        return;
      }

      // --- Verify tenant exists ---
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenant_id },
      });
      if (!tenant) {
        res.status(404).json({
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND',
          tenant_id,
        });
        return;
      }

      // --- Verify user belongs to tenant ---
      const user = await prisma.user.findFirst({
        where: { id: user_id, tenant_id },
      });
      if (!user) {
        res.status(404).json({
          error: 'User not found in tenant',
          code: 'USER_NOT_IN_TENANT',
          user_id,
          tenant_id,
        });
        return;
      }

      // --- Seed in transaction ---
      const result = await prisma.$transaction(async (tx) => {
        const createdProjects: { id: string; name: string; value: number }[] =
          [];
        let totalDecisions = 0;
        let totalRoles = 0;

        for (let i = 0; i < DEMO_PROJECTS.length; i++) {
          const def = DEMO_PROJECTS[i];

          // Create project
          const project = await tx.project.create({
            data: {
              name: def.name,
              description: def.description,
              tenant_id,
              owner_id: user_id,
              status: def.status,
              total_budget: def.total_budget,
              currency: 'USD',
            },
          });

          // Assign consultant role
          await tx.projectRole.create({
            data: {
              user_id,
              project_id: project.id,
              role: 'consultant',
              is_active: true,
            },
          });
          totalRoles++;

          // Seed decisions
          const decisions = createDecisions(project.id, i);
          for (const decision of decisions) {
            await tx.pMDecision.create({ data: decision });
          }
          totalDecisions += decisions.length;

          createdProjects.push({
            id: project.id,
            name: project.name,
            value: def.total_budget,
          });
        }

        return {
          projects: createdProjects,
          decisions_count: totalDecisions,
          roles_assigned: totalRoles,
        };
      });

      logger.info('[Demo Seed] Demo data seeded', {
        userId: user_id,
        tenantId: tenant_id,
        projects: result.projects.length,
        decisions: result.decisions_count,
        roles: result.roles_assigned,
        seededBy: req.apiKey?.name || req.user?.email || 'unknown',
      });

      res.status(200).json(
        createResponse.success({
          projects: result.projects,
          decisions_count: result.decisions_count,
          roles_assigned: result.roles_assigned,
        })
      );
    })
  );

  return router;
}
