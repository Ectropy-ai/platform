/**
 * @fileoverview Stage3TeamService contract tests.
 */

import { Stage3TeamService } from '../stages/stage-3-team';
import { MockIntakeLogger } from '../intake-logger';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeContext } from '../interfaces/intake-stage.interface';
import pilotBundle from '../fixtures/bundles/pilot-bundle.fixture.json';

const STAFF_JSON = JSON.stringify({
  authority_levels: [
    { level: 0, name: 'FIELD', title: 'AI Auto-Resolve', budget_limit: 0, auto_approve: true, schedule_authority: '0' },
    { level: 3, name: 'SUPERINTENDENT', title: 'GC Superintendent', budget_limit: 100000, auto_approve: false, schedule_authority: '2 hours' },
  ],
  staff: [
    { email: 'james.okafor@gc.ca', name: 'James Okafor', authority_level: 3, role: 'SUPERINTENDENT' },
  ],
});

function buildMockSpaces(staffContent = STAFF_JSON) {
  return {
    getText: vi.fn().mockResolvedValue(staffContent),
  };
}

function buildMockDb() {
  return {
    authorityLevel: {
      upsert: vi.fn().mockResolvedValue({ id: 1 }),
    },
    user: {
      upsert: vi.fn().mockResolvedValue({ id: 'user-001' }),
    },
    projectRole: {
      upsert: vi.fn().mockResolvedValue({ id: 'role-001' }),
    },
  };
}

function buildContext(overrides?: Partial<IntakeContext>): IntakeContext {
  const bundle = {
    ...pilotBundle,
    staff_ref: 'project-bundles/inca-boardline-alberta/seed/staff.json',
  };
  return {
    bundleId: bundle.bundle_id,
    bundleVersion: bundle.bundle_version,
    bundle: bundle as any,
    tenantId: 'tenant-uuid-001',
    projectId: 'project-uuid-001',
    db: buildMockDb(),
    spaces: buildMockSpaces(),
    log: new MockIntakeLogger(),
    ...overrides,
  };
}

describe('Stage3TeamService — contract tests', () => {
  let stage: Stage3TeamService;

  beforeEach(() => {
    stage = new Stage3TeamService();
  });

  it('stageId is TEAM', () => {
    expect(stage.stageId).toBe('TEAM');
  });

  it('throws IntakeStageError when context.projectId is missing', async () => {
    const ctx = buildContext({ projectId: undefined });
    await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
  });

  it('returns success with rowsAffected=0 and warning when staff_ref is null', async () => {
    const bundle = { ...pilotBundle, staff_ref: null };
    const ctx = buildContext({ bundle: bundle as any });
    const result = await stage.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.rowsAffected).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('upserts authority levels from staff.json', async () => {
    const ctx = buildContext();
    await stage.execute(ctx);
    expect((ctx.db as any).authorityLevel.upsert).toHaveBeenCalledTimes(2);
  });

  it('upserts staff users from staff.json', async () => {
    const ctx = buildContext();
    await stage.execute(ctx);
    expect((ctx.db as any).user.upsert).toHaveBeenCalledTimes(1);
  });

  it('upserts project roles for each staff member', async () => {
    const ctx = buildContext();
    await stage.execute(ctx);
    expect((ctx.db as any).projectRole.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns identical idempotencyKey on two runs with same staff.json', async () => {
    const ctx1 = buildContext();
    const ctx2 = buildContext();
    const r1 = await stage.execute(ctx1);
    const r2 = await stage.execute(ctx2);
    expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
  });

  it('throws IntakeStageError when spaces.getText throws', async () => {
    const spaces = { getText: vi.fn().mockRejectedValue(new Error('Spaces error')) };
    const ctx = buildContext({ spaces });
    await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
  });

  it('throws IntakeStageError when db.authorityLevel.upsert throws', async () => {
    const db = buildMockDb();
    db.authorityLevel.upsert.mockRejectedValue(new Error('DB error'));
    const ctx = buildContext({ db });
    await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
  });

  it('writes log entries with stageId=TEAM', async () => {
    const logger = new MockIntakeLogger();
    const ctx = buildContext({ log: logger });
    await stage.execute(ctx);
    expect(logger.forStage('TEAM').length).toBeGreaterThanOrEqual(1);
  });
});
