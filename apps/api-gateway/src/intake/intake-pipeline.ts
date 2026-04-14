/**
 * @fileoverview IntakePipeline — orchestrates the 7-stage Project
 * Intake Pipeline from bundle load through SEPPA context injection.
 *
 * All 7 stages execute in sequence: TENANT → PROJECT → TEAM →
 * IFC_INGESTION → CONTRACT_TAKT → DECISIONS → SEPPA_CONTEXT.
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part I
 */

import { SpacesBundleLoader } from './spaces-bundle-loader';
import { SpacesClient, spacesConfigFromEnv } from './spaces-client';
import { ConsoleIntakeLogger } from './intake-logger';
import { Stage1TenantService } from './stages/stage-1-tenant';
import { Stage2ProjectService } from './stages/stage-2-project';
import { Stage3TeamService } from './stages/stage-3-team';
import { Stage4IFCService } from './stages/stage-4-ifc';
import { Stage5ContractTaktService } from './stages/stage-5-contract-takt';
import { Stage6DecisionService } from './stages/stage-6-decisions';
import { Stage7SeppaContextService } from './stages/stage-7-seppa-context';
import { IntakeStageError } from './interfaces/intake-stage.interface';
import type {
  IIntakeStage,
  IntakeContext,
  StageResult,
} from './interfaces/intake-stage.interface';
import type { IntakeStageId } from './interfaces/bundle.types';

export interface PipelineOptions {
  spacesClient?: SpacesClient;
  verbose?: boolean;
}

export interface PipelineStageOutcome {
  stageId: IntakeStageId;
  success: boolean;
  rowsAffected: number;
  durationMs: number;
  warnings: string[];
  skipped: boolean;
  skipReason?: string;
}

export interface PipelineResult {
  success: boolean;
  bundleId: string;
  bundleVersion: string;
  bundleType: string;
  tenantId?: string;
  projectId?: string;
  totalDurationMs: number;
  stages: PipelineStageOutcome[];
  failedStageId?: IntakeStageId;
  error?: string;
}

export class IntakePipeline {
  private readonly db: unknown;
  private readonly spacesClient?: SpacesClient;
  private readonly verbose: boolean;

  constructor(db: unknown, options?: PipelineOptions) {
    this.db = db;
    this.spacesClient = options?.spacesClient;
    this.verbose = options?.verbose ?? true;
  }

