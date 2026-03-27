/**
 * @fileoverview Stage6DecisionService — seeds pm_decisions rows with
 * pre-computed SEPPA analysis, linking each decision to its BOX cell
 * via a coordinate proximity query.
 *
 * Prisma model: PMDecision (client: db.pMDecision)
 * Table: pm_decisions (@@map("pm_decisions"))
 * Unique: @@unique([project_id, decision_id])
 * Type enum: PMDecisionType (APPROVAL, REJECTION, DEFERRAL, ESCALATION, PROPOSAL, CONSEQUENCE)
 * Status enum: PMDecisionStatus (PENDING, APPROVED, REJECTED, SUPERSEDED, EXPIRED)
 *
 * Idempotency: upsert on (project_id, decision_id).
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part V
 */

import { createHash } from 'crypto';
import type {
  IIntakeStage,
  IntakeContext,
  StageResult,
} from '../interfaces/intake-stage.interface';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeStageId } from '../interfaces/bundle.types';
import type { DecisionDef, DecisionSeedFile } from './decision-seed.types';

/**
 * Map decision type strings from decisions.json to PMDecisionType enum.
 * The fixture uses "COORDINATION" but the enum has PROPOSAL.
 */
function mapDecisionType(type: string): string {
  const map: Record<string, string> = {
    COORDINATION: 'PROPOSAL',
    COORDINATION_CONFLICT: 'PROPOSAL',
    INSPECTION_HOLD: 'APPROVAL',
    TOLERANCE_OVERRIDE: 'APPROVAL',
    APPROVAL: 'APPROVAL',
    REJECTION: 'REJECTION',
    DEFERRAL: 'DEFERRAL',
    ESCALATION: 'ESCALATION',
    PROPOSAL: 'PROPOSAL',
    CONSEQUENCE: 'CONSEQUENCE',
  };
  return map[type] ?? 'PROPOSAL';
}

/**
 * Map decision status strings from decisions.json to PMDecisionStatus enum.
 */
function mapDecisionStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'PENDING',
    OPEN: 'PENDING',
    BLOCKED: 'PENDING',
    APPROVED: 'APPROVED',
    RESOLVED: 'APPROVED',
    REJECTED: 'REJECTED',
    SUPERSEDED: 'SUPERSEDED',
    EXPIRED: 'EXPIRED',
  };
  return map[status] ?? 'PENDING';
}

export class Stage6DecisionService implements IIntakeStage {
  readonly stageId: IntakeStageId = 'DECISIONS';
  readonly stageName = 'Decision Seeding';

  async execute(context: IntakeContext): Promise<StageResult> {
    const start = Date.now();
    const { bundle, db, spaces, log } = context;

    if (!bundle.pipeline_flags.seed_decisions) {
      log.info(this.stageId, 'seed_decisions=false — skipping decision seeding');
      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 0,
        durationMs: Date.now() - start,
        idempotencyKey: 'skipped',
        warnings: ['seed_decisions=false — no decisions seeded'],
      };
    }

    if (!context.projectId) {
      throw new IntakeStageError(
        this.stageId,
        'context.projectId must be set before Stage 6',
      );
    }

    if (!bundle.decisions_ref) {
      throw new IntakeStageError(
        this.stageId,
        'bundle.decisions_ref is required when seed_decisions=true',
      );
    }

    log.info(this.stageId, `Loading decisions from '${bundle.decisions_ref}'`);
    let seedFile: DecisionSeedFile;
    try {
      const raw = await (spaces as any).getText(bundle.decisions_ref);
      seedFile = JSON.parse(raw) as DecisionSeedFile;
    } catch (err) {
      throw new IntakeStageError(
        this.stageId,
        `Failed to load decisions from '${bundle.decisions_ref}'`,
        err,
      );
    }

