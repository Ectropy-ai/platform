/**
 * @fileoverview Stage2ProjectService — creates or returns the project
 * record and its associated voxel_grid record.
 *
 * Idempotency: findFirst by name+tenant_id, create only if absent.
 * Running twice produces the same project record.
 *
 * Context mutation: sets context.projectId on success.
 * Also creates a voxel_grids record (raw SQL — not in Prisma) if bundle
 * has pipeline_flags.voxelize=true and no grid exists.
 *
 * Prisma model: Project (table: projects)
 *   - No @@unique on name+tenant_id — uses findFirst+create pattern
 *   - Requires owner_id (FK to User) — creates/finds a system owner user
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Stage 2
 */

import { createHash } from 'crypto';
import type { IIntakeStage, IntakeContext, StageResult } from '../interfaces/intake-stage.interface';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeStageId } from '../interfaces/bundle.types';

export class Stage2ProjectService implements IIntakeStage {
  readonly stageId: IntakeStageId = 'PROJECT';
  readonly stageName = 'Project Provisioning';

  async execute(context: IntakeContext): Promise<StageResult> {
    const start = Date.now();
    const { bundle, db, log } = context;
    const { project: p, ifc } = bundle;

    if (!context.tenantId) {
      throw new IntakeStageError(
        this.stageId,
        'context.tenantId is not set — Stage 1 must run before Stage 2',
      );
    }

    log.info(this.stageId, `Provisioning project name='${p.name}' tenantId=${context.tenantId}`);

    try {
      const db_ = db as any;

      // Find or create a system owner user for project ownership.
      // Uses the bundle creator email or a system default.
      const ownerEmail = bundle.created_by || 'system@ectropy.ai';
      const owner = await db_.user.upsert({
        where: { email: ownerEmail },
        create: {
          email: ownerEmail,
          full_name: 'System Owner',
          is_authorized: true,
          tenant_id: context.tenantId,
        },
        update: {},
        select: { id: true },
      });

      // If the bundle specifies a canonical project ID, upsert against that
      // stable UUID. This ensures the demo project dc1eaa5b is always the
      // target and the speckle_streams row is never orphaned to a new record.
      // Falls back to findFirst-by-name for non-canonical bundles.
      const canonicalProjectId = (p as any).canonical_id as string | undefined;

      let project: { id: string };
      if (canonicalProjectId) {
        project = await db_.project.upsert({
          where: { id: canonicalProjectId },
          create: {
            id: canonicalProjectId,
            name: p.name,
            tenant_id: context.tenantId,
            owner_id: owner.id,
            status: 'planning',
            currency: p.currency ?? 'CAD',
            total_budget: p.budget ?? null,
            start_date: p.start_date ? new Date(p.start_date) : null,
            expected_completion: p.target_completion ? new Date(p.target_completion) : null,
          },
          update: {
            name: p.name,
            tenant_id: context.tenantId,
          },
          select: { id: true },
        });
        log.info(this.stageId, `Project upserted (canonical) id=${project.id}`);
      } else {
        project = await db_.project.findFirst({
          where: {
            name: p.name,
            tenant_id: context.tenantId,
          },
          select: { id: true },
        });

        if (!project) {
          project = await db_.project.create({
            data: {
              name: p.name,
              tenant_id: context.tenantId,
              owner_id: owner.id,
              status: 'planning',
              currency: p.currency ?? 'CAD',
              total_budget: p.budget ?? null,
              start_date: p.start_date ? new Date(p.start_date) : null,
              expected_completion: p.target_completion ? new Date(p.target_completion) : null,
            },
            select: { id: true },
          });
          log.info(this.stageId, `Project created id=${project.id}`);
        } else {
          log.info(this.stageId, `Project exists id=${project.id}`);
        }
      }

      context.projectId = project.id as string;

      // Create voxel_grids record via raw SQL (not in Prisma schema).
      // Only when bundle declares voxelization.
      if (bundle.pipeline_flags.voxelize && ifc) {
        const existingGrid = await db_.$queryRaw`
          SELECT id FROM voxel_grids
          WHERE project_id = ${context.projectId}::uuid
            AND resolution_tier = 'COARSE'
            AND source_type = 'BIM'
          LIMIT 1
        `;

        if (!existingGrid || (Array.isArray(existingGrid) && existingGrid.length === 0)) {
          const gridResult = await db_.$queryRaw`
            INSERT INTO voxel_grids (
              id, project_id, stream_id, resolution, resolution_tier,
              source_type, status, voxel_count, created_at, updated_at
            ) VALUES (
              gen_random_uuid(),
              ${context.projectId}::uuid,
              ${ifc.speckle_stream_id ?? ''},
              ${ifc.voxelization.resolution_m},
              ${ifc.voxelization.resolution_tier},
              'BIM', 'PENDING', 0, NOW(), NOW()
            )
            RETURNING id
          `;
          const gridId = Array.isArray(gridResult) && gridResult[0]?.id
            ? String(gridResult[0].id)
            : undefined;
          context.voxelGridId = gridId;
          log.info(this.stageId, `VoxelGrid created id=${gridId}`);
        } else {
          context.voxelGridId = String((existingGrid as any[])[0].id);
          log.info(this.stageId, `VoxelGrid exists id=${context.voxelGridId}`);
        }
      }

      const idempotencyKey = createHash('sha256')
        .update(`PROJECT:${project.id}:${context.voxelGridId ?? 'no-grid'}`)
        .digest('hex')
        .slice(0, 16);

      log.info(this.stageId, `Project ready id=${project.id}`);

      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: context.voxelGridId ? 2 : 1,
        durationMs: Date.now() - start,
        idempotencyKey,
        warnings: [],
      };
    } catch (err) {
      if (err instanceof IntakeStageError) throw err;
      log.error(this.stageId, 'Project upsert failed', err);
      throw new IntakeStageError(this.stageId, 'Project upsert failed', err);
    }
  }
}
