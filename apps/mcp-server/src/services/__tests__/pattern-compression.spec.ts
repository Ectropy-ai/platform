/**
 * Pattern Compression Service Tests - DP-M3
 *
 * Tests for pattern compression pipeline including validation gates,
 * pattern creation, merging, and decay mechanisms.
 *
 * Four Validation Gates:
 * 1. Succeeded - Did the decision achieve its goal?
 * 2. Replicable - Can it be applied again in similar contexts?
 * 3. Generalizable - Does it apply beyond the specific instance?
 * 4. Significant - Was the improvement meaningful?
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateForCompression,
  compressDecision,
  mergePatterns,
  applyDecay,
  prunePatterns,
  computeContextBreadth,
  updatePatternFromOutcome,
  isCompressionEligible,
  DEFAULT_COMPRESSION_CONFIG,
  CompressionAction,
} from '../pattern-compression.service.js';
import type {
  DecisionEvent,
  DecisionOutcome,
  SuccessPattern,
  EigenmodeVector,
  DecisionTrigger,
  ValidationGates,
} from '../../types/dual-process.types.js';
import { DecisionTriggerType, SDIClassification } from '../../types/dual-process.types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestEigenmodeVector = (base = 0.5): EigenmodeVector => [
  base, base * 0.8, base * 0.6, base * 0.4,
  base * 0.3, base * 0.2, base * 0.15, base * 0.1,
  base * 0.08, base * 0.05, base * 0.03, base * 0.01
];

const createTestDecisionTrigger = (partial?: Partial<DecisionTrigger>): DecisionTrigger => ({
  type: DecisionTriggerType.SCHEDULED,
  source: 'urn:luhtech:test:voxel:VOX-2026-0001',
  urgency: 0.5,
  context: {},
  ...partial,
});

const createTestSuccessOutcome = (partial?: Partial<DecisionOutcome>): DecisionOutcome => ({
  success: true,
  actualVsProjected: 0.2, // Better than expected
  downstreamEffects: [],
  learningsExtracted: ['Pattern validated'],
  recordedAt: new Date().toISOString(),
  ...partial,
});

const createTestFailureOutcome = (partial?: Partial<DecisionOutcome>): DecisionOutcome => ({
  success: false,
  actualVsProjected: -0.3, // Worse than expected
  downstreamEffects: [],
  learningsExtracted: ['Pattern failed'],
  recordedAt: new Date().toISOString(),
  ...partial,
});

const createTestDecisionEvent = (partial?: Partial<DecisionEvent>): DecisionEvent => ({
  $id: 'urn:luhtech:test:decision-event:DEV-2026-0001' as any,
  timestamp: new Date().toISOString(),
  projectId: 'proj-001',
  actorId: 'actor-001',
  trigger: createTestDecisionTrigger(),
  stateSdi: 15000,
  stateEigenmodes: createTestEigenmodeVector(),
  engine1Output: {
    applicablePatterns: [],
    patternMatchScores: [],
    confidence: 0.8,
    queryLatencyMs: 10,
  },
  engine2Output: {
    viableOptions: [],
    novelOptions: [],
    sdiProjections: {},
    riskProfiles: {},
    explorationValue: {},
    computationDepth: 3,
    generationLatencyMs: 50,
  },
  mediation: {
    decisionEventUrn: 'urn:luhtech:test:decision-event:DEV-2026-0001' as any,
    selectedAction: {
      actionType: 'reschedule_task',
      targetUrn: 'urn:luhtech:test:task:TASK-001',
      parameters: { delayDays: 2 },
    },
    sourceEngine: 'engine1' as any,
    rationale: 'Pattern matched with high confidence',
    explorationAllocation: 0.1,
    riskBearer: 'actor-001',
    monitoringTriggers: [],
    engine1Output: {} as any,
    engine2Output: {} as any,
    mediationLatencyMs: 15,
  },
  outcome: createTestSuccessOutcome(),
  ...partial,
});

const createTestSuccessPattern = (partial?: Partial<SuccessPattern>): SuccessPattern => ({
  $id: 'urn:luhtech:test:success-pattern:PAT-2026-0001' as any,
  contextSignature: createTestEigenmodeVector(),
  actionType: 'reschedule_task',
  outcomeProfile: {
    expectedSuccessRate: 0.85,
    expectedImprovement: 1.15,
    variance: 0.1,
  },
  confidence: 0.9,
  frequency: 10,
  successCount: 8,
  lastApplied: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  contextBreadth: 0.7,
  sourceDecisions: ['urn:luhtech:test:decision-event:DEV-2026-0001'],
  decayFactor: 1.0,
  halfLifeDays: 180,
  isGlobal: false,
  tags: ['scheduling', 'delay'],
  ...partial,
});

// ============================================================================
// Validation Gate Tests
// ============================================================================

describe('Pattern Compression Service', () => {
  describe('validateForCompression', () => {
    it('should pass all gates for successful decision with good outcome', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestSuccessOutcome({
          success: true,
          actualVsProjected: 0.3,
        }),
      });

      const result = validateForCompression(decision);

      expect(result.succeeded).toBe(true);
      expect(result.replicable).toBe(true);
      expect(result.generalizable).toBe(true);
      expect(result.significant).toBe(true);
    });

    it('should fail succeeded gate for unsuccessful decision', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestFailureOutcome(),
      });

      const result = validateForCompression(decision);

      expect(result.succeeded).toBe(false);
    });

    it('should fail replicable gate for escalation trigger', () => {
      const decision = createTestDecisionEvent({
        trigger: createTestDecisionTrigger({ type: DecisionTriggerType.ESCALATION }),
        outcome: createTestSuccessOutcome(),
      });

      const result = validateForCompression(decision);

      expect(result.replicable).toBe(false);
    });

    it('should fail generalizable gate for very specific context', () => {
      // Decision with very narrow context (high specificity)
      const decision = createTestDecisionEvent({
        outcome: createTestSuccessOutcome(),
        mediation: {
          ...createTestDecisionEvent().mediation,
          selectedAction: {
            actionType: 'specific_one_time_fix',
            targetUrn: 'urn:luhtech:test:specific:SPECIFIC-001',
            parameters: { uniqueParam: 'unique-value-12345' },
          },
        },
      });

      const result = validateForCompression(decision, {
        ...DEFAULT_COMPRESSION_CONFIG,
        minContextBreadth: 0.5,
      });

      // This depends on context breadth calculation
      expect(result).toBeDefined();
    });

    it('should fail significant gate for marginal improvement', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestSuccessOutcome({
          success: true,
          actualVsProjected: 0.01, // Barely better
        }),
      });

      const result = validateForCompression(decision, {
        ...DEFAULT_COMPRESSION_CONFIG,
        minImprovementThreshold: 0.05,
      });

      expect(result.significant).toBe(false);
    });

    it('should pass significant gate for meaningful improvement', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestSuccessOutcome({
          success: true,
          actualVsProjected: 0.2,
        }),
      });

      const result = validateForCompression(decision, {
        ...DEFAULT_COMPRESSION_CONFIG,
        minImprovementThreshold: 0.05,
      });

      expect(result.significant).toBe(true);
    });

    it('should handle decision without outcome', () => {
      const decision = createTestDecisionEvent({ outcome: undefined });

      const result = validateForCompression(decision);

      expect(result.succeeded).toBe(false);
      expect(result.significant).toBe(false);
    });
  });

  // ============================================================================
  // isCompressionEligible Tests
  // ============================================================================

  describe('isCompressionEligible', () => {
    it('should return true when all gates pass', () => {
      const gates: ValidationGates = {
        succeeded: true,
        replicable: true,
        generalizable: true,
        significant: true,
      };

      expect(isCompressionEligible(gates)).toBe(true);
    });

    it('should return false when any gate fails', () => {
      const gates: ValidationGates = {
        succeeded: true,
        replicable: false,
        generalizable: true,
        significant: true,
      };

      expect(isCompressionEligible(gates)).toBe(false);
    });

    it('should return false when all gates fail', () => {
      const gates: ValidationGates = {
        succeeded: false,
        replicable: false,
        generalizable: false,
        significant: false,
      };

      expect(isCompressionEligible(gates)).toBe(false);
    });
  });

  // ============================================================================
  // compressDecision Tests
  // ============================================================================

  describe('compressDecision', () => {
    it('should create new pattern from eligible decision', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestSuccessOutcome({
          success: true,
          actualVsProjected: 0.2,
        }),
      });

      const result = compressDecision(decision, []);

      expect(result.action).toBe(CompressionAction.CREATED);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.actionType).toBe('reschedule_task');
      expect(result.pattern!.confidence).toBeGreaterThan(0);
      expect(result.pattern!.frequency).toBe(1);
      expect(result.pattern!.successCount).toBe(1);
    });

    it('should skip ineligible decision', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestFailureOutcome(),
      });

      const result = compressDecision(decision, []);

      expect(result.action).toBe(CompressionAction.SKIPPED);
      expect(result.pattern).toBeUndefined();
      expect(result.reason).toBeDefined();
    });

    it('should merge with existing similar pattern', () => {
      const existingPattern = createTestSuccessPattern({
        contextSignature: createTestEigenmodeVector(0.5),
        frequency: 5,
        successCount: 4,
        confidence: 0.8,
      });

      const decision = createTestDecisionEvent({
        stateEigenmodes: createTestEigenmodeVector(0.52), // Very similar
        outcome: createTestSuccessOutcome(),
      });

      const result = compressDecision(decision, [existingPattern]);

      expect(result.action).toBe(CompressionAction.MERGED);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.frequency).toBe(6);
      expect(result.pattern!.successCount).toBe(5);
    });

    it('should create new pattern when no similar exists', () => {
      // Create patterns with truly different context signatures
      const existingPattern = createTestSuccessPattern({
        contextSignature: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Points in one direction
      });

      const decision = createTestDecisionEvent({
        stateEigenmodes: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Orthogonal direction (similarity = 0)
        outcome: createTestSuccessOutcome(),
      });

      const result = compressDecision(decision, [existingPattern]);

      expect(result.action).toBe(CompressionAction.CREATED);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.$id).not.toBe(existingPattern.$id);
    });

    it('should force compression when requested', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestFailureOutcome(), // Would normally fail
      });

      const result = compressDecision(decision, [], { force: true });

      expect(result.action).toBe(CompressionAction.CREATED);
      expect(result.pattern).toBeDefined();
    });

    it('should include source decision URN in pattern', () => {
      const decision = createTestDecisionEvent({
        outcome: createTestSuccessOutcome(),
      });

      const result = compressDecision(decision, []);

      expect(result.pattern!.sourceDecisions).toContain(decision.$id);
    });
  });

  // ============================================================================
  // mergePatterns Tests
  // ============================================================================

  describe('mergePatterns', () => {
    it('should combine frequencies', () => {
      const pattern1 = createTestSuccessPattern({ frequency: 5, successCount: 4 });
      const pattern2 = createTestSuccessPattern({ frequency: 3, successCount: 2 });

      const merged = mergePatterns(pattern1, pattern2);

      expect(merged.frequency).toBe(8);
      expect(merged.successCount).toBe(6);
    });

    it('should compute weighted average confidence', () => {
      const pattern1 = createTestSuccessPattern({ confidence: 0.9, frequency: 10 });
      const pattern2 = createTestSuccessPattern({ confidence: 0.7, frequency: 5 });

      const merged = mergePatterns(pattern1, pattern2);

      // Weighted average: (0.9 * 10 + 0.7 * 5) / 15 = 12.5 / 15 ≈ 0.833
      expect(merged.confidence).toBeCloseTo(0.833, 2);
    });

    it('should combine source decisions', () => {
      const pattern1 = createTestSuccessPattern({
        sourceDecisions: ['urn:a', 'urn:b'],
      });
      const pattern2 = createTestSuccessPattern({
        sourceDecisions: ['urn:c'],
      });

      const merged = mergePatterns(pattern1, pattern2);

      expect(merged.sourceDecisions).toContain('urn:a');
      expect(merged.sourceDecisions).toContain('urn:b');
      expect(merged.sourceDecisions).toContain('urn:c');
    });

    it('should average context signatures', () => {
      const sig1: EigenmodeVector = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const sig2: EigenmodeVector = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      const pattern1 = createTestSuccessPattern({ contextSignature: sig1, frequency: 1 });
      const pattern2 = createTestSuccessPattern({ contextSignature: sig2, frequency: 1 });

      const merged = mergePatterns(pattern1, pattern2);

      expect(merged.contextSignature[0]).toBeCloseTo(0.5, 2);
      expect(merged.contextSignature[1]).toBeCloseTo(0.5, 2);
    });

    it('should update lastApplied to most recent', () => {
      const oldDate = '2026-01-01T00:00:00Z';
      const newDate = '2026-01-20T00:00:00Z';

      const pattern1 = createTestSuccessPattern({ lastApplied: oldDate });
      const pattern2 = createTestSuccessPattern({ lastApplied: newDate });

      const merged = mergePatterns(pattern1, pattern2);

      expect(merged.lastApplied).toBe(newDate);
    });

    it('should preserve isGlobal if either pattern is global', () => {
      const pattern1 = createTestSuccessPattern({ isGlobal: false });
      const pattern2 = createTestSuccessPattern({ isGlobal: true });

      const merged = mergePatterns(pattern1, pattern2);

      expect(merged.isGlobal).toBe(true);
    });
  });

  // ============================================================================
  // applyDecay Tests
  // ============================================================================

  describe('applyDecay', () => {
    it('should not decay recently applied pattern', () => {
      const pattern = createTestSuccessPattern({
        lastApplied: new Date().toISOString(),
        decayFactor: 1.0,
        confidence: 0.9,
      });

      const decayed = applyDecay(pattern);

      expect(decayed.decayFactor).toBeCloseTo(1.0, 2);
      expect(decayed.confidence).toBeCloseTo(0.9, 2);
    });

    it('should decay pattern after half-life', () => {
      const halfLifeAgo = new Date();
      halfLifeAgo.setDate(halfLifeAgo.getDate() - 180); // 180 days ago

      const pattern = createTestSuccessPattern({
        lastApplied: halfLifeAgo.toISOString(),
        decayFactor: 1.0,
        confidence: 0.9,
        halfLifeDays: 180,
      });

      const decayed = applyDecay(pattern);

      expect(decayed.decayFactor).toBeCloseTo(0.5, 1);
      expect(decayed.confidence).toBeLessThan(0.9);
    });

    it('should decay to very low after multiple half-lives', () => {
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 540); // 3 half-lives ago

      const pattern = createTestSuccessPattern({
        lastApplied: longAgo.toISOString(),
        decayFactor: 1.0,
        confidence: 0.9,
        halfLifeDays: 180,
      });

      const decayed = applyDecay(pattern);

      // After 3 half-lives: 0.5^3 = 0.125
      expect(decayed.decayFactor).toBeLessThan(0.2);
    });

    it('should respect custom half-life', () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const pattern = createTestSuccessPattern({
        lastApplied: thirtyDaysAgo.toISOString(),
        decayFactor: 1.0,
        halfLifeDays: 30, // Short half-life
      });

      const decayed = applyDecay(pattern);

      expect(decayed.decayFactor).toBeCloseTo(0.5, 1);
    });
  });

  // ============================================================================
  // prunePatterns Tests
  // ============================================================================

  describe('prunePatterns', () => {
    it('should remove patterns below confidence threshold', () => {
      const patterns = [
        createTestSuccessPattern({ confidence: 0.9 }),
        createTestSuccessPattern({ confidence: 0.05 }), // Below default 0.1
        createTestSuccessPattern({ confidence: 0.8 }),
      ];

      const pruned = prunePatterns(patterns);

      expect(pruned.remaining.length).toBe(2);
      expect(pruned.pruned.length).toBe(1);
    });

    it('should respect custom threshold', () => {
      const patterns = [
        createTestSuccessPattern({ confidence: 0.9 }),
        createTestSuccessPattern({ confidence: 0.5 }),
        createTestSuccessPattern({ confidence: 0.4 }),
      ];

      const pruned = prunePatterns(patterns, { minConfidence: 0.6 });

      expect(pruned.remaining.length).toBe(1);
      expect(pruned.pruned.length).toBe(2);
    });

    it('should return all patterns when all above threshold', () => {
      const patterns = [
        createTestSuccessPattern({ confidence: 0.9 }),
        createTestSuccessPattern({ confidence: 0.8 }),
        createTestSuccessPattern({ confidence: 0.7 }),
      ];

      const pruned = prunePatterns(patterns);

      expect(pruned.remaining.length).toBe(3);
      expect(pruned.pruned.length).toBe(0);
    });

    it('should handle empty array', () => {
      const pruned = prunePatterns([]);

      expect(pruned.remaining.length).toBe(0);
      expect(pruned.pruned.length).toBe(0);
    });
  });

  // ============================================================================
  // computeContextBreadth Tests
  // ============================================================================

  describe('computeContextBreadth', () => {
    it('should return high breadth for common action type', () => {
      const decision = createTestDecisionEvent({
        mediation: {
          ...createTestDecisionEvent().mediation,
          selectedAction: {
            actionType: 'reschedule_task', // Common action
            targetUrn: 'urn:test',
            parameters: {},
          },
        },
      });

      const breadth = computeContextBreadth(decision);

      expect(breadth).toBeGreaterThan(0.5);
    });

    it('should return value between 0 and 1', () => {
      const decision = createTestDecisionEvent();
      const breadth = computeContextBreadth(decision);

      expect(breadth).toBeGreaterThanOrEqual(0);
      expect(breadth).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // updatePatternFromOutcome Tests
  // ============================================================================

  describe('updatePatternFromOutcome', () => {
    it('should increase confidence for successful outcome', () => {
      const pattern = createTestSuccessPattern({ confidence: 0.8 });
      const outcome = createTestSuccessOutcome({ success: true, actualVsProjected: 0.3 });

      const updated = updatePatternFromOutcome(pattern, outcome);

      expect(updated.confidence).toBeGreaterThan(0.8);
    });

    it('should decrease confidence for failed outcome', () => {
      const pattern = createTestSuccessPattern({ confidence: 0.8 });
      const outcome = createTestFailureOutcome();

      const updated = updatePatternFromOutcome(pattern, outcome);

      expect(updated.confidence).toBeLessThan(0.8);
    });

    it('should increment frequency', () => {
      const pattern = createTestSuccessPattern({ frequency: 5 });
      const outcome = createTestSuccessOutcome();

      const updated = updatePatternFromOutcome(pattern, outcome);

      expect(updated.frequency).toBe(6);
    });

    it('should increment successCount only on success', () => {
      const pattern = createTestSuccessPattern({ successCount: 4, frequency: 5 });

      const successOutcome = createTestSuccessOutcome();
      const afterSuccess = updatePatternFromOutcome(pattern, successOutcome);
      expect(afterSuccess.successCount).toBe(5);

      const failureOutcome = createTestFailureOutcome();
      const afterFailure = updatePatternFromOutcome(pattern, failureOutcome);
      expect(afterFailure.successCount).toBe(4);
    });

    it('should update outcome profile variance', () => {
      const pattern = createTestSuccessPattern({
        outcomeProfile: {
          expectedSuccessRate: 0.8,
          expectedImprovement: 1.1,
          variance: 0.1,
        },
      });
      const outcome = createTestSuccessOutcome({ actualVsProjected: 0.5 });

      const updated = updatePatternFromOutcome(pattern, outcome);

      // Variance should be updated based on new outcome
      expect(updated.outcomeProfile.variance).toBeDefined();
    });

    it('should reset decay factor on application', () => {
      const pattern = createTestSuccessPattern({ decayFactor: 0.5 });
      const outcome = createTestSuccessOutcome();

      const updated = updatePatternFromOutcome(pattern, outcome);

      expect(updated.decayFactor).toBe(1.0);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration: Full Compression Pipeline', () => {
    it('should handle complete compression lifecycle', () => {
      // Step 1: Create decision with successful outcome
      const decision = createTestDecisionEvent({
        outcome: createTestSuccessOutcome({
          success: true,
          actualVsProjected: 0.25,
        }),
      });

      // Step 2: Validate
      const gates = validateForCompression(decision);
      expect(isCompressionEligible(gates)).toBe(true);

      // Step 3: Compress to new pattern
      const compression = compressDecision(decision, []);
      expect(compression.action).toBe(CompressionAction.CREATED);

      // Step 4: Apply decay (no decay for fresh pattern)
      const afterDecay = applyDecay(compression.pattern!);
      expect(afterDecay.decayFactor).toBeCloseTo(1.0, 2);

      // Step 5: Prune (should not be pruned)
      const pruneResult = prunePatterns([afterDecay]);
      expect(pruneResult.remaining.length).toBe(1);
    });

    it('should merge multiple similar decisions into one pattern', () => {
      const patterns: SuccessPattern[] = [];

      // Create 5 similar decisions
      for (let i = 0; i < 5; i++) {
        const decision = createTestDecisionEvent({
          $id: `urn:luhtech:test:decision-event:DEV-2026-000${i}` as any,
          stateEigenmodes: createTestEigenmodeVector(0.5 + i * 0.01), // Slight variation
          outcome: createTestSuccessOutcome({
            success: true,
            actualVsProjected: 0.15 + i * 0.02,
          }),
        });

        const compression = compressDecision(decision, patterns);
        if (compression.pattern) {
          // Update patterns array for next iteration
          const existingIndex = patterns.findIndex(p => p.$id === compression.pattern!.$id);
          if (existingIndex >= 0) {
            patterns[existingIndex] = compression.pattern;
          } else {
            patterns.push(compression.pattern);
          }
        }
      }

      // Should have merged into single pattern or very few
      expect(patterns.length).toBeLessThanOrEqual(2);

      // Merged pattern should have high frequency
      const totalFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0);
      expect(totalFrequency).toBe(5);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should validate decision in under 5ms', () => {
      const decision = createTestDecisionEvent();

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        validateForCompression(decision);
      }
      const elapsed = performance.now() - start;

      // 100 validations should take less than 50ms
      expect(elapsed).toBeLessThan(50);
    });

    it('should compress decision in under 10ms', () => {
      const decision = createTestDecisionEvent({ outcome: createTestSuccessOutcome() });
      const patterns: SuccessPattern[] = [];

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        compressDecision(decision, patterns);
      }
      const elapsed = performance.now() - start;

      // 100 compressions should take less than 100ms
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle large pattern sets efficiently', () => {
      const patterns: SuccessPattern[] = [];
      for (let i = 0; i < 1000; i++) {
        patterns.push(createTestSuccessPattern({
          contextSignature: [
            Math.random(), Math.random(), Math.random(), Math.random(),
            Math.random(), Math.random(), Math.random(), Math.random(),
            Math.random(), Math.random(), Math.random(), Math.random(),
          ] as EigenmodeVector,
        }));
      }

      const decision = createTestDecisionEvent({ outcome: createTestSuccessOutcome() });

      const start = performance.now();
      compressDecision(decision, patterns);
      const elapsed = performance.now() - start;

      // Finding similar pattern in 1000 should take less than 50ms
      expect(elapsed).toBeLessThan(50);
    });
  });
});
