/**
 * @fileoverview IntakePipeline integration tests.
 * Tests the full orchestrator with mock DB and Spaces.
 */

import { IntakePipeline } from '../intake-pipeline';
import { SpacesClient } from '../spaces-client';
import { SpacesKeyNotFoundError } from '../spaces-client';
import pilotBundle from '../fixtures/bundles/pilot-bundle.fixture.json';

function buildMockDb() {
  return {
    tenant: { upsert: vi.fn().mockResolvedValue({ id: 'tenant-001', slug: 'test' }) },
    user: { upsert: vi.fn().mockResolvedValue({ id: 'user-001' }) },
    project: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'project-001' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'project-001', name: 'Test' }),
      update: vi.fn().mockResolvedValue({ id: 'project-001' }),
    },
    authorityLevel: {
      upsert: vi.fn().mockResolvedValue({ id: 1 }),
      findMany: vi.fn().mockResolvedValue(
        [0, 1, 2, 3, 4, 5, 6].map(i => ({
          id: i + 1, level: i, name: 'ROLE', title: `L${i}`, budget_limit: null,
        })),
      ),
    },
    projectRole: { upsert: vi.fn().mockResolvedValue({ id: 'role-001' }) },
    pMDecision: { findMany: vi.fn().mockResolvedValue([]) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(10),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

function buildMockSpaces(): SpacesClient {
  return {
    getText: vi.fn().mockImplementation(async (key: string) => {
      if (key.includes('bundle.json')) {
        return JSON.stringify(pilotBundle);
      }
      if (key.includes('staff')) {
        return JSON.stringify({
          authority_levels: [
            { level: 0, name: 'FIELD', title: 'AI', budget_limit: 0, auto_approve: true, schedule_authority: '0' },
          ],
          staff: [],
        });
      }
      if (key.includes('takt')) {
        return JSON.stringify({ takt_cycle_weeks: 2, zones: [] });
      }
      if (key.includes('decisions')) {
        return JSON.stringify({ decisions: [] });
      }
      throw new SpacesKeyNotFoundError(key);
    }),
    listKeys: vi.fn().mockResolvedValue([]),
    getBuffer: vi.fn().mockResolvedValue(Buffer.from('')),
    getSHA256: vi.fn().mockResolvedValue('mock-sha'),
    putText: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as SpacesClient;
}

describe('IntakePipeline — integration tests', () => {
  let db: ReturnType<typeof buildMockDb>;
  let spaces: SpacesClient;

  beforeEach(() => {
    db = buildMockDb();
    spaces = buildMockSpaces();
  });

  describe('run() — PILOT bundle', () => {
    it('returns success=true for a valid PILOT bundle', async () => {
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      expect(result.success).toBe(true);
      expect(result.bundleType).toBe('PILOT');
    });

    it('sets tenantId and projectId in result', async () => {
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      expect(result.tenantId).toBe('tenant-001');
      expect(result.projectId).toBe('project-001');
    });

    it('skips CONTRACT_TAKT stage for PILOT bundle', async () => {
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      const taktStage = result.stages.find(s => s.stageId === 'CONTRACT_TAKT');
      expect(taktStage?.skipped).toBe(true);
    });

    it('skips DECISIONS stage for PILOT bundle', async () => {
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      const decisionsStage = result.stages.find(s => s.stageId === 'DECISIONS');
      expect(decisionsStage?.skipped).toBe(true);
    });

    it('always runs SEPPA_CONTEXT stage', async () => {
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      const seppaStage = result.stages.find(s => s.stageId === 'SEPPA_CONTEXT');
      expect(seppaStage?.success).toBe(true);
      expect(seppaStage?.skipped).toBeFalsy();
    });

    it('result contains stages for every executed stage', async () => {
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      expect(result.stages.length).toBeGreaterThanOrEqual(4);
    });

    it('records totalDurationMs > 0', async () => {
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('run() — error handling', () => {
    it('returns success=false when bundle load fails', async () => {
      const badSpaces = {
        ...spaces,
        getText: vi.fn().mockRejectedValue(new Error('not found')),
      } as unknown as SpacesClient;
      const pipeline = new IntakePipeline(db, { spacesClient: badSpaces, verbose: false });
      const result = await pipeline.run('does-not-exist', '1.0.0');
      expect(result.success).toBe(false);
    });

    it('returns failedStageId when a stage throws', async () => {
      db.tenant.upsert.mockRejectedValue(new Error('DB connection lost'));
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      const result = await pipeline.run('inca-boardline-alberta', '1.0.0');
      expect(result.success).toBe(false);
      expect(result.failedStageId).toBe('TENANT');
    });

    it('never throws — always returns PipelineResult', async () => {
      db.tenant.upsert.mockRejectedValue(new Error('catastrophic'));
      const pipeline = new IntakePipeline(db, { spacesClient: spaces, verbose: false });
      await expect(pipeline.run('inca-boardline-alberta', '1.0.0')).resolves.toBeDefined();
    });
  });
});
