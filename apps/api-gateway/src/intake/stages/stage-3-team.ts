/**
 * @fileoverview Stage3TeamService — seeds authority levels L0-L6
 * and creates staff user accounts with project roles.
 *
 * AuthorityLevel: Global model (unique on `level`, not per-project).
 *   Uses enum AuthorityLevelName. Requires `urn` field.
 *   Upsert on { level } (Int @unique).
 *
 * User: Unique on `email`. Has `full_name` (not `name`), `is_authorized`.
 *
 * ProjectRole: Unique on [user_id, project_id, role].
 *   `role` is StakeholderRole enum (owner, architect, contractor, etc.).
 *
 * Idempotency: all upserts. Running twice produces identical records.
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Stage 3
 */

import { createHash } from 'crypto';
import type { IIntakeStage, IntakeContext, StageResult } from '../interfaces/intake-stage.interface';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeStageId } from '../interfaces/bundle.types';

/** Authority level definition from staff.json */
interface AuthorityLevelDef {
  level: number;
  name: string;
  title: string;
  budget_limit: number | null;
  auto_approve: boolean;
  schedule_authority: string;
}

/** Staff member definition from staff.json */
interface StaffMemberDef {
  email: string;
  name: string;
  authority_level: number;
  role: string;
}

interface StaffJson {
  authority_levels: AuthorityLevelDef[];
  staff: StaffMemberDef[];
}

export class Stage3TeamService implements IIntakeStage {
  readonly stageId: IntakeStageId = 'TEAM';
  readonly stageName = 'Team and Authority Seeding';

  async execute(context: IntakeContext): Promise<StageResult> {
    const start = Date.now();
    const { bundle, db, spaces, log } = context;

    if (!context.projectId || !context.tenantId) {
      throw new IntakeStageError(
        this.stageId,
        'context.projectId and context.tenantId must be set before Stage 3',
      );
    }

    if (!bundle.staff_ref) {
      log.warn(this.stageId, 'No staff_ref in bundle — skipping team seeding');
      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 0,
        durationMs: Date.now() - start,
        idempotencyKey: 'no-staff',
        warnings: ['staff_ref is null — no team seeded'],
      };
    }

    log.info(this.stageId, `Loading staff from '${bundle.staff_ref}'`);

    let staffJson: StaffJson;
    try {
      const raw = await (spaces as any).getText(bundle.staff_ref);
      staffJson = JSON.parse(raw) as StaffJson;
    } catch (err) {
      throw new IntakeStageError(this.stageId, `Failed to load staff.json from '${bundle.staff_ref}'`, err);
    }

    const db_ = db as any;
    let rowsAffected = 0;
    const warnings: string[] = [];

    try {
      // 1. Seed authority levels (global, unique on `level`)
      for (const al of staffJson.authority_levels) {
        const urn = `urn:luhtech:ectropy:authority-level:pm-level-${al.level}`;
        await db_.authorityLevel.upsert({
          where: { level: al.level },
          create: {
            urn,
            level: al.level,
            name: al.name,       // Must match AuthorityLevelName enum
            title: al.title,
            budget_limit: al.budget_limit,
            auto_approve: al.auto_approve,
            schedule_authority: al.schedule_authority,
          },
          update: {
            title: al.title,
            budget_limit: al.budget_limit,
          },
        });
        rowsAffected++;
      }
      log.info(this.stageId, `${staffJson.authority_levels.length} authority levels seeded`);

      // 2. Seed staff users and project roles
      for (const member of staffJson.staff) {
        // Upsert user by email
        const user = await db_.user.upsert({
          where: { email: member.email },
          create: {
            email: member.email,
            full_name: member.name,
            is_authorized: true,
            tenant_id: context.tenantId,
          },
          update: {
            full_name: member.name,
            is_authorized: true,
          },
          select: { id: true },
        });
        rowsAffected++;

        // Map staff role string to StakeholderRole enum
        const stakeholderRole = this.mapToStakeholderRole(member.role);

        // ProjectRole unique on [user_id, project_id, role]
        await db_.projectRole.upsert({
          where: {
            user_id_project_id_role: {
              user_id: user.id,
              project_id: context.projectId,
              role: stakeholderRole,
            },
          },
          create: {
            user_id: user.id,
            project_id: context.projectId,
            role: stakeholderRole,
          },
          update: {},
        });
        rowsAffected++;
      }
      log.info(this.stageId, `${staffJson.staff.length} staff members seeded`);

    } catch (err) {
      log.error(this.stageId, 'Team seeding failed', err);
      throw new IntakeStageError(this.stageId, 'Team seeding failed', err);
    }

    const idempotencyKey = createHash('sha256')
      .update(`TEAM:${context.projectId}:${staffJson.authority_levels.length}:${staffJson.staff.length}`)
      .digest('hex')
      .slice(0, 16);

    return {
      stageId: this.stageId,
      success: true,
      rowsAffected,
      durationMs: Date.now() - start,
      idempotencyKey,
      warnings,
    };
  }

  /** Map free-form role string to StakeholderRole enum value. */
  private mapToStakeholderRole(role: string): string {
    const lower = role.toLowerCase();
    if (lower.includes('owner')) return 'owner';
    if (lower.includes('architect')) return 'architect';
    if (lower.includes('engineer')) return 'engineer';
    if (lower.includes('inspector')) return 'inspector';
    if (lower.includes('superintendent') || lower.includes('site_manager')) return 'site_manager';
    if (lower.includes('consultant')) return 'consultant';
    if (lower.includes('admin')) return 'admin';
    return 'contractor'; // default
  }
}
