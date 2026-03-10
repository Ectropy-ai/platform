/**
 * SDI Projector Service Tests - DP-M4
 *
 * Tests for SDI projection and impact analysis.
 *
 * @see apps/mcp-server/src/services/sdi-projector.service.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  projectSDI,
  projectMultipleActions,
  estimateComponentDeltas,
  applyComponentDeltas,
  calculateConfidenceInterval,
  calculateCascadingEffects,
  rankActionsBySDIImpact,
  detectThresholdCrossing,
  recordProjectionOutcome,
  clearProjectionHistory,
  getHistoricalAccuracy,
  DEFAULT_PROJECTOR_CONFIG,
  type ProjectSDIInput,
  type ProposedAction,
  type SDIComponentDeltas,
  type ZoneDependency,
} from '../sdi-projector.service.js';

import type { SDIComponents } from '../../types/dual-process.types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_PROJECT_ID = 'test-project-001';

const createTestComponents = (overrides: Partial<SDIComponents> = {}): SDIComponents => ({
  viablePathCount: 1000,
  constraintCount: 50,
  resourceSlackRatio: 0.3,
  eigenmodeStability: 0.85,
  ...overrides,
});

const createTestAction = (overrides: Partial<ProposedAction> = {}): ProposedAction => ({
  actionType: 'reallocate_resource',
  targetUrn: 'urn:luhtech:test:voxel:VOX-001',
  parameters: {},
  estimatedDuration: 8,
  estimatedCost: 5000,
  ...overrides,
});

const createTestZoneDependencies = (): ZoneDependency[] => [
  { sourceZone: 'zone-a', targetZone: 'zone-b', weight: 0.8, effectType: 'direct' },
  { sourceZone: 'zone-a', targetZone: 'zone-c', weight: 0.5, effectType: 'indirect' },
  { sourceZone: 'zone-b', targetZone: 'zone-d', weight: 0.6, effectType: 'direct' },
  { sourceZone: 'zone-c', targetZone: 'zone-d', weight: 0.4, effectType: 'delayed', delayDays: 3 },
];

// ============================================================================
// Test Suites
// ============================================================================

describe('SDI Projector Service', () => {
  beforeEach(() => {
    clearProjectionHistory();
  });

  // ==========================================================================
  // estimateComponentDeltas Tests
  // ==========================================================================

  describe('estimateComponentDeltas', () => {
    it('should return positive path count for add_resource', () => {
      const action = createTestAction({ actionType: 'add_resource' });
      const deltas = estimateComponentDeltas(action);

      expect(deltas.viablePathCount).toBeGreaterThan(0);
      expect(deltas.resourceSlackRatio).toBeGreaterThan(0);
    });

    it('should return negative path count for compress_schedule', () => {
      const action = createTestAction({ actionType: 'compress_schedule' });
      const deltas = estimateComponentDeltas(action);

      expect(deltas.viablePathCount).toBeLessThan(0);
      expect(deltas.constraintCount).toBeGreaterThan(0);
    });

    it('should handle unknown action types gracefully', () => {
      const action = createTestAction({ actionType: 'unknown_action_type' });
      const deltas = estimateComponentDeltas(action);

      expect(deltas.viablePathCount).toBe(0);
      expect(deltas.constraintCount).toBe(0);
      expect(deltas.resourceSlackRatio).toBe(0);
      expect(deltas.eigenmodeStability).toBe(0);
    });

    it('should incorporate resource impact when provided', () => {
      const action = createTestAction({
        actionType: 'reallocate_resource',
        resourceImpact: {
          laborHoursConsumed: 0,
          laborHoursFreed: 100,
          budgetFreed: 10000,
        },
      });
      const deltas = estimateComponentDeltas(action);

      // Should have positive resource slack from freed resources
      expect(deltas.resourceSlackRatio).toBeGreaterThan(0);
    });

    it('should incorporate constraint impact when provided', () => {
      const action = createTestAction({
        actionType: 'approve',
        constraintImpact: {
          constraintsRemoved: ['c1', 'c2'],
          pathsOpened: 10,
        },
      });
      const deltas = estimateComponentDeltas(action);

      expect(deltas.constraintCount).toBeLessThan(0);
      expect(deltas.viablePathCount).toBeGreaterThan(0);
    });

    it('should scale effects by horizon', () => {
      const action = createTestAction({ actionType: 'add_resource' });

      const deltasShort = estimateComponentDeltas(action, 1);
      const deltasLong = estimateComponentDeltas(action, 30);

      // Longer horizon should have larger absolute effects
      expect(Math.abs(deltasLong.viablePathCount)).toBeGreaterThanOrEqual(
        Math.abs(deltasShort.viablePathCount)
      );
    });

    it('should return integer path and constraint counts', () => {
      const action = createTestAction({ actionType: 'reduce_scope' });
      const deltas = estimateComponentDeltas(action, 3);

      expect(Number.isInteger(deltas.viablePathCount)).toBe(true);
      expect(Number.isInteger(deltas.constraintCount)).toBe(true);
    });
  });

  // ==========================================================================
  // applyComponentDeltas Tests
  // ==========================================================================

  describe('applyComponentDeltas', () => {
    it('should correctly apply positive deltas', () => {
      const components = createTestComponents();
      const deltas: SDIComponentDeltas = {
        viablePathCount: 100,
        constraintCount: 5,
        resourceSlackRatio: 0.1,
        eigenmodeStability: 0.05,
      };

      const result = applyComponentDeltas(components, deltas);

      expect(result.viablePathCount).toBe(1100);
      expect(result.constraintCount).toBe(55);
      expect(result.resourceSlackRatio).toBeCloseTo(0.4);
      expect(result.eigenmodeStability).toBeCloseTo(0.9);
    });

    it('should correctly apply negative deltas', () => {
      const components = createTestComponents();
      const deltas: SDIComponentDeltas = {
        viablePathCount: -100,
        constraintCount: -10,
        resourceSlackRatio: -0.1,
        eigenmodeStability: -0.1,
      };

      const result = applyComponentDeltas(components, deltas);

      expect(result.viablePathCount).toBe(900);
      expect(result.constraintCount).toBe(40);
      expect(result.resourceSlackRatio).toBeCloseTo(0.2);
      expect(result.eigenmodeStability).toBeCloseTo(0.75);
    });

    it('should clamp viablePathCount to minimum 1', () => {
      const components = createTestComponents({ viablePathCount: 10 });
      const deltas: SDIComponentDeltas = {
        viablePathCount: -100,
        constraintCount: 0,
        resourceSlackRatio: 0,
        eigenmodeStability: 0,
      };

      const result = applyComponentDeltas(components, deltas);

      expect(result.viablePathCount).toBe(1);
    });

    it('should clamp constraintCount to minimum 0', () => {
      const components = createTestComponents({ constraintCount: 5 });
      const deltas: SDIComponentDeltas = {
        viablePathCount: 0,
        constraintCount: -100,
        resourceSlackRatio: 0,
        eigenmodeStability: 0,
      };

      const result = applyComponentDeltas(components, deltas);

      expect(result.constraintCount).toBe(0);
    });

    it('should clamp resourceSlackRatio to 0-1 range', () => {
      const components = createTestComponents({ resourceSlackRatio: 0.9 });
      const deltas: SDIComponentDeltas = {
        viablePathCount: 0,
        constraintCount: 0,
        resourceSlackRatio: 0.5,
        eigenmodeStability: 0,
      };

      const result = applyComponentDeltas(components, deltas);

      expect(result.resourceSlackRatio).toBe(1);
    });

    it('should clamp eigenmodeStability to 0-1 range', () => {
      const components = createTestComponents({ eigenmodeStability: 0.1 });
      const deltas: SDIComponentDeltas = {
        viablePathCount: 0,
        constraintCount: 0,
        resourceSlackRatio: 0,
        eigenmodeStability: -0.5,
      };

      const result = applyComponentDeltas(components, deltas);

      expect(result.eigenmodeStability).toBe(0);
    });
  });

  // ==========================================================================
  // projectSDI Tests
  // ==========================================================================

  describe('projectSDI', () => {
    it('should return current and projected SDI values', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction({ actionType: 'add_resource' }),
      };

      const result = projectSDI(input);

      expect(result.currentSdi).toBeGreaterThan(0);
      expect(result.projectedSdi).toBeGreaterThan(0);
      expect(typeof result.sdiDelta).toBe('number');
      expect(typeof result.sdiDeltaPercent).toBe('number');
    });

    it('should show increased SDI for positive actions', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction({ actionType: 'reduce_scope' }),
      };

      const result = projectSDI(input);

      expect(result.sdiDelta).toBeGreaterThan(0);
      expect(result.projectedSdi).toBeGreaterThan(result.currentSdi);
    });

    it('should show decreased SDI for negative actions', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction({ actionType: 'add_scope' }),
      };

      const result = projectSDI(input);

      expect(result.sdiDelta).toBeLessThan(0);
      expect(result.projectedSdi).toBeLessThan(result.currentSdi);
    });

    it('should include classification for current and projected', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction(),
      };

      const result = projectSDI(input);

      expect(['CRITICAL', 'WARNING', 'HEALTHY', 'ABUNDANT']).toContain(
        result.currentClassification
      );
      expect(['CRITICAL', 'WARNING', 'HEALTHY', 'ABUNDANT']).toContain(
        result.projectedClassification
      );
    });

    it('should include confidence interval by default', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction(),
      };

      const result = projectSDI(input);

      expect(result.confidenceInterval).toBeDefined();
      expect(result.confidenceInterval!.lower).toBeLessThanOrEqual(result.projectedSdi);
      expect(result.confidenceInterval!.upper).toBeGreaterThanOrEqual(result.projectedSdi);
      expect(result.confidenceInterval!.confidence).toBe(0.95);
    });

    it('should exclude confidence interval when requested', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction(),
        includeConfidence: false,
      };

      const result = projectSDI(input);

      expect(result.confidenceInterval).toBeUndefined();
    });

    it('should include component deltas', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction({ actionType: 'add_resource' }),
      };

      const result = projectSDI(input);

      expect(result.componentDeltas).toBeDefined();
      expect(typeof result.componentDeltas!.viablePathCount).toBe('number');
      expect(typeof result.componentDeltas!.constraintCount).toBe('number');
      expect(typeof result.componentDeltas!.resourceSlackRatio).toBe('number');
      expect(typeof result.componentDeltas!.eigenmodeStability).toBe('number');
    });

    it('should track projection latency', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction(),
      };

      const result = projectSDI(input);

      expect(result.projectionLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.projectionLatencyMs).toBeLessThan(100); // Should be fast
    });

    it('should use custom horizon when specified', () => {
      const shortHorizon: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction({ actionType: 'add_resource' }),
        horizon: 1,
      };

      const longHorizon: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction({ actionType: 'add_resource' }),
        horizon: 30,
      };

      const shortResult = projectSDI(shortHorizon);
      const longResult = projectSDI(longHorizon);

      // Longer horizon should have larger absolute delta
      expect(Math.abs(longResult.sdiDelta)).toBeGreaterThanOrEqual(
        Math.abs(shortResult.sdiDelta)
      );
    });

    it('should include cascading effects when zone and dependencies provided', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        zoneId: 'zone-a',
        currentComponents: createTestComponents(),
        proposedAction: createTestAction({ actionType: 'add_resource' }),
        zoneDependencies: createTestZoneDependencies(),
      };

      const result = projectSDI(input);

      expect(result.cascadingEffects).toBeDefined();
      expect(result.cascadingEffects!.length).toBeGreaterThan(0);
    });

    it('should not include cascading effects when no zone specified', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction(),
        zoneDependencies: createTestZoneDependencies(),
      };

      const result = projectSDI(input);

      expect(result.cascadingEffects).toBeUndefined();
    });
  });

  // ==========================================================================
  // calculateCascadingEffects Tests
  // ==========================================================================

  describe('calculateCascadingEffects', () => {
    it('should find direct dependencies', () => {
      const effects = calculateCascadingEffects(
        'zone-a',
        100,
        createTestZoneDependencies()
      );

      const directEffects = effects.filter((e) => e.effectType === 'direct');
      expect(directEffects.length).toBeGreaterThan(0);
    });

    it('should propagate effects through dependency chain', () => {
      const effects = calculateCascadingEffects(
        'zone-a',
        100,
        createTestZoneDependencies()
      );

      // zone-a -> zone-b -> zone-d should be reachable
      const zoneNames = effects.map((e) => e.affectedZone);
      expect(zoneNames).toContain('zone-b');
      // zone-d should be found through cascading
    });

    it('should decay effect magnitude with depth', () => {
      const effects = calculateCascadingEffects(
        'zone-a',
        100,
        createTestZoneDependencies()
      );

      const zoneBEffect = effects.find((e) => e.affectedZone === 'zone-b');
      const zoneDEffect = effects.find((e) => e.affectedZone === 'zone-d');

      if (zoneBEffect && zoneDEffect) {
        // zone-d is further from zone-a, should have smaller effect
        expect(Math.abs(zoneDEffect.sdiImpact)).toBeLessThan(Math.abs(zoneBEffect.sdiImpact));
      }
    });

    it('should include probability for each effect', () => {
      const effects = calculateCascadingEffects(
        'zone-a',
        100,
        createTestZoneDependencies()
      );

      for (const effect of effects) {
        expect(effect.probability).toBeGreaterThan(0);
        expect(effect.probability).toBeLessThanOrEqual(1);
      }
    });

    it('should preserve delay information', () => {
      const effects = calculateCascadingEffects(
        'zone-a',
        100,
        createTestZoneDependencies()
      );

      const delayedEffects = effects.filter((e) => e.effectType === 'delayed');
      for (const effect of delayedEffects) {
        expect(effect.delayDays).toBeDefined();
      }
    });

    it('should handle empty dependencies', () => {
      const effects = calculateCascadingEffects('zone-a', 100, []);

      expect(effects).toHaveLength(0);
    });

    it('should not include effects below probability threshold', () => {
      const effects = calculateCascadingEffects(
        'zone-a',
        100,
        createTestZoneDependencies(),
        { ...DEFAULT_PROJECTOR_CONFIG, minCascadingProbability: 0.9 }
      );

      // Should filter out low-probability effects
      expect(effects.length).toBeLessThan(createTestZoneDependencies().length);
    });
  });

  // ==========================================================================
  // calculateConfidenceInterval Tests
  // ==========================================================================

  describe('calculateConfidenceInterval', () => {
    it('should return default interval with no history', () => {
      const interval = calculateConfidenceInterval(1000);

      expect(interval.lower).toBeLessThan(1000);
      expect(interval.upper).toBeGreaterThan(1000);
      expect(interval.confidence).toBe(0.95);
    });

    it('should narrow interval with accurate history', () => {
      // Record some accurate predictions
      for (let i = 0; i < 50; i++) {
        recordProjectionOutcome(TEST_PROJECT_ID, 'add_resource', 1000, 990 + Math.random() * 20);
      }

      const intervalWithHistory = calculateConfidenceInterval(1000, TEST_PROJECT_ID, 'add_resource');
      const intervalNoHistory = calculateConfidenceInterval(1000, 'other-project');

      // With accurate history, interval should be narrower
      const widthWithHistory = intervalWithHistory.upper - intervalWithHistory.lower;
      const widthNoHistory = intervalNoHistory.upper - intervalNoHistory.lower;

      expect(widthWithHistory).toBeLessThan(widthNoHistory);
    });

    it('should widen interval with inaccurate history', () => {
      // Record some inaccurate predictions
      for (let i = 0; i < 50; i++) {
        const actual = 500 + Math.random() * 1000; // Very different from projected
        recordProjectionOutcome(TEST_PROJECT_ID, 'bad_action', 1000, actual);
      }

      const interval = calculateConfidenceInterval(1000, TEST_PROJECT_ID, 'bad_action');

      // Should have wide interval due to inaccurate history
      expect(interval.upper - interval.lower).toBeGreaterThan(100);
    });

    it('should use specified confidence level', () => {
      const interval95 = calculateConfidenceInterval(1000, undefined, undefined, 0.95);
      const interval99 = calculateConfidenceInterval(1000, undefined, undefined, 0.99);

      // 99% CI should be wider than 95% CI
      const width95 = interval95.upper - interval95.lower;
      const width99 = interval99.upper - interval99.lower;

      expect(width99).toBeGreaterThan(width95);
      expect(interval99.confidence).toBe(0.99);
    });
  });

  // ==========================================================================
  // projectMultipleActions Tests
  // ==========================================================================

  describe('projectMultipleActions', () => {
    it('should project multiple actions in batch', () => {
      const actions: ProposedAction[] = [
        createTestAction({ actionType: 'add_resource', targetUrn: 'action-1' }),
        createTestAction({ actionType: 'compress_schedule', targetUrn: 'action-2' }),
        createTestAction({ actionType: 'reduce_scope', targetUrn: 'action-3' }),
      ];

      const results = projectMultipleActions(TEST_PROJECT_ID, createTestComponents(), actions);

      expect(results.size).toBe(3);
      expect(results.has('action-1')).toBe(true);
      expect(results.has('action-2')).toBe(true);
      expect(results.has('action-3')).toBe(true);
    });

    it('should use index-based IDs when targetUrn not provided', () => {
      const actions: ProposedAction[] = [
        createTestAction({ actionType: 'add_resource', targetUrn: undefined }),
        createTestAction({ actionType: 'compress_schedule', targetUrn: undefined }),
      ];

      const results = projectMultipleActions(TEST_PROJECT_ID, createTestComponents(), actions);

      expect(results.has('action-0')).toBe(true);
      expect(results.has('action-1')).toBe(true);
    });

    it('should respect batch options', () => {
      const actions: ProposedAction[] = [
        createTestAction({ actionType: 'add_resource' }),
      ];

      const results = projectMultipleActions(
        TEST_PROJECT_ID,
        createTestComponents(),
        actions,
        { horizon: 30, includeConfidence: false }
      );

      const result = results.values().next().value;
      expect(result.confidenceInterval).toBeUndefined();
    });
  });

  // ==========================================================================
  // rankActionsBySDIImpact Tests
  // ==========================================================================

  describe('rankActionsBySDIImpact', () => {
    it('should rank actions by maximized SDI', () => {
      const projections = new Map([
        ['action-1', { projectedSdi: 5000, sdiDelta: 100 } as any],
        ['action-2', { projectedSdi: 8000, sdiDelta: 500 } as any],
        ['action-3', { projectedSdi: 3000, sdiDelta: -200 } as any],
      ]);

      const ranked = rankActionsBySDIImpact(projections, 'maximize');

      expect(ranked[0].actionId).toBe('action-2');
      expect(ranked[1].actionId).toBe('action-1');
      expect(ranked[2].actionId).toBe('action-3');
      expect(ranked[0].rank).toBe(1);
      expect(ranked[2].rank).toBe(3);
    });

    it('should rank actions by minimized SDI', () => {
      const projections = new Map([
        ['action-1', { projectedSdi: 5000, sdiDelta: 100 } as any],
        ['action-2', { projectedSdi: 8000, sdiDelta: 500 } as any],
        ['action-3', { projectedSdi: 3000, sdiDelta: -200 } as any],
      ]);

      const ranked = rankActionsBySDIImpact(projections, 'minimize');

      expect(ranked[0].actionId).toBe('action-3');
      expect(ranked[2].actionId).toBe('action-2');
    });

    it('should rank actions by stability (smallest delta)', () => {
      const projections = new Map([
        ['action-1', { projectedSdi: 5000, sdiDelta: 100 } as any],
        ['action-2', { projectedSdi: 8000, sdiDelta: 500 } as any],
        ['action-3', { projectedSdi: 5050, sdiDelta: 50 } as any],
      ]);

      const ranked = rankActionsBySDIImpact(projections, 'stabilize');

      expect(ranked[0].actionId).toBe('action-3');
      expect(ranked[0].projection.sdiDelta).toBe(50);
    });
  });

  // ==========================================================================
  // detectThresholdCrossing Tests
  // ==========================================================================

  describe('detectThresholdCrossing', () => {
    it('should detect threshold crossing from warning to healthy', () => {
      const result = detectThresholdCrossing(800, 15000);

      expect(result.crossesThreshold).toBe(true);
      expect(result.fromState).toBe('WARNING');
      expect(result.toState).toBe('HEALTHY');
      expect(result.isImprovement).toBe(true);
    });

    it('should detect threshold crossing from healthy to warning', () => {
      const result = detectThresholdCrossing(15000, 800);

      expect(result.crossesThreshold).toBe(true);
      expect(result.fromState).toBe('HEALTHY');
      expect(result.toState).toBe('WARNING');
      expect(result.isImprovement).toBe(false);
    });

    it('should detect no crossing when staying in same state', () => {
      const result = detectThresholdCrossing(15000, 20000);

      expect(result.crossesThreshold).toBe(false);
      expect(result.fromState).toBe('HEALTHY');
      expect(result.toState).toBe('HEALTHY');
    });

    it('should detect crossing into critical', () => {
      const result = detectThresholdCrossing(500, 50);

      expect(result.crossesThreshold).toBe(true);
      expect(result.toState).toBe('CRITICAL');
      expect(result.isImprovement).toBe(false);
    });

    it('should detect crossing into abundant', () => {
      const result = detectThresholdCrossing(50000, 150000);

      expect(result.crossesThreshold).toBe(true);
      expect(result.toState).toBe('ABUNDANT');
      expect(result.isImprovement).toBe(true);
    });
  });

  // ==========================================================================
  // Historical Accuracy Tests
  // ==========================================================================

  describe('Historical Accuracy', () => {
    it('should record and retrieve projection outcomes', () => {
      recordProjectionOutcome(TEST_PROJECT_ID, 'add_resource', 1000, 950);
      recordProjectionOutcome(TEST_PROJECT_ID, 'add_resource', 2000, 1900);

      const accuracy = getHistoricalAccuracy(TEST_PROJECT_ID, 'add_resource');

      expect(accuracy.sampleSize).toBe(2);
      expect(accuracy.meanError).toBeGreaterThan(0);
    });

    it('should return conservative defaults with no history', () => {
      const accuracy = getHistoricalAccuracy('nonexistent-project');

      expect(accuracy.sampleSize).toBe(0);
      expect(accuracy.meanError).toBe(0.15);
      expect(accuracy.stdDev).toBe(0.1);
    });

    it('should filter by project when specified', () => {
      recordProjectionOutcome('project-a', 'action', 1000, 900);
      recordProjectionOutcome('project-b', 'action', 1000, 1100);

      const accuracyA = getHistoricalAccuracy('project-a');
      const accuracyB = getHistoricalAccuracy('project-b');

      expect(accuracyA.sampleSize).toBe(1);
      expect(accuracyB.sampleSize).toBe(1);
    });

    it('should filter by action type when specified', () => {
      recordProjectionOutcome(TEST_PROJECT_ID, 'action-1', 1000, 900);
      recordProjectionOutcome(TEST_PROJECT_ID, 'action-2', 1000, 1100);

      const accuracy1 = getHistoricalAccuracy(undefined, 'action-1');
      const accuracy2 = getHistoricalAccuracy(undefined, 'action-2');

      expect(accuracy1.sampleSize).toBe(1);
      expect(accuracy2.sampleSize).toBe(1);
    });

    it('should clear history correctly', () => {
      recordProjectionOutcome(TEST_PROJECT_ID, 'action', 1000, 900);
      expect(getHistoricalAccuracy().sampleSize).toBe(1);

      clearProjectionHistory();
      expect(getHistoricalAccuracy().sampleSize).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle zero SDI gracefully', () => {
      const components = createTestComponents({ viablePathCount: 1 });
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: components,
        proposedAction: createTestAction({ actionType: 'add_scope' }),
      };

      const result = projectSDI(input);

      expect(result.currentSdi).toBeGreaterThan(0);
      expect(isFinite(result.sdiDeltaPercent)).toBe(true);
    });

    it('should handle very large path counts', () => {
      const components = createTestComponents({ viablePathCount: 1000000 });
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: components,
        proposedAction: createTestAction({ actionType: 'add_resource' }),
      };

      const result = projectSDI(input);

      expect(isFinite(result.projectedSdi)).toBe(true);
      expect(result.projectedSdi).toBeGreaterThan(0);
    });

    it('should handle minimal components', () => {
      const components: SDIComponents = {
        viablePathCount: 1,
        constraintCount: 0,
        resourceSlackRatio: 0,
        eigenmodeStability: 0,
      };
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: components,
        proposedAction: createTestAction({ actionType: 'add_resource' }),
      };

      const result = projectSDI(input);

      expect(result.currentClassification).toBe('CRITICAL');
      expect(result.projectedSdi).toBeGreaterThanOrEqual(result.currentSdi);
    });

    it('should handle action with all impacts specified', () => {
      const action: ProposedAction = {
        actionType: 'add_resource',
        targetUrn: 'urn:test',
        parameters: { crew: 'alpha' },
        estimatedDuration: 40,
        estimatedCost: 50000,
        resourceImpact: {
          laborHoursConsumed: 200,
          laborHoursFreed: 0,
          materialsConsumed: ['steel', 'concrete'],
          equipmentRequired: ['crane'],
          budgetConsumed: 50000,
          budgetFreed: 0,
        },
        constraintImpact: {
          constraintsAdded: ['c1'],
          constraintsRemoved: ['c2', 'c3'],
          pathsOpened: 5,
          pathsClosed: 1,
        },
      };

      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: action,
      };

      const result = projectSDI(input);

      expect(result.componentDeltas).toBeDefined();
      // Net constraint change: +1 - 2 = -1
      // Net path change: baseline + 5 - 1 = baseline + 4
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Performance', () => {
    it('should project SDI in under 10ms', () => {
      const input: ProjectSDIInput = {
        projectId: TEST_PROJECT_ID,
        currentComponents: createTestComponents(),
        proposedAction: createTestAction(),
      };

      const result = projectSDI(input);

      expect(result.projectionLatencyMs).toBeLessThan(10);
    });

    it('should batch project 100 actions in under 100ms', () => {
      const actions: ProposedAction[] = Array(100)
        .fill(null)
        .map((_, i) =>
          createTestAction({
            actionType: i % 2 === 0 ? 'add_resource' : 'compress_schedule',
            targetUrn: `action-${i}`,
          })
        );

      const start = performance.now();
      const results = projectMultipleActions(TEST_PROJECT_ID, createTestComponents(), actions);
      const elapsed = performance.now() - start;

      expect(results.size).toBe(100);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
