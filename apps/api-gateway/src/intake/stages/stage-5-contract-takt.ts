/**
 * @fileoverview Stage5ContractTaktService — applies takt zone status
 * distribution to existing BOX cells via coordinate-range SQL UPDATEs.
 *
 * This turns the building from uniform blue into the takt narrative:
 * green (COMPLETE), orange (IN_PROGRESS), red (BLOCKED), blue (PLANNED).
 *
 * Mechanism:
 *   1. Load takt-schedule.json from bundle.takt_ref via Spaces
 *   2. Sort zones from least specific to most specific
 *   3. For each zone, UPDATE voxels matching coordinate bounds
 *   4. More specific zones run later and override broader zones
 *
 * Table: voxels (confirmed from Prisma @@map("voxels"))
 * Columns: project_id, coord_x, coord_y, coord_z, status (VoxelStatus enum),
 *   zone, percent_complete, planned_start, actual_start, actual_end,
 *   graph_metadata, updated_at
 *
 * No PostGIS. No new rows. Fully idempotent.
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part IV
 */

import { createHash } from 'crypto';
import type {
  IIntakeStage,
  IntakeContext,
  StageResult,
  TaktZoneMap,
} from '../interfaces/intake-stage.interface';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeStageId } from '../interfaces/bundle.types';
import type { TaktSchedule, TaktZoneDef } from './takt-schedule.types';
import { sortZonesBySpecificity } from './takt-schedule.types';

export class Stage5ContractTaktService implements IIntakeStage {
  readonly stageId: IntakeStageId = 'CONTRACT_TAKT';
  readonly stageName = 'Contract and Takt Zone Application';

  async execute(context: IntakeContext): Promise<StageResult> {
    const start = Date.now();
    const { bundle, db, spaces, log } = context;

    if (!bundle.pipeline_flags.apply_takt) {
      log.info(this.stageId, 'apply_takt=false — skipping takt application');
      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 0,
        durationMs: Date.now() - start,
        idempotencyKey: 'skipped',
        warnings: ['apply_takt=false — no takt zones applied'],
      };
    }

    if (!context.projectId) {
      throw new IntakeStageError(
        this.stageId,
        'context.projectId must be set before Stage 5',
      );
    }

    if (!bundle.takt_ref) {
      throw new IntakeStageError(
        this.stageId,
        'bundle.takt_ref is required when apply_takt=true',
      );
    }

    log.info(this.stageId, `Loading takt schedule from '${bundle.takt_ref}'`);
    let schedule: TaktSchedule;
    try {
      const raw = await (spaces as any).getText(bundle.takt_ref);
      schedule = JSON.parse(raw) as TaktSchedule;
    } catch (err) {
      throw new IntakeStageError(
        this.stageId,
        `Failed to load takt schedule from '${bundle.takt_ref}'`,
        err,
      );
    }

    if (!schedule.zones || schedule.zones.length === 0) {
      throw new IntakeStageError(this.stageId, 'Takt schedule has no zones');
    }

    const sortedZones = sortZonesBySpecificity(schedule.zones);
    log.info(this.stageId, `Applying ${sortedZones.length} takt zones (sorted by specificity)`);

    const db_ = db as any;
    let totalRowsAffected = 0;
    const warnings: string[] = [];
    const taktZoneMap: TaktZoneMap = {};

    try {
      for (const zone of sortedZones) {
        const rowsAffected = await this.applyZone(db_, context.projectId, zone, log);
        totalRowsAffected += rowsAffected;
        taktZoneMap[zone.zone_id] = {
          status: zone.status,
          z_min: zone.z_range?.min,
          z_max: zone.z_range?.max,
          x_min: zone.x_range?.min,
          x_max: zone.x_range?.max,
          y_min: zone.y_range?.min,
          y_max: zone.y_range?.max,
        };

        if (rowsAffected === 0) {
          warnings.push(`Zone '${zone.zone_id}' matched 0 BOX cells — check coordinate ranges`);
          log.warn(this.stageId, `Zone '${zone.zone_id}' matched 0 cells`);
        } else {
          log.info(this.stageId, `Zone '${zone.zone_id}' → ${zone.status} (${rowsAffected} cells)`);
        }
      }
    } catch (err) {
      if (err instanceof IntakeStageError) throw err;
      log.error(this.stageId, 'Takt application failed', err);
      throw new IntakeStageError(this.stageId, 'Takt application failed', err);
    }

