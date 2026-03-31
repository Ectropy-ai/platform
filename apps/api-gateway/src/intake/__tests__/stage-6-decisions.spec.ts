/**
 * @fileoverview Stage6DecisionService contract tests.
 * Uses mock DB ($queryRawUnsafe + pMDecision.upsert) and mock Spaces.
 *
 * @see apps/api-gateway/src/intake/stages/stage-6-decisions.ts
 */

import { Stage6DecisionService } from '../stages/stage-6-decisions';
import { MockIntakeLogger } from '../intake-logger';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeContext } from '../interfaces/intake-stage.interface';
import demoBundle from '../fixtures/bundles/demo-bundle.fixture.json';
import pilotBundle from '../fixtures/bundles/pilot-bundle.fixture.json';
import decisionsFixture from '../fixtures/decisions/decisions.fixture.json';

const VOXEL_ROW = { id: 'voxel-uuid-001', voxel_id: 'VOX-L1-HVAC-042' };

function buildMockDb(voxelRows = [VOXEL_ROW]) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(voxelRows),
    authorityLevel: {
      findUnique: vi.fn().mockResolvedValue({ id: 3 }),
    },
    pMDecision: {
      upsert: vi.fn().mockResolvedValue({ id: 'decision-uuid-001' }),
    },
  };
}

function buildMockSpaces(content = JSON.stringify(decisionsFixture)) {
  return { getText: vi.fn().mockResolvedValue(content) };
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
    db: buildMockDb(),
    spaces: buildMockSpaces(),
    log: new MockIntakeLogger(),
    ...overrides,
  };
}

describe('Stage6DecisionService — contract tests', () => {
  let stage: Stage6DecisionService;

  beforeEach(() => {
    stage = new Stage6DecisionService();
  });

  describe('stageId', () => {
    it('stageId is DECISIONS', () => {
      expect(stage.stageId).toBe('DECISIONS');
    });
  });

  describe('execute() — flag guard', () => {
    it('skips when seed_decisions=false', async () => {
      const ctx = buildContext(pilotBundle);
      const result = await stage.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(0);
      expect((ctx.db as any).$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('execute() — prerequisite checks', () => {
    it('throws IntakeStageError when context.projectId is missing', async () => {
      const ctx = buildContext(demoBundle, { projectId: undefined });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });

    it('throws IntakeStageError when decisions_ref is null and seed_decisions=true', async () => {
      const bundle = { ...demoBundle, decisions_ref: null };
      const ctx = buildContext(bundle);
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });

    it('throws IntakeStageError when spaces.getText throws', async () => {
      const spaces = { getText: vi.fn().mockRejectedValue(new Error('Spaces error')) };
      const ctx = buildContext(demoBundle, { spaces });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });
  });

  describe('execute() — BOX cell resolution', () => {
    it('calls $queryRawUnsafe to find the closest voxel', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      expect((ctx.db as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('proximity SQL contains clash coordinate bounds and ORDER BY ABS', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const sql = (ctx.db as any).$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('coord_x');
      expect(sql).toContain('coord_z');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('ABS');
    });

    it('adds a warning and skips decision when no voxel is found in bounds', async () => {
      const db = buildMockDb([]);
      const ctx = buildContext(demoBundle, { db });
      const result = await stage.execute(ctx);
      expect(result.rowsAffected).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('no BOX cell found');
    });

    it('selects the closest cell when multiple cells are in range', async () => {
      const db = buildMockDb([VOXEL_ROW]);
      const ctx = buildContext(demoBundle, { db });
      await stage.execute(ctx);
      expect(db.pMDecision.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute() — decision upsert', () => {
    it('upserts pMDecision with primary_voxel_urn', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const call = (ctx.db as any).pMDecision.upsert.mock.calls[0][0];
      expect(call.create.primary_voxel_urn).toContain('VOX-L1-HVAC-042');
    });

    it('primary_voxel_urn follows pattern urn:ectropy:{projectId}:voxel:{voxelId}', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const call = (ctx.db as any).pMDecision.upsert.mock.calls[0][0];
      const urn: string = call.create.primary_voxel_urn;
      expect(urn).toMatch(/^urn:ectropy:[^:]+:voxel:VOX-/);
    });

    it('uses composite unique where (project_id_decision_id)', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const call = (ctx.db as any).pMDecision.upsert.mock.calls[0][0];
      expect(call.where.project_id_decision_id).toBeDefined();
      expect(call.where.project_id_decision_id.project_id).toBe('project-uuid-001');
    });

    it('ai_analysis is set from decisions.json — not computed live', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const call = (ctx.db as any).pMDecision.upsert.mock.calls[0][0];
      expect(call.create.ai_analysis).toBeDefined();
      expect(call.create.ai_analysis.situation).toContain('HVAC');
    });

    it('does not call Anthropic API during decision seeding', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const anthropicCalls = fetchSpy.mock.calls.filter(
        args => String(args[0]).includes('anthropic.com'),
      );
      expect(anthropicCalls).toHaveLength(0);
      fetchSpy.mockRestore();
    });

    it('second run upserts without creating a duplicate (idempotent)', async () => {
      const ctx1 = buildContext(demoBundle);
      const ctx2 = buildContext(demoBundle);
      await stage.execute(ctx1);
      await stage.execute(ctx2);
      expect((ctx1.db as any).pMDecision.upsert).toHaveBeenCalledTimes(1);
      expect((ctx2.db as any).pMDecision.upsert).toHaveBeenCalledTimes(1);
    });

    it('returns identical idempotencyKey on two runs with same decisions', async () => {
      const ctx1 = buildContext(demoBundle);
      const ctx2 = buildContext(demoBundle);
      const r1 = await stage.execute(ctx1);
      const r2 = await stage.execute(ctx2);
      expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
    });

    it('maps COORDINATION type to PROPOSAL enum value', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const call = (ctx.db as any).pMDecision.upsert.mock.calls[0][0];
      expect(call.create.type).toBe('PROPOSAL');
    });

    it('sets authority_current equal to authority_required', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const call = (ctx.db as any).pMDecision.upsert.mock.calls[0][0];
      expect(call.create.authority_current).toBe(call.create.authority_required);
    });
  });

  describe('execute() — authority level resolution', () => {
    it('adds a warning when authority level is not found', async () => {
      const db = buildMockDb();
      db.authorityLevel.findUnique.mockResolvedValue(null);
      const ctx = buildContext(demoBundle, { db });
      const result = await stage.execute(ctx);
      expect(result.warnings.some(w => w.includes('Authority level'))).toBe(true);
    });
  });

  describe('execute() — DB failure', () => {
    it('throws IntakeStageError when $queryRawUnsafe throws', async () => {
      const db = buildMockDb();
      db.$queryRawUnsafe.mockRejectedValue(new Error('SQL error'));
      const ctx = buildContext(demoBundle, { db });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });

    it('throws IntakeStageError when pMDecision.upsert throws', async () => {
      const db = buildMockDb();
      db.pMDecision.upsert.mockRejectedValue(new Error('upsert failed'));
      const ctx = buildContext(demoBundle, { db });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });
  });
});
