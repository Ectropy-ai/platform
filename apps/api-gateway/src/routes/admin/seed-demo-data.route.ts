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

// Toy voxel generation removed — voxels populated exclusively by
// POST /api/admin/provision-project (IntakePipeline Stage 4: IFC_INGESTION).
// See: apps/api-gateway/src/intake/stages/stage-4-ifc.ts

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
   * Two modes:
   *
   * Mode 1 — Existing project (projectId provided):
   *   { projectId: string, assignRolesTo: ["email@..."] }
   *   Assigns OWNER roles to listed emails on the existing project.
   *   Seeds 25 demo voxels if the project has 0 voxels.
   *   Idempotent: ON CONFLICT (user_id, project_id, role) DO UPDATE SET is_active = true.
   *
   * Mode 2 — New projects (no projectId):
   *   { user_id: string, tenant_id: string }
   *   Creates 2 demo projects with decisions and roles.
   */
  router.post(
    '/seed-demo-data',
    apiKeyMiddleware.dualAuth(['seed_demo_data', '*']),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (process.env.DEMO_SEEDING_ENABLED !== 'true') {
        res.status(403).json({
          error: 'Demo seeding is disabled in this environment.',
          code: 'DEMO_SEEDING_DISABLED',
        });
        return;
      }

      const { user_id, tenant_id, projectId, assignRolesTo } = req.body;

      // ================================================================
      // Mode 1: Assign roles to an existing project + seed voxels if empty
      // ================================================================
      if (projectId && typeof projectId === 'string') {
        // Validate assignRolesTo
        if (!assignRolesTo || !Array.isArray(assignRolesTo) || assignRolesTo.length === 0) {
          res.status(400).json({
            error: 'assignRolesTo must be a non-empty array of email addresses',
            code: 'MISSING_ASSIGN_ROLES_TO',
          });
          return;
        }

        // Verify project exists
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { id: true, name: true, total_budget: true },
        });
        if (!project) {
          res.status(404).json({
            error: 'Project not found',
            code: 'PROJECT_NOT_FOUND',
            projectId,
          });
          return;
        }

        const result = await prisma.$transaction(async (tx) => {
          let rolesAssigned = 0;
          let voxelsSeeded = 0;
          const roleResults: { email: string; status: string }[] = [];

          // Assign OWNER role to each email
          for (const email of assignRolesTo) {
            const normalizedEmail = String(email).toLowerCase().trim();
            const targetUser = await tx.user.findFirst({
              where: { email: normalizedEmail },
              select: { id: true, email: true },
            });

            if (!targetUser) {
              roleResults.push({ email: normalizedEmail, status: 'user_not_found' });
              logger.warn('[Demo Seed] User not found for role assignment', { email: normalizedEmail });
              continue;
            }

            await tx.projectRole.upsert({
              where: {
                user_id_project_id_role: {
                  user_id: targetUser.id,
                  project_id: projectId,
                  role: 'owner',
                },
              },
              create: {
                user_id: targetUser.id,
                project_id: projectId,
                role: 'owner',
                permissions: ['admin', 'read', 'write', 'delete', 'manage_members'],
                voting_power: 100,
                is_active: true,
              },
              update: { is_active: true },
            });

            rolesAssigned++;
            roleResults.push({ email: normalizedEmail, status: 'assigned' });
          }

          // Voxels populated by POST /api/admin/provision-project — not seeded here

          return { rolesAssigned, voxelsSeeded: 0, existingVoxels: 0, roleResults };
        });

        logger.info('[Demo Seed] Existing project seeded', {
          projectId,
          rolesAssigned: result.rolesAssigned,
          voxelsSeeded: result.voxelsSeeded,
          existingVoxels: result.existingVoxels,
          seededBy: req.apiKey?.name || req.user?.email || 'unknown',
        });

        res.status(200).json(
          createResponse.success({
            mode: 'existing_project',
            project: { id: project.id, name: project.name },
            roles_assigned: result.rolesAssigned,
            role_results: result.roleResults,
            voxels_seeded: result.voxelsSeeded,
            existing_voxels: result.existingVoxels,
          })
        );
        return;
      }

      // ================================================================
      // Mode 2: Create new demo projects (original behavior)
      // ================================================================

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

          // Find or create project (idempotent: match on tenant_id + name)
          let project = await tx.project.findFirst({
            where: { tenant_id, name: def.name },
          });
          if (!project) {
            project = await tx.project.create({
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
          }

          // Assign consultant role (idempotent: upsert on unique(user_id, project_id, role))
          await tx.projectRole.upsert({
            where: {
              user_id_project_id_role: {
                user_id,
                project_id: project.id,
                role: 'consultant',
              },
            },
            create: {
              user_id,
              project_id: project.id,
              role: 'consultant',
              is_active: true,
            },
            update: { is_active: true },
          });
          totalRoles++;

          // Seed decisions
          const decisions = createDecisions(project.id, i);
          for (const decision of decisions) {
            await tx.pMDecision.upsert({
              where: { urn: decision.urn },
              create: decision,
              update: {},
            });
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
          mode: 'new_projects',
          projects: result.projects,
          decisions_count: result.decisions_count,
          roles_assigned: result.roles_assigned,
        })
      );
    })
  );

  return router;
}
