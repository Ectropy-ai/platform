/**
 * @fileoverview Stage1TenantService — creates or returns the tenant
 * record for the project intake pipeline.
 *
 * Idempotency: upsert on tenant slug. Running twice with the same
 * bundle produces the same tenant record.
 *
 * Context mutation: sets context.tenantId on success.
 *
 * Prisma model: Tenant (table: tenants)
 * Unique key: slug
 * Fields used: slug, name, status (TenantStatus), subscription_tier (SubscriptionTier),
 *   data_region, compliance_flags[]
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Stage 1
 */

import { createHash } from 'crypto';
import type { IIntakeStage, IntakeContext, StageResult } from '../interfaces/intake-stage.interface';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeStageId } from '../interfaces/bundle.types';

/** Map bundle tier string to Prisma SubscriptionTier enum value. */
function mapTier(tier: string): string {
  const map: Record<string, string> = {
    DEMO: 'FREE',
    PILOT: 'BASIC',
    CI: 'FREE',
    FREE: 'FREE',
    BASIC: 'BASIC',
    PROFESSIONAL: 'PROFESSIONAL',
    ENTERPRISE: 'ENTERPRISE',
  };
  return map[tier] ?? 'FREE';
}

export class Stage1TenantService implements IIntakeStage {
  readonly stageId: IntakeStageId = 'TENANT';
  readonly stageName = 'Tenant Provisioning';

  async execute(context: IntakeContext): Promise<StageResult> {
    const start = Date.now();
    const { bundle, db, log } = context;
    const { tenant: t } = bundle;

    log.info(this.stageId, `Provisioning tenant slug='${t.slug}' region='${t.region}'`);

    try {
      const db_ = db as any;

      const complianceFlags = t.pipeda_compliant ? ['PIPEDA'] : [];

      // If the bundle specifies a canonical tenant ID, upsert against that
      // stable UUID rather than creating by slug. This is the idempotency
      // contract for all canonical demo bundles — the same tenant record
      // is always the target regardless of how many times the pipeline runs.
      const canonicalTenantId = (t as any).canonical_id as string | undefined;

      let record: { id: string; slug: string };
      if (canonicalTenantId) {
        record = await db_.tenant.upsert({
          where: { id: canonicalTenantId },
          create: {
            id: canonicalTenantId,
            slug: t.slug,
            name: t.name,
            status: 'ACTIVE',
            subscription_tier: mapTier(t.tier),
            data_region: t.region,
            compliance_flags: complianceFlags,
          },
          update: {
            name: t.name,
            data_region: t.region,
            compliance_flags: complianceFlags,
          },
          select: { id: true, slug: true },
        });
      } else {
        record = await db_.tenant.upsert({
          where: { slug: t.slug },
          create: {
            slug: t.slug,
            name: t.name,
            status: 'ACTIVE',
            subscription_tier: mapTier(t.tier),
            data_region: t.region,
            compliance_flags: complianceFlags,
          },
          update: {
            name: t.name,
            data_region: t.region,
            compliance_flags: complianceFlags,
          },
          select: { id: true, slug: true },
        });
      }

      context.tenantId = record.id as string;

      const idempotencyKey = createHash('sha256')
        .update(`TENANT:${record.id}`)
        .digest('hex')
        .slice(0, 16);

      log.info(this.stageId, `Tenant ready id=${record.id} (idempotencyKey=${idempotencyKey})`);

      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 1,
        durationMs: Date.now() - start,
        idempotencyKey,
        warnings: [],
      };
    } catch (err) {
      log.error(this.stageId, 'Tenant upsert failed', err);
      throw new IntakeStageError(this.stageId, 'Tenant upsert failed', err);
    }
  }
}
