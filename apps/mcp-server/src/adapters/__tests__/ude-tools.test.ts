/**
 * UDE Tools Tests
 *
 * Tests for the 6 Unified Decision Engine MCP tools.
 * Tests run against REAL .roadmap/ data (with skipIf guards for CI).
 *
 * @module services/__tests__/ude-tools.test
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { existsSync } from 'fs';
import {
  udeTools,
  getUdeToolByName,
  getUdeToolNames,
} from '../../services/ude-tools.js';
import { ContextRegistry } from '../context-registry.js';
import { PlatformContextAdapter } from '../platform/platform-context.adapter.js';
import { DATA_FILES } from '../../config/data-paths.config.js';

// Check if .roadmap/ data files exist for integration tests
const hasDataFiles =
  existsSync(DATA_FILES.currentTruth) &&
  existsSync(DATA_FILES.roadmap) &&
  existsSync(DATA_FILES.decisionLog);

describe('UDE Tools', () => {
  // ========================================================================
  // Registry & Definition Tests (no data files required)
  // ========================================================================

  describe('tool registry', () => {
    it('exports exactly 6 tools', () => {
      expect(udeTools).toHaveLength(6);
    });

    it('has unique tool names', () => {
      const names = getUdeToolNames();
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('getUdeToolNames returns correct names', () => {
      const names = getUdeToolNames();
      expect(names).toContain('read_current_truth');
      expect(names).toContain('read_roadmap');
      expect(names).toContain('read_decision_log');
      expect(names).toContain('get_feature_status');
      expect(names).toContain('get_next_work');
      expect(names).toContain('get_health_assessment');
    });

    it('getUdeToolByName finds existing tool', () => {
      const tool = getUdeToolByName('read_current_truth');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('read_current_truth');
    });

    it('getUdeToolByName returns undefined for missing tool', () => {
      const tool = getUdeToolByName('nonexistent_tool');
      expect(tool).toBeUndefined();
    });

    it('every tool has required MCPToolDefinition fields', () => {
      for (const tool of udeTools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.handler).toBeTypeOf('function');
      }
    });

    it('every tool has a properties object in inputSchema', () => {
      for (const tool of udeTools) {
        expect(tool.inputSchema.properties).toBeDefined();
        expect(typeof tool.inputSchema.properties).toBe('object');
      }
    });
  });

  // ========================================================================
  // Tool Execution Tests (require .roadmap/ data files)
  // ========================================================================

  describe('tool execution (integration)', () => {
    beforeAll(async () => {
      if (!hasDataFiles) {
        return;
      }
      // Register the platform adapter
      const registry = ContextRegistry.getInstance();
      if (!registry.hasAdapter('platform')) {
        const adapter = new PlatformContextAdapter({
          domainId: 'platform',
          enableCache: true,
          cacheTTL: 300_000,
        });
        await registry.register(adapter);
      }
    });

    afterEach(() => {
      // Don't reset the registry — we want it to persist across tests
    });

    // Tool 1: read_current_truth
    describe('read_current_truth', () => {
      it.skipIf(!hasDataFiles)(
        'returns state nodes with no filters',
        async () => {
          const tool = getUdeToolByName('read_current_truth')!;
          const result = await tool.handler({});

          expect(result.success).toBe(true);
          expect(result.data).toBeDefined();
          const data = result.data as any;
          expect(data.nodes).toBeInstanceOf(Array);
          expect(data.count).toBeGreaterThan(0);
          expect(data.domain.domainId).toBe('platform');
        }
      );

      it.skipIf(!hasDataFiles)('filters by node type', async () => {
        const tool = getUdeToolByName('read_current_truth')!;
        const result = await tool.handler({ nodeType: ['feature'] });

        expect(result.success).toBe(true);
        const data = result.data as any;
        if (data.count > 0) {
          expect(data.nodes[0].nodeType).toBe('feature');
        }
      });

      it.skipIf(!hasDataFiles)(
        'returns error for missing node ID',
        async () => {
          const tool = getUdeToolByName('read_current_truth')!;
          const result = await tool.handler({ nodeId: 'nonexistent-node-xyz' });

          expect(result.success).toBe(false);
          expect(result.error?.code).toBe('NODE_NOT_FOUND');
        }
      );

      it.skipIf(!hasDataFiles)('includes metadata with duration', async () => {
        const tool = getUdeToolByName('read_current_truth')!;
        const result = await tool.handler({});

        expect(result.metadata).toBeDefined();
        expect(result.metadata!.duration).toBeGreaterThanOrEqual(0);
        expect(result.metadata!.timestamp).toBeTruthy();
      });
    });

    // Tool 2: read_roadmap
    describe('read_roadmap', () => {
      it.skipIf(!hasDataFiles)(
        'returns work units and containers',
        async () => {
          const tool = getUdeToolByName('read_roadmap')!;
          const result = await tool.handler({});

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.workUnits).toBeInstanceOf(Array);
          expect(data.workUnitCount).toBeGreaterThanOrEqual(0);
          expect(data.containers).toBeInstanceOf(Array);
          expect(data.containerCount).toBeGreaterThan(0);
        }
      );

      it.skipIf(!hasDataFiles)(
        'activeOnly returns active container',
        async () => {
          const tool = getUdeToolByName('read_roadmap')!;
          const result = await tool.handler({ activeOnly: true });

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.workUnits).toBeInstanceOf(Array);
          // Active container may or may not exist
          if (data.activeContainer) {
            expect(data.activeContainer.status).toBe('active');
          }
        }
      );

      it.skipIf(!hasDataFiles)(
        'excludes containers when includeContainers=false',
        async () => {
          const tool = getUdeToolByName('read_roadmap')!;
          const result = await tool.handler({ includeContainers: false });

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.workUnits).toBeInstanceOf(Array);
          expect(data.containers).toBeUndefined();
        }
      );
    });

    // Tool 3: read_decision_log
    describe('read_decision_log', () => {
      it.skipIf(!hasDataFiles)(
        'returns decisions with no filters',
        async () => {
          const tool = getUdeToolByName('read_decision_log')!;
          const result = await tool.handler({});

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.decisions).toBeInstanceOf(Array);
          expect(data.count).toBeGreaterThan(0);
        }
      );

      it.skipIf(!hasDataFiles)('filters by category', async () => {
        const tool = getUdeToolByName('read_decision_log')!;
        const result = await tool.handler({ category: 'governance' });

        expect(result.success).toBe(true);
        const data = result.data as any;
        if (data.count > 0) {
          for (const d of data.decisions) {
            expect(d.category).toBe('governance');
          }
        }
      });

      it.skipIf(!hasDataFiles)(
        'returns error for missing decision ID',
        async () => {
          const tool = getUdeToolByName('read_decision_log')!;
          const result = await tool.handler({
            decisionId: 'nonexistent-decision-xyz',
          });

          expect(result.success).toBe(false);
          expect(result.error?.code).toBe('DECISION_NOT_FOUND');
        }
      );
    });

    // Tool 4: get_feature_status
    describe('get_feature_status', () => {
      it.skipIf(!hasDataFiles)(
        'returns error for nonexistent feature',
        async () => {
          const tool = getUdeToolByName('get_feature_status')!;
          const result = await tool.handler({ id: 'nonexistent-feature-xyz' });

          expect(result.success).toBe(false);
          expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
        }
      );

      it.skipIf(!hasDataFiles)(
        'finds an entity that exists in current truth',
        async () => {
          // First get a known node ID
          const truthTool = getUdeToolByName('read_current_truth')!;
          const truthResult = await truthTool.handler({});
          const nodes = (truthResult.data as any).nodes;

          if (nodes.length === 0) {
            return;
          }

          const firstNodeId = nodes[0].id;
          const tool = getUdeToolByName('get_feature_status')!;
          const result = await tool.handler({ id: firstNodeId });

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.stateNode).toBeDefined();
          expect(data.entityType).toMatch(/stateNode|both/);
        }
      );

      it.skipIf(!hasDataFiles)(
        'includes dependencies and decisions by default',
        async () => {
          const truthTool = getUdeToolByName('read_current_truth')!;
          const truthResult = await truthTool.handler({});
          const nodes = (truthResult.data as any).nodes;

          if (nodes.length === 0) {
            return;
          }

          const firstNodeId = nodes[0].id;
          const tool = getUdeToolByName('get_feature_status')!;
          const result = await tool.handler({ id: firstNodeId });

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.dependencies).toBeInstanceOf(Array);
          expect(data.relatedDecisions).toBeInstanceOf(Array);
          expect(typeof data.dependencyCount).toBe('number');
          expect(typeof data.relatedDecisionCount).toBe('number');
        }
      );

      it.skipIf(!hasDataFiles)(
        'excludes dependencies when includeDependencies=false',
        async () => {
          const truthTool = getUdeToolByName('read_current_truth')!;
          const truthResult = await truthTool.handler({});
          const nodes = (truthResult.data as any).nodes;

          if (nodes.length === 0) {
            return;
          }

          const firstNodeId = nodes[0].id;
          const tool = getUdeToolByName('get_feature_status')!;
          const result = await tool.handler({
            id: firstNodeId,
            includeDependencies: false,
          });

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.dependencies).toBeUndefined();
        }
      );
    });

    // Tool 5: get_next_work
    describe('get_next_work', () => {
      it.skipIf(!hasDataFiles)('returns work recommendations', async () => {
        const tool = getUdeToolByName('get_next_work')!;
        const result = await tool.handler({});

        expect(result.success).toBe(true);
        const data = result.data as any;
        expect(data.recommendations).toBeInstanceOf(Array);
        expect(typeof data.count).toBe('number');
        expect(data.domain.domainId).toBe('platform');
      });

      it.skipIf(!hasDataFiles)('respects limit parameter', async () => {
        const tool = getUdeToolByName('get_next_work')!;
        const result = await tool.handler({ limit: 2 });

        expect(result.success).toBe(true);
        const data = result.data as any;
        expect(data.recommendations.length).toBeLessThanOrEqual(2);
      });

      it.skipIf(!hasDataFiles)('caps limit at 20', async () => {
        const tool = getUdeToolByName('get_next_work')!;
        const result = await tool.handler({ limit: 100 });

        expect(result.success).toBe(true);
        const data = result.data as any;
        expect(data.recommendations.length).toBeLessThanOrEqual(20);
      });

      it.skipIf(!hasDataFiles)(
        'recommendations have required fields',
        async () => {
          const tool = getUdeToolByName('get_next_work')!;
          const result = await tool.handler({ limit: 3 });

          expect(result.success).toBe(true);
          const data = result.data as any;

          for (const rec of data.recommendations) {
            expect(rec.workUnit).toBeDefined();
            expect(rec.priority).toBeGreaterThanOrEqual(0);
            expect(rec.priority).toBeLessThanOrEqual(1);
            expect(rec.rationale).toBeTruthy();
            expect(rec.blockers).toBeInstanceOf(Array);
            expect(rec.relatedDecisions).toBeInstanceOf(Array);
            expect(rec.relevantMetrics).toBeInstanceOf(Array);
          }
        }
      );
    });

    // Tool 6: get_health_assessment
    describe('get_health_assessment', () => {
      it.skipIf(!hasDataFiles)('returns full health assessment', async () => {
        const tool = getUdeToolByName('get_health_assessment')!;
        const result = await tool.handler({});

        expect(result.success).toBe(true);
        const data = result.data as any;
        expect(data.assessment).toBeDefined();
        expect(data.assessment.overallHealth).toMatch(
          /healthy|warning|critical/
        );
        expect(data.assessment.score).toBeGreaterThanOrEqual(0);
        expect(data.assessment.score).toBeLessThanOrEqual(100);
        expect(data.assessment.metrics).toHaveLength(12);
        expect(data.assessment.eigenmodeVector).toHaveLength(12);
        expect(data.domain.domainId).toBe('platform');
      });

      it.skipIf(!hasDataFiles)('returns single metric by ID', async () => {
        const tool = getUdeToolByName('get_health_assessment')!;
        const result = await tool.handler({
          metricId: 'codebase_health',
        });

        expect(result.success).toBe(true);
        const metric = result.data as any;
        expect(metric.id).toBe('codebase_health');
        expect(metric.value).toBeGreaterThanOrEqual(0);
        expect(metric.value).toBeLessThanOrEqual(1);
      });

      it.skipIf(!hasDataFiles)(
        'returns error for unknown metric ID',
        async () => {
          const tool = getUdeToolByName('get_health_assessment')!;
          const result = await tool.handler({
            metricId: 'nonexistent_metric',
          });

          expect(result.success).toBe(false);
          expect(result.error?.code).toBe('METRIC_NOT_FOUND');
        }
      );

      it.skipIf(!hasDataFiles)(
        'includes authority cascade when requested',
        async () => {
          const tool = getUdeToolByName('get_health_assessment')!;
          const result = await tool.handler({ includeAuthority: true });

          expect(result.success).toBe(true);
          const data = result.data as any;
          expect(data.authorityCascade).toBeDefined();
          expect(data.authorityCascade.levels).toHaveLength(4);
        }
      );

      it.skipIf(!hasDataFiles)(
        'eigenmodes sum to approximately 1.0 weight',
        async () => {
          const tool = getUdeToolByName('get_health_assessment')!;
          const result = await tool.handler({});

          const data = result.data as any;
          const totalWeight = data.assessment.metrics.reduce(
            (sum: number, m: any) => sum + m.weight,
            0
          );
          expect(totalWeight).toBeCloseTo(1.0, 1);
        }
      );
    });

    // Error handling
    describe('error handling', () => {
      it('returns error when no adapter registered for domain', async () => {
        // Temporarily reset registry to simulate missing adapter
        const registry = ContextRegistry.getInstance();
        const summary = registry.getSummary();

        // Only test if we can safely manipulate — use a nonexistent domain
        const tool = getUdeToolByName('read_current_truth')!;
        const result = await tool.handler({
          domainId: 'nonexistent-domain-xyz',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('READ_CURRENT_TRUTH_ERROR');
      });
    });
  });
});
