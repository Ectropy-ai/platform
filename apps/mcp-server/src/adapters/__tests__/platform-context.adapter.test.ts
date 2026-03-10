/**
 * Platform Context Adapter Tests
 *
 * Integration tests that verify the Platform Context Adapter
 * correctly reads .roadmap/ canonical JSON files and maps them
 * to universal decision engine types.
 *
 * These tests run against REAL .roadmap/ data (not mocks),
 * validating the actual data pipeline from JSON → universal types.
 *
 * @module adapters/__tests__
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { PlatformContextAdapter } from '../platform/platform-context.adapter.js';
import { DATA_FILES } from '../../config/data-paths.config.js';

describe('PlatformContextAdapter', () => {
  let adapter: PlatformContextAdapter;

  // Skip all tests if .roadmap/ files don't exist (CI without data)
  const hasDataFiles =
    existsSync(DATA_FILES.currentTruth) &&
    existsSync(DATA_FILES.roadmap) &&
    existsSync(DATA_FILES.decisionLog);

  beforeAll(async () => {
    if (!hasDataFiles) return;

    adapter = new PlatformContextAdapter({
      domainId: 'platform',
      enableCache: false, // Disable cache for test isolation
    });
    await adapter.initialize();
  });

  afterEach(() => {
    if (adapter) {
      adapter.clearCache();
    }
  });

  describe('getDomainContext', () => {
    it.skipIf(!hasDataFiles)('should return platform domain context', () => {
      const domain = adapter.getDomainContext();

      expect(domain.domainId).toBe('platform');
      expect(domain.domainName).toBe('Ectropy Platform Development');
      expect(domain.domainVersion).toBe('1.0.0');
    });
  });

  describe('initialize', () => {
    it.skipIf(!hasDataFiles)(
      'should initialize successfully with valid data files',
      async () => {
        const freshAdapter = new PlatformContextAdapter();
        await expect(freshAdapter.initialize()).resolves.not.toThrow();
      }
    );
  });

  describe('healthCheck', () => {
    it.skipIf(!hasDataFiles)('should report healthy status', async () => {
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.source).toContain('platform');
      expect(status.latencyMs).toBeDefined();
      expect(status.entityCounts).toBeDefined();
      expect(status.entityCounts!.workUnits).toBeGreaterThan(0);
      expect(status.entityCounts!.decisions).toBeGreaterThan(0);
      expect(status.entityCounts!.stateNodes).toBeGreaterThan(0);
      expect(status.entityCounts!.containers).toBeGreaterThan(0);
    });
  });

  describe('getWorkUnits', () => {
    it.skipIf(!hasDataFiles)(
      'should return deliverables as work units',
      async () => {
        const workUnits = await adapter.getWorkUnits();

        expect(workUnits.length).toBeGreaterThan(0);

        // Check first work unit structure
        const wu = workUnits[0];
        expect(wu.id).toBeDefined();
        expect(wu.title).toBeDefined();
        expect(wu.domain.domainId).toBe('platform');
        expect(wu.status).toBeDefined();
        expect(wu.progress).toBeGreaterThanOrEqual(0);
        expect(wu.progress).toBeLessThanOrEqual(1);
        expect(wu.containerId).toBeDefined(); // Quarter ID
        expect(wu.metadata).toBeDefined();
      }
    );

    it.skipIf(!hasDataFiles)('should filter by status', async () => {
      const activeUnits = await adapter.getWorkUnits({
        status: ['active'],
      });
      const completedUnits = await adapter.getWorkUnits({
        status: ['completed'],
      });

      // All returned units should match the filter
      for (const wu of activeUnits) {
        expect(wu.status).toBe('active');
      }
      for (const wu of completedUnits) {
        expect(wu.status).toBe('completed');
      }
    });

    it.skipIf(!hasDataFiles)('should filter by container ID', async () => {
      const q1Units = await adapter.getWorkUnits({
        containerId: 'q1_2026',
      });

      for (const wu of q1Units) {
        expect(wu.containerId).toBe('q1_2026');
      }
    });
  });

  describe('getWorkUnit', () => {
    it.skipIf(!hasDataFiles)(
      'should find a specific work unit by ID',
      async () => {
        const allUnits = await adapter.getWorkUnits();
        if (allUnits.length === 0) return;

        const found = await adapter.getWorkUnit(allUnits[0].id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(allUnits[0].id);
      }
    );

    it.skipIf(!hasDataFiles)(
      'should return null for non-existent ID',
      async () => {
        const found = await adapter.getWorkUnit('nonexistent-id');
        expect(found).toBeNull();
      }
    );
  });

  describe('getDecisions', () => {
    it.skipIf(!hasDataFiles)(
      'should return decisions from decision-log.json',
      async () => {
        const decisions = await adapter.getDecisions();

        expect(decisions.length).toBeGreaterThan(0);

        // Check first decision structure
        const d = decisions[0];
        expect(d.id).toBeDefined();
        expect(d.title).toBeDefined();
        expect(d.domain.domainId).toBe('platform');
        expect(d.context).toBeDefined();
        expect(d.status).toBeDefined();
        expect(d.impact).toBeDefined();
        expect(d.category).toBeDefined();
        expect(d.tags).toBeDefined();
        expect(Array.isArray(d.tags)).toBe(true);
      }
    );

    it.skipIf(!hasDataFiles)('should filter by impact level', async () => {
      const highImpact = await adapter.getDecisions({
        impact: ['high', 'critical'],
      });

      for (const d of highImpact) {
        expect(['high', 'critical']).toContain(d.impact);
      }
    });

    it.skipIf(!hasDataFiles)('should filter by category', async () => {
      const allDecisions = await adapter.getDecisions();
      const categories = [...new Set(allDecisions.map((d) => d.category))];

      if (categories.length > 0) {
        const filtered = await adapter.getDecisions({
          category: categories[0],
        });
        for (const d of filtered) {
          expect(d.category).toBe(categories[0]);
        }
      }
    });
  });

  describe('getStateNodes', () => {
    it.skipIf(!hasDataFiles)(
      'should return nodes from current-truth.json',
      async () => {
        const nodes = await adapter.getStateNodes();

        expect(nodes.length).toBeGreaterThan(0);

        // Check first node structure
        const n = nodes[0];
        expect(n.id).toBeDefined();
        expect(n.title).toBeDefined();
        expect(n.domain.domainId).toBe('platform');
        expect(n.nodeType).toBeDefined();
        expect(n.status).toBeDefined();
        expect(n.relationships).toBeDefined();
        expect(n.relationships.dependencies).toBeDefined();
        expect(Array.isArray(n.relationships.dependencies)).toBe(true);
      }
    );

    it.skipIf(!hasDataFiles)('should filter by node type', async () => {
      const features = await adapter.getStateNodes({
        nodeType: ['feature'],
      });

      for (const n of features) {
        expect(n.nodeType).toBe('feature');
      }
    });

    it.skipIf(!hasDataFiles)('should filter by phase', async () => {
      const phase5b = await adapter.getStateNodes({
        phase: 'phase-5b',
      });

      for (const n of phase5b) {
        expect(n.phase).toBe('phase-5b');
      }
    });
  });

  describe('getContainers', () => {
    it.skipIf(!hasDataFiles)(
      'should return quarters as containers',
      async () => {
        const containers = await adapter.getContainers();

        expect(containers.length).toBeGreaterThan(0);

        const c = containers[0];
        expect(c.id).toBeDefined();
        expect(c.name).toBeDefined();
        expect(c.domain.domainId).toBe('platform');
        expect(c.status).toBeDefined();
        expect(c.workUnitIds).toBeDefined();
        expect(Array.isArray(c.workUnitIds)).toBe(true);
        expect(c.milestones).toBeDefined();
        expect(Array.isArray(c.milestones)).toBe(true);
      }
    );

    it.skipIf(!hasDataFiles)('should have an active container', async () => {
      const active = await adapter.getActiveContainer();

      expect(active).not.toBeNull();
      expect(active!.status).toBe('active');
    });

    it.skipIf(!hasDataFiles)(
      'should include milestones with gate information',
      async () => {
        const containers = await adapter.getContainers();
        const withMilestones = containers.filter(
          (c) => c.milestones.length > 0
        );

        expect(withMilestones.length).toBeGreaterThan(0);

        const ms = withMilestones[0].milestones[0];
        expect(ms.id).toBeDefined();
        expect(ms.name).toBeDefined();
        expect(ms.targetDate).toBeDefined();
        expect(typeof ms.isGate).toBe('boolean');
        expect(typeof ms.isCritical).toBe('boolean');
      }
    );
  });

  describe('getAuthorityCascade', () => {
    it.skipIf(!hasDataFiles)(
      'should return 4-tier platform authority',
      async () => {
        const cascade = await adapter.getAuthorityCascade();

        expect(cascade.domain.domainId).toBe('platform');
        expect(cascade.levels).toHaveLength(4);

        // Verify tier ordering
        const tiers = cascade.levels.map((l) => l.tier);
        expect(tiers).toEqual([0, 1, 2, 3]);

        // Verify known levels
        expect(cascade.levels[0].id).toBe('claude-agent');
        expect(cascade.levels[1].id).toBe('developer');
        expect(cascade.levels[2].id).toBe('architect');
        expect(cascade.levels[3].id).toBe('erik');
      }
    );

    it.skipIf(!hasDataFiles)(
      'should have escalation timeouts for all levels',
      async () => {
        const cascade = await adapter.getAuthorityCascade();

        for (const level of cascade.levels) {
          expect(cascade.escalationTimeouts[level.id]).toBeDefined();
        }
      }
    );
  });

  describe('computeHealthAssessment', () => {
    it.skipIf(!hasDataFiles)(
      'should compute a valid health assessment',
      async () => {
        const assessment = await adapter.computeHealthAssessment();

        expect(assessment.domain.domainId).toBe('platform');
        expect(assessment.overallHealth).toBeDefined();
        expect(['healthy', 'warning', 'critical']).toContain(
          assessment.overallHealth
        );
        expect(assessment.score).toBeGreaterThanOrEqual(0);
        expect(assessment.score).toBeLessThanOrEqual(100);
        expect(assessment.metrics).toHaveLength(12);
        expect(assessment.eigenmodeVector).toHaveLength(12);
        expect(assessment.assessedAt).toBeDefined();
      }
    );

    it.skipIf(!hasDataFiles)(
      'should reflect current platform health as healthy',
      async () => {
        // With 0 TS errors and 92% production readiness,
        // platform should be healthy
        const assessment = await adapter.computeHealthAssessment();
        expect(assessment.overallHealth).toBe('healthy');
      }
    );
  });

  describe('computeEigenmodeVector', () => {
    it.skipIf(!hasDataFiles)('should return 12-element vector', async () => {
      const vector = await adapter.computeEigenmodeVector();

      expect(vector).toHaveLength(12);
      for (const value of vector) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('computeMetric', () => {
    it.skipIf(!hasDataFiles)(
      'should compute a single metric by ID',
      async () => {
        const metric = await adapter.computeMetric('codebase_health');

        expect(metric).not.toBeNull();
        expect(metric!.id).toBe('codebase_health');
        expect(metric!.value).toBeGreaterThan(0);
      }
    );

    it.skipIf(!hasDataFiles)(
      'should return null for unknown metric ID',
      async () => {
        const metric = await adapter.computeMetric('nonexistent_metric');
        expect(metric).toBeNull();
      }
    );
  });

  describe('getWorkRecommendations', () => {
    it.skipIf(!hasDataFiles)(
      'should return prioritized recommendations',
      async () => {
        const recommendations = await adapter.getWorkRecommendations(3);

        // May be empty if no active work units
        expect(Array.isArray(recommendations)).toBe(true);
        expect(recommendations.length).toBeLessThanOrEqual(3);

        if (recommendations.length > 0) {
          const rec = recommendations[0];
          expect(rec.workUnit).toBeDefined();
          expect(rec.priority).toBeGreaterThanOrEqual(0);
          expect(rec.priority).toBeLessThanOrEqual(1);
          expect(rec.rationale).toBeDefined();
          expect(Array.isArray(rec.blockers)).toBe(true);
          expect(Array.isArray(rec.relatedDecisions)).toBe(true);
          expect(Array.isArray(rec.relevantMetrics)).toBe(true);
        }
      }
    );

    it.skipIf(!hasDataFiles)(
      'should sort recommendations by priority descending',
      async () => {
        const recommendations = await adapter.getWorkRecommendations(10);

        for (let i = 1; i < recommendations.length; i++) {
          expect(recommendations[i].priority).toBeLessThanOrEqual(
            recommendations[i - 1].priority
          );
        }
      }
    );
  });

  describe('getDependencies', () => {
    it.skipIf(!hasDataFiles)(
      'should return dependencies for a known entity',
      async () => {
        // Get a node with known dependencies
        const nodes = await adapter.getStateNodes();
        const nodeWithDeps = nodes.find(
          (n) => n.relationships.dependencies.length > 0
        );

        if (nodeWithDeps) {
          const deps = await adapter.getDependencies(nodeWithDeps.id);
          expect(deps.length).toBeGreaterThan(0);

          const dep = deps[0];
          expect(dep.id).toBeDefined();
          expect(dep.domain.domainId).toBe('platform');
          expect(dep.sourceId).toBeDefined();
          expect(dep.targetId).toBeDefined();
          expect(dep.type).toBeDefined();
          expect(typeof dep.isCritical).toBe('boolean');
        }
      }
    );
  });

  describe('caching', () => {
    it.skipIf(!hasDataFiles)('should clear cache on clearCache()', async () => {
      // First call warms the cache
      await adapter.getWorkUnits();

      // Clear and verify no errors on re-read
      adapter.clearCache();
      const units = await adapter.getWorkUnits();
      expect(units.length).toBeGreaterThan(0);
    });
  });

  describe('data integrity', () => {
    it.skipIf(!hasDataFiles)(
      'should have consistent work unit IDs across calls',
      async () => {
        const first = await adapter.getWorkUnits();
        adapter.clearCache();
        const second = await adapter.getWorkUnits();

        expect(first.map((wu) => wu.id).sort()).toEqual(
          second.map((wu) => wu.id).sort()
        );
      }
    );

    it.skipIf(!hasDataFiles)(
      'should have all universal statuses be valid',
      async () => {
        const validStatuses = [
          'planned',
          'active',
          'completed',
          'blocked',
          'on-hold',
          'cancelled',
          'failed',
        ];

        const workUnits = await adapter.getWorkUnits();
        for (const wu of workUnits) {
          expect(validStatuses).toContain(wu.status);
        }

        const decisions = await adapter.getDecisions();
        for (const d of decisions) {
          expect(validStatuses).toContain(d.status);
        }

        const nodes = await adapter.getStateNodes();
        for (const n of nodes) {
          expect(validStatuses).toContain(n.status);
        }
      }
    );
  });
});