  async run(bundleId: string, bundleVersion: string): Promise<PipelineResult> {
    const pipelineStart = Date.now();
    const stages: PipelineStageOutcome[] = [];

    const spaces = this.spacesClient ?? new SpacesClient(spacesConfigFromEnv());
    const loader = new SpacesBundleLoader(spaces);

    let bundle;
    try {
      bundle = await loader.load(bundleId, bundleVersion);
    } catch (err) {
      return {
        success: false,
        bundleId,
        bundleVersion,
        bundleType: 'UNKNOWN',
        totalDurationMs: Date.now() - pipelineStart,
        stages,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const logger = new ConsoleIntakeLogger(bundleId, bundleVersion);
    const context: IntakeContext = {
      bundleId,
      bundleVersion,
      bundle,
      db: this.db,
      spaces,
      log: logger,
    };

    if (this.verbose) {
      logger.info('TENANT', `Pipeline starting — bundle=${bundleId}@${bundleVersion} type=${bundle.bundle_type}`);
    }

    const stageInstances: IIntakeStage[] = [
      new Stage1TenantService(),
      new Stage2ProjectService(),
      new Stage3TeamService(),
      new Stage4IFCService(),
      new Stage5ContractTaktService(),
      new Stage6DecisionService(),
      new Stage7SeppaContextService(),
    ];

    for (const stage of stageInstances) {
      const outcome = await this.runStage(stage, context);
      stages.push(outcome);

      if (!outcome.success && !outcome.skipped) {
        if (this.verbose) {
          logger.error(stage.stageId, `Pipeline aborted at stage ${stage.stageId}`);
        }
        return {
          success: false,
          bundleId,
          bundleVersion,
          bundleType: bundle.bundle_type,
          tenantId: context.tenantId,
          projectId: context.projectId,
          totalDurationMs: Date.now() - pipelineStart,
          stages,
          failedStageId: stage.stageId,
          error: `Stage ${stage.stageId} failed`,
        };
      }
    }

    if (this.verbose) {
      logger.info('SEPPA_CONTEXT', `Pipeline complete — project=${context.projectId} duration=${Date.now() - pipelineStart}ms`);
    }

    return {
      success: true,
      bundleId,
      bundleVersion,
      bundleType: bundle.bundle_type,
      tenantId: context.tenantId,
      projectId: context.projectId,
      totalDurationMs: Date.now() - pipelineStart,
      stages,
    };
  }

  private async runStage(stage: IIntakeStage, context: IntakeContext): Promise<PipelineStageOutcome> {
    try {
      const result: StageResult = await stage.execute(context);
      return {
        stageId: result.stageId,
        success: result.success,
        rowsAffected: result.rowsAffected,
        durationMs: result.durationMs,
        warnings: result.warnings,
        skipped: result.rowsAffected === 0 && result.idempotencyKey === 'skipped',
        skipReason: result.idempotencyKey === 'skipped' ? result.warnings[0] : undefined,
      };
    } catch (err) {
      return {
        stageId: stage.stageId,
        success: false,
        rowsAffected: 0,
        durationMs: 0,
        warnings: [err instanceof Error ? err.message : String(err)],
        skipped: false,
      };
    }
  }
}

/**
 * RefreshSeppaContext — runs Stage 7 in isolation against a live project.
 * Used by POST /api/admin/projects/:id/refresh-seppa-context.
 */
export async function refreshSeppaContext(
  projectId: string,
  db: unknown,
): Promise<{ success: boolean; idempotencyKey?: string; error?: string }> {
  const stage = new Stage7SeppaContextService();
  const logger = new ConsoleIntakeLogger(projectId, 'refresh');
  const db_ = db as any;

  // Build takt zone map from live voxel data
  let taktZoneMap: Record<string, { status: string; z_min: number; z_max: number }> = {};
  try {
    const rows = await db_.$queryRawUnsafe(`
      SELECT zone, status,
             MIN(coord_z) as z_min, MAX(coord_z) as z_max,
             MIN(coord_x) as x_min, MAX(coord_x) as x_max,
             MIN(coord_y) as y_min, MAX(coord_y) as y_max
      FROM voxels
      WHERE project_id = '${projectId}' AND zone IS NOT NULL
      GROUP BY zone, status
    `);
    for (const row of rows as any[]) {
      if (row.zone) {
        taktZoneMap[row.zone] = {
          status: row.status,
          z_min: Number(row.z_min),
          z_max: Number(row.z_max),
        };
      }
    }
  } catch { /* non-fatal */ }

  let projectRecord: any;
  try {
    projectRecord = await db_.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, tenant_id: true },
    });
  } catch {
    return { success: false, error: `Project ${projectId} not found` };
  }

  if (!projectRecord) {
    return { success: false, error: `Project ${projectId} not found` };
  }

  const minimalBundle = {
    bundle_id: 'refresh',
    bundle_version: 'live',
    bundle_type: 'PILOT' as const,
    schema_version: '1.0.0',
    created_at: new Date().toISOString(),
    created_by: 'system',
    tenant: { slug: '', name: '', region: '', tier: '', pipeda_compliant: false },
    project: { name: projectRecord.name ?? 'Unknown', type: 'UNKNOWN', currency: 'CAD' },
    ifc: null,
    staff_ref: null,
    contract_ref: null,
    takt_ref: null,
    decisions_ref: null,
    pipeline_flags: {
      voxelize: false, apply_takt: false, seed_decisions: false,
      inject_seppa_context: true, precompute_ai_analysis: false, assign_demo_user: false,
    },
    metadata: {},
  };

  const context = {
    bundleId: 'refresh',
    bundleVersion: 'live',
    bundle: minimalBundle,
    projectId,
    tenantId: projectRecord.tenant_id,
    taktZoneMap,
    db,
    spaces: {},
    log: logger,
  } as any;

  try {
    const result = await stage.execute(context);
    return { success: result.success, idempotencyKey: result.idempotencyKey };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
