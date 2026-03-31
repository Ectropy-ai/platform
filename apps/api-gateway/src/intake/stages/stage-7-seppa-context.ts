/**
 * @fileoverview Stage7SeppaContextService — writes the project's
 * SEPPA context JSONB at the end of the intake pipeline.
 *
 * The seppa_context is read by the MCP server at session init and
 * injected into SEPPA's system prompt. SEPPA then knows:
 *   - Current takt week and zone status
 *   - Who holds each authority level (with contact info)
 *   - What is on the critical path
 *   - What pre-approval thresholds the contract allows
 *
 * Column: projects.seppa_context (JSONB, nullable)
 * Migration: 20260327000000_add_seppa_context_to_projects
 *
 * Idempotency: project.update() overwrites with same content every run.
 * idempotencyKey is hash of the full context object.
 *
 * @see apps/mcp-server/src/session/interfaces/seppa-context.interface.ts
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part VI
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

/**
 * SeppaContext shape — mirrors seppa-context.interface.ts without
 * cross-app import dependency. The canonical type lives in mcp-server.
 */
interface SeppaContextPayload {
  injected_at: string;
  bundle_version: string;
  project_name: string;
  project_type: string;
  contract_type: string;
  currency: string;
  takt: {
    current_week: number;
    cycle_weeks: number;
    active_zones: string[];
    blocked_zones: string[];
    upcoming_zones: string[];
    completed_zones: string[];
  };
  authority_cascade: Record<string, {
    role: string;
    name?: string;
    budget_cad: number | null;
    email?: string;
  }>;
  critical_path: {
    summary: string;
    blockers: string[];
    next_milestone: string;
  };
  pre_approval_thresholds: Record<string, Record<string, unknown>>;
}

interface DBAuthorityLevel {
  id: number;
  level: number;
  name: string;
  title: string;
  budget_limit: number | null;
}

interface DBDecision {
  decision_id: string;
  title: string;
}

export class Stage7SeppaContextService implements IIntakeStage {
  readonly stageId: IntakeStageId = 'SEPPA_CONTEXT';
  readonly stageName = 'SEPPA Context Injection';

  async execute(context: IntakeContext): Promise<StageResult> {
    const start = Date.now();
    const { bundle, db, log } = context;

    if (!context.projectId) {
      throw new IntakeStageError(
        this.stageId,
        'context.projectId must be set before Stage 7',
      );
    }

    log.info(this.stageId, `Building SEPPA context for project ${context.projectId}`);

    const db_ = db as any;

    try {
      // 1. Load authority levels (global model, Int PK)
      const authorityLevels = await this.loadAuthorityLevels(db_, log);

      // 2. Build authority cascade (L0-L6)
      const authorityCascade = this.buildAuthorityCascade(authorityLevels);

      // 3. Build takt context from taktZoneMap (Stage 5 output)
      const taktContext = this.buildTaktContext(context.taktZoneMap ?? {});

      // 4. Load critical path blockers (pMDecision confirmed f8d432b)
      const blockers = await this.loadCriticalPathBlockers(db_, context.projectId);

      // 5. Assemble the full SeppaContext
      const seppaContext: SeppaContextPayload = {
        injected_at: new Date().toISOString(),
        bundle_version: bundle.bundle_version,
        project_name: bundle.project.name,
        project_type: bundle.project.type,
        contract_type: bundle.project.contract_type ?? 'UNKNOWN',
        currency: bundle.project.currency,
        takt: taktContext,
        authority_cascade: authorityCascade,
        critical_path: {
          summary: blockers.length > 0
            ? `${blockers.length} open blocking decision(s) on critical path.`
            : 'No blocking decisions on critical path.',
          blockers: blockers.map(d => d.decision_id),
          next_milestone: taktContext.blocked_zones.length > 0
            ? `Clear blocked zone(s): ${taktContext.blocked_zones.join(', ')}`
            : 'No blocked zones — proceed per takt schedule.',
        },
        pre_approval_thresholds: {
          COORDINATION: { max_cost_cad: 75000, max_delay_days: 3 },
          SUBSTITUTION: { max_cost_cad: 25000, same_system_only: true },
          TOLERANCE: { max_variance_mm: 10, requires_inspector: false },
        },
      };

      // 6. Write to projects.seppa_context (JSONB)
      await db_.project.update({
        where: { id: context.projectId },
        data: { seppa_context: seppaContext },
      });

      const contextHash = createHash('sha256')
        .update(JSON.stringify(seppaContext))
        .digest('hex')
        .slice(0, 16);

      log.info(
        this.stageId,
        `SEPPA context written (hash=${contextHash}, blockers=${blockers.length})`,
      );

      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 1,
        durationMs: Date.now() - start,
        idempotencyKey: contextHash,
        warnings: authorityLevels.length < 7
          ? [`Only ${authorityLevels.length} authority levels found — expected 7`]
          : [],
      };
    } catch (err) {
      if (err instanceof IntakeStageError) throw err;
      log.error(this.stageId, 'SEPPA context injection failed', err);
      throw new IntakeStageError(this.stageId, 'SEPPA context injection failed', err);
    }
  }

  private async loadAuthorityLevels(
    db: any,
    log: IntakeContext['log'],
  ): Promise<DBAuthorityLevel[]> {
    try {
      return await db.authorityLevel.findMany({
        select: { id: true, level: true, name: true, title: true, budget_limit: true },
        orderBy: { level: 'asc' },
      });
    } catch {
      log.warn(this.stageId, 'Could not load authority levels — using empty cascade');
      return [];
    }
  }

  private buildAuthorityCascade(
    levels: DBAuthorityLevel[],
  ): Record<string, { role: string; budget_cad: number | null }> {
    const levelMap = new Map(levels.map(l => [l.level, l]));
    const cascade: Record<string, { role: string; budget_cad: number | null }> = {};
    for (let i = 0; i <= 6; i++) {
      const key = `L${i}`;
      const record = levelMap.get(i);
      cascade[key] = {
        role: record?.title ?? `L${i} Unknown`,
        budget_cad: record?.budget_limit ?? null,
      };
    }
    return cascade;
  }

  private buildTaktContext(taktZoneMap: TaktZoneMap): SeppaContextPayload['takt'] {
    const zones = Object.entries(taktZoneMap);

    const active = zones.filter(([, z]) => z.status === 'IN_PROGRESS').map(([id]) => id);
    const blocked = zones.filter(([, z]) => z.status === 'BLOCKED').map(([id]) => id);
    const completed = zones.filter(([, z]) => z.status === 'COMPLETE').map(([id]) => id);
    const upcoming = zones.filter(([, z]) => z.status === 'PLANNED').map(([id]) => id);

    const currentWeek = active.length > 0 ? 4 : completed.length > 0 ? 3 : 1;

    return {
      current_week: currentWeek,
      cycle_weeks: 2,
      active_zones: active,
      blocked_zones: blocked,
      upcoming_zones: upcoming,
      completed_zones: completed,
    };
  }

  private async loadCriticalPathBlockers(
    db: any,
    projectId: string,
  ): Promise<DBDecision[]> {
    try {
      return await db.pMDecision.findMany({
        where: {
          project_id: projectId,
          critical_path: true,
          status: 'PENDING',
        },
        select: { decision_id: true, title: true },
      });
    } catch {
      return [];
    }
  }
}
