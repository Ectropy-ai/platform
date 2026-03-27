/**
 * @fileoverview Stage2ProjectService contract tests.
 */

import { Stage2ProjectService } from '../stages/stage-2-project';
import { MockIntakeLogger } from '../intake-logger';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeContext } from '../interfaces/intake-stage.interface';
import demoBundle from '../fixtures/bundles/demo-bundle.fixture.json';
import pilotBundle from '../fixtures/bundles/pilot-bundle.fixture.json';

function buildMockDb(
  projectRecord = { id: 'project-uuid-001' },
) {
  return {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: 'owner-uuid-001' }),
    },
    project: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(projectRecord),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

function buildContext(
  bundle: any,
  overrides?: Partial<IntakeContext>,
): IntakeContext {
  return {
    bundleId: bundle.bundle_id,
    bundleVersion: bundle.bundle_version,
    bundle,
    tenantId: 'tenant-uuid-001',
    db: buildMockDb(),
    spaces: {},
    log: new MockIntakeLogger(),
    ...overrides,
  };
}

describe('Stage2ProjectService — contract tests', () => {
  let stage: Stage2ProjectService;

  beforeEach(() => {
    stage = new Stage2ProjectService();
  });

  it('stageId is PROJECT', () => {
    expect(stage.stageId).toBe('PROJECT');
  });

  it('sets context.projectId after successful execution', async () => {
    const ctx = buildContext(pilotBundle);
    await stage.execute(ctx);
    expect(ctx.projectId).toBe('project-uuid-001');
  });

  it('throws IntakeStageError when context.tenantId is missing', async () => {
    const ctx = buildContext(pilotBundle, { tenantId: undefined });
    await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
  });

  it('creates voxel_grid via raw SQL when pipeline_flags.voxelize is true (DEMO bundle)', async () => {
    const db = buildMockDb();
    // First $queryRaw: SELECT existing grid → empty
    // Second $queryRaw: INSERT grid → returns new id
    db.$queryRaw
      .mockResolvedValueOnce([])  // SELECT voxel_grids
      .mockResolvedValueOnce([{ id: 'grid-uuid-001' }]);  // INSERT RETURNING
    const ctx = buildContext(demoBundle, { db });
    await stage.execute(ctx);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(ctx.voxelGridId).toBe('grid-uuid-001');
  });

  it('does NOT create voxel_grid when pipeline_flags.voxelize is false (PILOT bundle)', async () => {
    const db = buildMockDb();
    const ctx = buildContext(pilotBundle, { db });
    await stage.execute(ctx);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(ctx.voxelGridId).toBeUndefined();
  });

  it('reuses existing voxel_grid when one already exists', async () => {
    const db = buildMockDb();
    db.$queryRaw.mockResolvedValueOnce([{ id: 'existing-grid' }]);
    const ctx = buildContext(demoBundle, { db });
    await stage.execute(ctx);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1); // only SELECT, no INSERT
    expect(ctx.voxelGridId).toBe('existing-grid');
  });

  it('returns identical idempotencyKey on two runs with same project', async () => {
    const ctx1 = buildContext(pilotBundle);
    const ctx2 = buildContext(pilotBundle);
    const r1 = await stage.execute(ctx1);
    const r2 = await stage.execute(ctx2);
    expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
  });

  it('throws IntakeStageError when db.project.create throws', async () => {
    const db = buildMockDb();
    db.project.create.mockRejectedValue(new Error('DB error'));
    const ctx = buildContext(pilotBundle, { db });
    await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
  });
});