    if (!seedFile.decisions || seedFile.decisions.length === 0) {
      log.warn(this.stageId, 'decisions.json has no decisions — nothing to seed');
      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 0,
        durationMs: Date.now() - start,
        idempotencyKey: 'empty',
        warnings: ['decisions.json has no decisions'],
      };
    }

    const db_ = db as any;
    let rowsAffected = 0;
    const warnings: string[] = [];
    const seededRefs: string[] = [];

    try {
      for (const def of seedFile.decisions) {
        const result = await this.seedDecision(db_, context.projectId, def, log, warnings);
        if (result) {
          rowsAffected++;
          seededRefs.push(def.decision_ref);
        }
      }
    } catch (err) {
      if (err instanceof IntakeStageError) throw err;
      log.error(this.stageId, 'Decision seeding failed', err);
      throw new IntakeStageError(this.stageId, 'Decision seeding failed', err);
    }

    const idempotencyKey = createHash('sha256')
      .update(`DECISIONS:${context.projectId}:${seededRefs.sort().join('|')}`)
      .digest('hex')
      .slice(0, 16);

    log.info(this.stageId, `${rowsAffected} decisions seeded`);

    return {
      stageId: this.stageId,
      success: true,
      rowsAffected,
      durationMs: Date.now() - start,
      idempotencyKey,
      warnings,
    };
  }

  private async seedDecision(
    db: any,
    projectId: string,
    def: DecisionDef,
    log: IntakeContext['log'],
    warnings: string[],
  ): Promise<boolean> {
    // Step 1: Find closest BOX cell
    const voxelRow = await this.findClosestVoxel(db, projectId, def, warnings);
    if (!voxelRow) return false;

    // Step 2: Construct primary_voxel_urn
    const primaryVoxelUrn = `urn:ectropy:${projectId}:voxel:${voxelRow.voxel_id}`;

    // Step 3: Resolve authority_level_id (Int? FK to AuthorityLevel.id which is Int @id)
    let authorityLevelId: number | null = null;
    try {
      const al = await db.authorityLevel.findUnique({
        where: { level: def.authority_required },
        select: { id: true },
      });
      authorityLevelId = al?.id ?? null;
      if (authorityLevelId === null) {
        warnings.push(
          `Authority level ${def.authority_required} not found — decision '${def.decision_ref}' seeded without authority_level_id`,
        );
      }
    } catch {
      warnings.push(`Could not resolve authority level for '${def.decision_ref}'`);
    }

    // Step 4: Decision URN
    const decisionUrn = `urn:ectropy:${projectId}:decision:${def.decision_ref}`;

    // Step 5: Upsert pm_decisions
    // Prisma model: PMDecision → client: db.pMDecision
    // Unique: @@unique([project_id, decision_id])
    await db.pMDecision.upsert({
      where: {
        project_id_decision_id: {
          project_id: projectId,
          decision_id: def.decision_ref,
        },
      },
      create: {
        urn: decisionUrn,
        project_id: projectId,
        decision_id: def.decision_ref,
        title: def.title,
        description: def.description ?? null,
        type: mapDecisionType(def.type),
        status: mapDecisionStatus(def.status),
        authority_required: def.authority_required,
        authority_current: def.authority_required, // set equal initially
        ...(authorityLevelId !== null ? { authority_level_id: authorityLevelId } : {}),
        primary_voxel_urn: primaryVoxelUrn,
        question: def.question,
        ai_analysis: def.ai_analysis,
        budget_estimated: def.budget_estimated ?? null,
        delay_days: def.delay_days ?? null,
        critical_path: def.critical_path ?? false,
        look_ahead_week: def.look_ahead_week ?? null,
      },
      update: {
        ai_analysis: def.ai_analysis,
        primary_voxel_urn: primaryVoxelUrn,
        title: def.title,
      },
    });

    log.info(
      'DECISIONS' as IntakeStageId,
      `Decision '${def.decision_ref}' → voxel '${voxelRow.voxel_id}' (urn: ${primaryVoxelUrn})`,
    );
    return true;
  }

  /**
   * Find the BOX cell closest to the clash centroid using Manhattan distance.
   * Table: voxels (confirmed a46bdb2)
   */
  private async findClosestVoxel(
    db: any,
    projectId: string,
    def: DecisionDef,
    warnings: string[],
  ): Promise<{ id: string; voxel_id: string } | null> {
    const { clash_location: loc } = def;

    const sql = `
      SELECT id, voxel_id
      FROM voxels
      WHERE project_id = '${projectId}'
        AND coord_x >= ${loc.x_min} AND coord_x <= ${loc.x_max}
        AND coord_y >= ${loc.y_min} AND coord_y <= ${loc.y_max}
        AND coord_z >= ${loc.z_min} AND coord_z <= ${loc.z_max}
      ORDER BY
        ABS(coord_x - ${loc.centroid_x}) +
        ABS(coord_y - ${loc.centroid_y}) +
        ABS(coord_z - ${loc.centroid_z})
      LIMIT 1
    `;

    const rows = await db.$queryRawUnsafe(sql) as Array<{
      id: string;
      voxel_id: string;
    }>;

    if (!rows || rows.length === 0) {
      warnings.push(
        `Decision '${def.decision_ref}': no BOX cell found within clash bounds ` +
        `x[${loc.x_min}–${loc.x_max}] y[${loc.y_min}–${loc.y_max}] ` +
        `z[${loc.z_min}–${loc.z_max}]`,
      );
      return null;
    }

    return rows[0];
  }
}
