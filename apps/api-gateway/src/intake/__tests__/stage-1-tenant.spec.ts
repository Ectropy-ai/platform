/**
 * @fileoverview Stage1TenantService contract tests.
 */

import { Stage1TenantService } from '../stages/stage-1-tenant';
import { MockIntakeLogger } from '../intake-logger';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeContext } from '../interfaces/intake-stage.interface';
import pilotBundle from '../fixtures/bundles/pilot-bundle.fixture.json';

function buildMockDb(tenantRecord = { id: 'tenant-uuid-001', slug: 'test-slug' }) {
  return {
    tenant: {
      upsert: vi.fn().mockResolvedValue(tenantRecord),
    },
  };
}

function buildContext(overrides?: Partial<IntakeContext>): IntakeContext {
  return {
    bundleId: pilotBundle.bundle_id,
    bundleVersion: pilotBundle.bundle_version,
    bundle: pilotBundle as any,
    db: buildMockDb(),
    spaces: {},
    log: new MockIntakeLogger(),
    ...overrides,
  };
}

describe('Stage1TenantService — contract tests', () => {
  let stage: Stage1TenantService;

  beforeEach(() => {
    stage = new Stage1TenantService();
  });

  it('stageId is TENANT', () => {
    expect(stage.stageId).toBe('TENANT');
  });

  it('creates a tenant record on first run', async () => {
    const ctx = buildContext();
    const result = await stage.execute(ctx);
    expect((ctx.db as any).tenant.upsert).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('sets context.tenantId after successful execution', async () => {
    const ctx = buildContext();
    await stage.execute(ctx);
    expect(ctx.tenantId).toBe('tenant-uuid-001');
  });

  it('returns rowsAffected=1', async () => {
    const ctx = buildContext();
    const result = await stage.execute(ctx);
    expect(result.rowsAffected).toBe(1);
  });

  it('returns identical idempotencyKey on second run with same tenant', async () => {
    const ctx1 = buildContext();
    const ctx2 = buildContext();
    const r1 = await stage.execute(ctx1);
    const r2 = await stage.execute(ctx2);
    expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
  });

  it('writes at least one log entry with stageId=TENANT', async () => {
    const logger = new MockIntakeLogger();
    const ctx = buildContext({ log: logger });
    await stage.execute(ctx);
    expect(logger.forStage('TENANT').length).toBeGreaterThanOrEqual(1);
  });

  it('throws IntakeStageError when db.tenant.upsert throws', async () => {
    const db = buildMockDb();
    db.tenant.upsert.mockRejectedValue(new Error('DB connection failed'));
    const ctx = buildContext({ db });
    await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
  });

  it('IntakeStageError.stageId is TENANT', async () => {
    const db = buildMockDb();
    db.tenant.upsert.mockRejectedValue(new Error('DB error'));
    const ctx = buildContext({ db });
    try {
      await stage.execute(ctx);
    } catch (err) {
      expect((err as IntakeStageError).stageId).toBe('TENANT');
    }
  });
});