    context.taktZoneMap = taktZoneMap;

    const idempotencyInput = sortedZones.map(z => `${z.zone_id}:${z.status}`).join('|');
    const idempotencyKey = createHash('sha256')
      .update(`CONTRACT_TAKT:${context.projectId}:${idempotencyInput}`)
      .digest('hex')
      .slice(0, 16);

    log.info(this.stageId, `Takt complete — ${totalRowsAffected} cells updated across ${sortedZones.length} zones`);

    return {
      stageId: this.stageId,
      success: true,
      rowsAffected: totalRowsAffected,
      durationMs: Date.now() - start,
      idempotencyKey,
      warnings,
    };
  }

  private async applyZone(
    db: any,
    projectId: string,
    zone: TaktZoneDef,
    log: IntakeContext['log'],
  ): Promise<number> {
    // Table: voxels (confirmed from Prisma @@map("voxels"))
    const setClauses: string[] = [
      `status = '${zone.status}'`,
      `zone = '${zone.zone_id}'`,
      `percent_complete = ${zone.percent_complete}`,
      `updated_at = NOW()`,
    ];
    if (zone.planned_start) {
      setClauses.push(`planned_start = '${zone.planned_start}'`);
    }
    if (zone.actual_start) {
      setClauses.push(`actual_start = '${zone.actual_start}'`);
    }
    if (zone.actual_end) {
      setClauses.push(`actual_end = '${zone.actual_end}'`);
    }
    if (zone.blocking_decision_ref) {
      setClauses.push(
        `graph_metadata = jsonb_set(` +
        `COALESCE(graph_metadata, '{}'), ` +
        `'{blockingDecisionRef}', ` +
        `'"${zone.blocking_decision_ref}"'::jsonb)`,
      );
    }

    const whereClauses: string[] = [`project_id = '${projectId}'`];

    // Primary spatial filter: level_names takes precedence over z_range.
    // When level_names is set, use level IN (...) as the main discriminator.
    // z_range then acts as an optional sub-range refinement within that level.
    if (zone.level_names && zone.level_names.length > 0) {
      const escaped = zone.level_names
        .map(n => `'${n.replace(/'/g, "''")}'`)
        .join(', ');
      whereClauses.push(`level IN (${escaped})`);
      // Optional z_range refinement within the level (e.g. BLOCKED clash cluster)
      if (zone.z_range !== null) {
        whereClauses.push(`coord_z >= ${zone.z_range.min}`);
        whereClauses.push(`coord_z <= ${zone.z_range.max}`);
      }
    } else if (zone.z_range !== null) {
      // Coordinate-range-only fallback (legacy zones without level_names)
      whereClauses.push(`coord_z >= ${zone.z_range.min}`);
      whereClauses.push(`coord_z <= ${zone.z_range.max}`);
    } else {
      // No spatial filter — would match all cells in project, refuse
      log.warn(
        'CONTRACT_TAKT' as IntakeStageId,
        `Zone '${zone.zone_id}' has neither level_names nor z_range — skipping to avoid full-table update`,
      );
      return 0;
    }
    if (zone.x_range !== null) {
      whereClauses.push(`coord_x >= ${zone.x_range.min}`);
      whereClauses.push(`coord_x <= ${zone.x_range.max}`);
    }
    if (zone.y_range !== null) {
      whereClauses.push(`coord_y >= ${zone.y_range.min}`);
      whereClauses.push(`coord_y <= ${zone.y_range.max}`);
    }

    const sql = `UPDATE voxels SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

    try {
      const result = await db.$executeRawUnsafe(sql);
      return typeof result === 'number' ? result : 0;
    } catch (err) {
      log.error('CONTRACT_TAKT' as IntakeStageId, `SQL failed for zone '${zone.zone_id}'`, err);
      throw err;
    }
  }
}
