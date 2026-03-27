/**
 * @fileoverview Stage5ContractTaktService contract tests.
 * Uses mock DB ($executeRawUnsafe) and mock Spaces.
 *
 * @see apps/api-gateway/src/intake/stages/stage-5-contract-takt.ts
 */

import { Stage5ContractTaktService } from '../stages/stage-5-contract-takt';
import { MockIntakeLogger } from '../intake-logger';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeContext } from '../interfaces/intake-stage.interface';
import demoBundle from '../fixtures/bundles/demo-bundle.fixture.json';
import pilotBundle from '../fixtures/bundles/pilot-bundle.fixture.json';
import taktFixture from '../fixtures/takt/takt-simple.fixture.json';

function buildMockDb(rowsPerUpdate = 10) {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(rowsPerUpdate),
  };
}

function buildMockSpaces(taktContent = JSON.stringify(taktFixture)) {
  return {
    getText: vi.fn().mockResolvedValue(taktContent),
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
    db: buildMockDb(),
    spaces: buildMockSpaces(),
    log: new MockIntakeLogger(),
    ...overrides,
  };
}

describe('Stage5ContractTaktService — contract tests', () => {
  let stage: Stage5ContractTaktService;

  beforeEach(() => {
    stage = new Stage5ContractTaktService();
  });

  describe('stageId', () => {
    it('stageId is CONTRACT_TAKT', () => {
      expect(stage.stageId).toBe('CONTRACT_TAKT');
    });
  });

  describe('execute() — flag guard', () => {
    it('skips all DB writes and returns success when apply_takt=false', async () => {
      const ctx = buildContext(pilotBundle);
      const result = await stage.execute(ctx);
      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(0);
      expect((ctx.db as any).$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('returns a warning when apply_takt=false', async () => {
      const ctx = buildContext(pilotBundle);
      const result = await stage.execute(ctx);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('execute() — prerequisite checks', () => {
    it('throws IntakeStageError when context.projectId is missing', async () => {
      const ctx = buildContext(demoBundle, { projectId: undefined });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });

    it('throws IntakeStageError when takt_ref is null and apply_takt=true', async () => {
      const bundle = { ...demoBundle, takt_ref: null };
      const ctx = buildContext(bundle);
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });

    it('throws IntakeStageError when spaces.getText throws', async () => {
      const spaces = { getText: vi.fn().mockRejectedValue(new Error('Spaces error')) };
      const ctx = buildContext(demoBundle, { spaces });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });

    it('throws IntakeStageError when takt schedule has no zones', async () => {
      const emptySchedule = { takt_cycle_weeks: 2, zones: [] };
      const spaces = buildMockSpaces(JSON.stringify(emptySchedule));
      const ctx = buildContext(demoBundle, { spaces });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });
  });

  describe('execute() — zone application', () => {
    it('calls $executeRawUnsafe once per zone', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      expect((ctx.db as any).$executeRawUnsafe).toHaveBeenCalledTimes(4);
    });

    it('Zone-A-L0 SQL contains status=COMPLETE and z bounds', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const calls = (ctx.db as any).$executeRawUnsafe.mock.calls as string[][];
      const zoneACall = calls.find(args =>
        typeof args[0] === 'string' &&
        args[0].includes('COMPLETE') &&
        args[0].includes('-0.1'),
      );
      expect(zoneACall).toBeDefined();
    });

    it('Clash zone SQL contains x and y bounds (most specific zone)', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const calls = (ctx.db as any).$executeRawUnsafe.mock.calls as string[][];
      const clashCall = calls.find(args =>
        typeof args[0] === 'string' &&
        args[0].includes('BLOCKED') &&
        args[0].includes('1.5') &&
        args[0].includes('-1.5'),
      );
      expect(clashCall).toBeDefined();
    });

    it('broad zones (z-only) are called before specific zones (x+y+z)', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      const calls = (ctx.db as any).$executeRawUnsafe.mock.calls as string[][];
      const zoneAIndex = calls.findIndex(args =>
        typeof args[0] === 'string' && args[0].includes('Zone-A-L0'),
      );
      const clashIndex = calls.findIndex(args =>
        typeof args[0] === 'string' && args[0].includes('Zone-B-L1-Clash'),
      );
      expect(zoneAIndex).toBeGreaterThanOrEqual(0);
      expect(clashIndex).toBeGreaterThanOrEqual(0);
      expect(clashIndex).toBeGreaterThan(zoneAIndex);
    });

    it('sets context.taktZoneMap after execution', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      expect(ctx.taktZoneMap).toBeDefined();
      expect(Object.keys(ctx.taktZoneMap!)).toContain('Zone-A-L0');
      expect(Object.keys(ctx.taktZoneMap!)).toContain('Zone-B-L1-Clash');
    });

    it('taktZoneMap entry for BLOCKED zone has correct status', async () => {
      const ctx = buildContext(demoBundle);
      await stage.execute(ctx);
      expect(ctx.taktZoneMap!['Zone-B-L1-Clash'].status).toBe('BLOCKED');
    });
  });

  describe('execute() — idempotency', () => {
    it('returns the same idempotencyKey on two runs with same schedule', async () => {
      const ctx1 = buildContext(demoBundle);
      const ctx2 = buildContext(demoBundle);
      const r1 = await stage.execute(ctx1);
      const r2 = await stage.execute(ctx2);
      expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
    });

    it('idempotencyKey differs when zone statuses differ', async () => {
      const modified = JSON.parse(JSON.stringify(taktFixture));
      modified.zones[0].status = 'IN_PROGRESS';
      const spaces1 = buildMockSpaces(JSON.stringify(taktFixture));
      const spaces2 = buildMockSpaces(JSON.stringify(modified));
      const ctx1 = buildContext(demoBundle, { spaces: spaces1 });
      const ctx2 = buildContext(demoBundle, { spaces: spaces2 });
      const r1 = await stage.execute(ctx1);
      const r2 = await stage.execute(ctx2);
      expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
    });
  });

  describe('execute() — zero-match warning', () => {
    it('adds a warning when a zone matches 0 BOX cells', async () => {
      const db = buildMockDb(0);
      const ctx = buildContext(demoBundle, { db });
      const result = await stage.execute(ctx);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('0 BOX cells');
    });
  });

  describe('execute() — DB failure', () => {
    it('throws IntakeStageError when $executeRawUnsafe throws', async () => {
      const db = { $executeRawUnsafe: vi.fn().mockRejectedValue(new Error('SQL error')) };
      const ctx = buildContext(demoBundle, { db });
      await expect(stage.execute(ctx)).rejects.toBeInstanceOf(IntakeStageError);
    });
  });

  describe('zoneSpecificity sorting', () => {
    it('zone with x+y+z bounds sorts after zone with z-only bounds', async () => {
      const { sortZonesBySpecificity } = await import('../stages/takt-schedule.types');
      const zones = [
        {
          zone_id: 'specific',
          status: 'BLOCKED' as const,
          z_range: { min: 1.4, max: 1.9 },
          x_range: { min: 1.5, max: 3.5 },
          y_range: { min: -1.5, max: 1.5 },
          name: '', takt_week: 1, percent_complete: 0,
        },
        {
          zone_id: 'broad',
          status: 'IN_PROGRESS' as const,
          z_range: { min: 1.1, max: 2.1 },
          x_range: null,
          y_range: null,
          name: '', takt_week: 1, percent_complete: 50,
        },
      ];
      const sorted = sortZonesBySpecificity(zones as any);
      expect(sorted[0].zone_id).toBe('broad');
      expect(sorted[1].zone_id).toBe('specific');
    });
  });
});
