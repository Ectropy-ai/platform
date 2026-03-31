/**
 * @fileoverview Stage7SeppaContextService contract tests.
 */

import { Stage7SeppaContextService } from '../stages/stage-7-seppa-context';
import { MockIntakeLogger } from '../intake-logger';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeContext } from '../interfaces/intake-stage.interface';
import demoBundle from '../fixtures/bundles/demo-bundle.fixture.json';
import pilotBundle from '../fixtures/bundles/pilot-bundle.fixture.json';

const AUTHORITY_LEVELS = [0, 1, 2, 3, 4, 5, 6].map(i => ({
  id: i + 1,
  level: i,
  name: ['FIELD', 'FOREMAN', 'SUPERINTENDENT', 'PM', 'ARCHITECT', 'OWNER', 'REGULATORY'][i],
  title: `Level ${i} Title`,
  budget_limit: i === 6 ? null : i * 10000,
}));

const TAKT_ZONE_MAP = {
  'Zone-A-L0': { status: 'COMPLETE', z_min: -0.1, z_max: 1.1 },
  'Zone-B-L1': { status: 'IN_PROGRESS', z_min: 1.1, z_max: 2.1 },
  'Zone-B-L1-Clash': {
    status: 'BLOCKED', z_min: 1.4, z_max: 1.9,
    x_min: 1.5, x_max: 3.5, y_min: -1.5, y_max: 1.5,
  },
  'Zone-C-L2': { status: 'PLANNED', z_min: 2.1, z_max: 3.2 },
};

function buildMockDb(
  authorityLevels = AUTHORITY_LEVELS,
  decisions: any[] = [{ decision_id: 'HVAC-B3-CLASH-001', title: 'HVAC Clash' }],
) {
  return {
    authorityLevel: {
      findMany: vi.fn().mockResolvedValue(authorityLevels),
    },
    pMDecision: {
      findMany: vi.fn().mockResolvedValue(decisions),
    },
    project: {
      update: vi.fn().mockResolvedValue({ id: 'project-uuid-001' }),
    },
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
    projectId: 'project-uuid-001',
    taktZoneMap: TAKT_ZONE_MAP,
    db: buildMockDb(),
    spaces: {},
    log: new MockIntakeLogger(),
    ...overrides,
  };
}

describe('Stage7SeppaContextService — contract tests', () => {
  let stage: Stage7SeppaContextService;

  beforeEach(() => {
    stage = new Stage7SeppaContextService();
  });

  describe('stageId', () => {
    it('stageId is SEPPA_CONTEXT', () => {
      expect(stage.stageId).toBe('SEPPA_CONTEXT');
    });
  });

  describe('execute() — prerequisite check', () => {
    it('throws IntakeStageError when context.projectId is missing', async () => {
      const ctx = buildContext(demoBundle, { projectId: undefined });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });
  });

  describe('execute() — context shape', () => {
    it('writes seppa_context to project record', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      expect((ctx.db as any).project.update).toHaveBeenCalledTimes(1);
      const call = (ctx.db as any).project.update.mock.calls[0][0];
      expect(call.data.seppa_context).toBeDefined();
    });

    it('authority_cascade contains all 7 keys L0-L6', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      for (let i = 0; i <= 6; i++) {
        expect(written.authority_cascade[`L${i}`]).toBeDefined();
      }
    });

    it('every authority level has a non-empty role string', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      for (let i = 0; i <= 6; i++) {
        expect(written.authority_cascade[`L${i}`].role).toBeTruthy();
      }
    });

    it('active_zones contains Zone-B-L1', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      expect(written.takt.active_zones).toContain('Zone-B-L1');
    });

    it('blocked_zones contains Zone-B-L1-Clash', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      expect(written.takt.blocked_zones).toContain('Zone-B-L1-Clash');
    });

    it('completed_zones contains Zone-A-L0', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      expect(written.takt.completed_zones).toContain('Zone-A-L0');
    });

    it('active_zones and completed_zones do not overlap', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      const overlap = written.takt.active_zones.filter((z: string) =>
        written.takt.completed_zones.includes(z),
      );
      expect(overlap).toHaveLength(0);
    });

    it('active_zones and blocked_zones do not overlap', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      const overlap = written.takt.active_zones.filter((z: string) =>
        written.takt.blocked_zones.includes(z),
      );
      expect(overlap).toHaveLength(0);
    });

    it('critical_path.blockers contains HVAC-B3-CLASH-001', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      expect(written.critical_path.blockers).toContain('HVAC-B3-CLASH-001');
    });

    it('pre_approval_thresholds.COORDINATION is present', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      expect(written.pre_approval_thresholds.COORDINATION).toBeDefined();
    });
  });

  describe('execute() — PILOT bundle', () => {
    it('empty zone arrays for PILOT bundle with no taktZoneMap', async () => {
      const ctx = buildContext(pilotBundle, { taktZoneMap: {} });
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      expect(written.takt.active_zones).toHaveLength(0);
      expect(written.takt.blocked_zones).toHaveLength(0);
    });

    it('authority_cascade still L0-L6 for PILOT bundle', async () => {
      const ctx = buildContext(pilotBundle, { taktZoneMap: {} });
      await stage.execute(ctx);
      const written = (ctx.db as any).project.update.mock.calls[0][0].data.seppa_context;
      expect(Object.keys(written.authority_cascade)).toHaveLength(7);
    });
  });

  describe('execute() — idempotency', () => {
    it('returns identical idempotencyKey on two runs with same taktZoneMap', async () => {
      const ctx1 = buildContext(demoBundle);
      const ctx2 = buildContext(demoBundle);
      const r1 = await stage.execute(ctx1);
      const r2 = await stage.execute(ctx2);
      expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
    });
  });

  describe('execute() — warnings', () => {
    it('warns when fewer than 7 authority levels found', async () => {
      const db = buildMockDb([AUTHORITY_LEVELS[0], AUTHORITY_LEVELS[3]]);
      const ctx = buildContext(demoBundle, { db });
      const result = await stage.execute(ctx);
      expect(result.warnings.some(w => w.includes('authority levels'))).toBe(true);
    });
  });

  describe('execute() — DB failure', () => {
    it('throws IntakeStageError when project.update throws', async () => {
      const db = buildMockDb();
      db.project.update.mockRejectedValue(new Error('DB error'));
      const ctx = buildContext(demoBundle, { db });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });
  });
});
