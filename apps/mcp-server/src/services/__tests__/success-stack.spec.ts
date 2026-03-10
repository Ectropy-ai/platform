/**
 * Success Stack Service Tests - DP-M3
 *
 * Tests for Engine 1 (Success Stack) pattern storage, retrieval, and management.
 * The Success Stack provides fast pattern-matching from validated decisions.
 *
 * Performance Targets:
 * - Pattern query: <50ms for 10^6 patterns
 * - Similarity matching with 0.85 threshold
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  querySuccessStack,
  getPatternDetails,
  storePattern,
  removePattern,
  updatePattern,
  decayAllPatterns,
  getRecommendedAction,
  computeOverallConfidence,
  rankPatternsByRelevance,
  SuccessStackService,
  setStackIdCounter,
  clearPatternStore,
} from '../success-stack.service.js';
import type {
  SuccessPattern,
  EigenmodeVector,
  Engine1Output,
  QuerySuccessStackInput,
} from '../../types/dual-process.types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestEigenmodeVector = (base = 0.5): EigenmodeVector => [
  base, base * 0.8, base * 0.6, base * 0.4,
  base * 0.3, base * 0.2, base * 0.15, base * 0.1,
  base * 0.08, base * 0.05, base * 0.03, base * 0.01
];

const createTestPattern = (partial?: Partial<SuccessPattern>): SuccessPattern => ({
  $id: `urn:luhtech:test:success-pattern:PAT-2026-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}` as any,
  contextSignature: createTestEigenmodeVector(),
  actionType: 'reschedule_task',
  actionTemplate: {
    type: 'reschedule_task',
    parameters: { delayDays: 2 },
    constraints: [],
  },
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

const TEST_PROJECT_ID = 'proj-test-001';

// ============================================================================
// Setup
// ============================================================================

describe('Success Stack Service', () => {
  beforeEach(() => {
    // Clear pattern store before each test
    clearPatternStore();
    setStackIdCounter(0);
  });

  // ============================================================================
  // Pattern Storage Tests
  // ============================================================================

  describe('storePattern', () => {
    it('should store a pattern successfully', () => {
      const pattern = createTestPattern();
      const result = storePattern(pattern);

      expect(result.success).toBe(true);
      expect(result.patternUrn).toBe(pattern.$id);
    });

    it('should reject duplicate pattern URN', () => {
      const pattern = createTestPattern();
      storePattern(pattern);
      const result = storePattern(pattern);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should validate pattern before storing', () => {
      const invalidPattern = createTestPattern({
        confidence: 1.5, // Invalid: > 1
      });

      const result = storePattern(invalidPattern);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should index pattern by project ID', () => {
      const pattern = createTestPattern({ projectId: TEST_PROJECT_ID });
      storePattern(pattern);

      const retrieved = getPatternDetails(pattern.$id);
      expect(retrieved?.projectId).toBe(TEST_PROJECT_ID);
    });
  });

  // ============================================================================
  // Pattern Retrieval Tests
  // ============================================================================

  describe('getPatternDetails', () => {
    it('should retrieve stored pattern by URN', () => {
      const pattern = createTestPattern();
      storePattern(pattern);

      const retrieved = getPatternDetails(pattern.$id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.$id).toBe(pattern.$id);
      expect(retrieved?.actionType).toBe(pattern.actionType);
    });

    it('should return undefined for non-existent pattern', () => {
      const retrieved = getPatternDetails('urn:luhtech:test:success-pattern:PAT-9999-9999' as any);

      expect(retrieved).toBeUndefined();
    });

    it('should include source decisions when requested', () => {
      const pattern = createTestPattern({
        sourceDecisions: ['urn:a', 'urn:b', 'urn:c'],
      });
      storePattern(pattern);

      const retrieved = getPatternDetails(pattern.$id, { includeSourceDecisions: true });

      expect(retrieved?.sourceDecisions).toHaveLength(3);
    });
  });

  // ============================================================================
  // Query Tests
  // ============================================================================

  describe('querySuccessStack', () => {
    beforeEach(() => {
      // Set up test patterns
      const patterns = [
        createTestPattern({
          $id: 'urn:luhtech:test:success-pattern:PAT-2026-0001' as any,
          contextSignature: createTestEigenmodeVector(0.5),
          actionType: 'reschedule_task',
          confidence: 0.9,
          projectId: TEST_PROJECT_ID,
        }),
        createTestPattern({
          $id: 'urn:luhtech:test:success-pattern:PAT-2026-0002' as any,
          contextSignature: createTestEigenmodeVector(0.52), // Very similar to first
          actionType: 'reschedule_task',
          confidence: 0.85,
          projectId: TEST_PROJECT_ID,
        }),
        createTestPattern({
          $id: 'urn:luhtech:test:success-pattern:PAT-2026-0003' as any,
          contextSignature: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Very different
          actionType: 'reallocate_resource',
          confidence: 0.8,
          projectId: TEST_PROJECT_ID,
        }),
        createTestPattern({
          $id: 'urn:luhtech:test:success-pattern:PAT-2026-0004' as any,
          contextSignature: createTestEigenmodeVector(0.48),
          actionType: 'reschedule_task',
          confidence: 0.7,
          isGlobal: true, // Global pattern
        }),
      ];

      patterns.forEach(p => storePattern(p));
    });

    it('should return patterns matching context signature', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
      };

      const result = await querySuccessStack(input);

      expect(result.applicablePatterns.length).toBeGreaterThan(0);
      expect(result.patternMatchScores.length).toBe(result.applicablePatterns.length);
    });

    it('should respect similarity threshold', async () => {
      // Clear and set up patterns with truly different context signatures
      clearPatternStore();

      // Pattern 1: exact match for query
      storePattern(createTestPattern({
        $id: 'urn:luhtech:test:success-pattern:PAT-2026-0101' as any,
        contextSignature: [0.5, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08, 0.06, 0.04, 0.03, 0.02, 0.01],
        projectId: TEST_PROJECT_ID,
      }));

      // Pattern 2: slightly different direction (should NOT match at 0.99)
      storePattern(createTestPattern({
        $id: 'urn:luhtech:test:success-pattern:PAT-2026-0102' as any,
        contextSignature: [0.5, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08, 0.06, 0.04, 0.03, 0.1, 0.2], // Different at end
        projectId: TEST_PROJECT_ID,
      }));

      // Pattern 3: very different direction (definitely won't match)
      storePattern(createTestPattern({
        $id: 'urn:luhtech:test:success-pattern:PAT-2026-0103' as any,
        contextSignature: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 0.99], // Opposite trend
        projectId: TEST_PROJECT_ID,
      }));

      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: [0.5, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08, 0.06, 0.04, 0.03, 0.02, 0.01], // Exact match for pattern 1
        similarityThreshold: 0.99, // Very high threshold
        includeGlobalPatterns: false, // Don't include global patterns
      };

      const result = await querySuccessStack(input);

      // Should only match exact or near-exact (pattern 1)
      expect(result.applicablePatterns.length).toBeLessThanOrEqual(1);
    });

    it('should filter by action type when specified', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
        actionType: 'reallocate_resource',
      };

      const result = await querySuccessStack(input);

      result.applicablePatterns.forEach(pattern => {
        expect(pattern.actionType).toBe('reallocate_resource');
      });
    });

    it('should include global patterns when requested', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
        includeGlobalPatterns: true,
      };

      const result = await querySuccessStack(input);

      const hasGlobal = result.applicablePatterns.some(p => p.isGlobal);
      expect(hasGlobal).toBe(true);
    });

    it('should exclude global patterns when not requested', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
        includeGlobalPatterns: false,
      };

      const result = await querySuccessStack(input);

      const hasGlobal = result.applicablePatterns.some(p => p.isGlobal);
      expect(hasGlobal).toBe(false);
    });

    it('should respect maxResults limit', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
        maxResults: 2,
      };

      const result = await querySuccessStack(input);

      expect(result.applicablePatterns.length).toBeLessThanOrEqual(2);
    });

    it('should sort results by combined relevance score', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
      };

      const result = await querySuccessStack(input);

      // Scores should be in descending order
      for (let i = 1; i < result.patternMatchScores.length; i++) {
        expect(result.patternMatchScores[i]).toBeLessThanOrEqual(result.patternMatchScores[i - 1]);
      }
    });

    it('should include query latency in result', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
      };

      const result = await querySuccessStack(input);

      expect(result.queryLatencyMs).toBeDefined();
      expect(result.queryLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should compute overall confidence', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
      };

      const result = await querySuccessStack(input);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return empty results for no matches', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Very different from all patterns
        similarityThreshold: 0.99,
      };

      const result = await querySuccessStack(input);

      expect(result.applicablePatterns.length).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should provide recommended action for best match', async () => {
      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
      };

      const result = await querySuccessStack(input);

      if (result.applicablePatterns.length > 0) {
        expect(result.recommendedAction).toBeDefined();
        expect(result.recommendedAction?.actionType).toBe(result.applicablePatterns[0].actionType);
      }
    });
  });

  // ============================================================================
  // Pattern Update Tests
  // ============================================================================

  describe('updatePattern', () => {
    it('should update existing pattern', () => {
      const pattern = createTestPattern();
      storePattern(pattern);

      const result = updatePattern(pattern.$id, { confidence: 0.95 });

      expect(result.success).toBe(true);

      const updated = getPatternDetails(pattern.$id);
      expect(updated?.confidence).toBe(0.95);
    });

    it('should fail for non-existent pattern', () => {
      const result = updatePattern(
        'urn:luhtech:test:success-pattern:PAT-9999-9999' as any,
        { confidence: 0.95 }
      );

      expect(result.success).toBe(false);
    });

    it('should update lastUpdated timestamp', () => {
      const oldDate = '2025-01-01T00:00:00Z';
      const pattern = createTestPattern({ lastUpdated: oldDate });
      storePattern(pattern);

      updatePattern(pattern.$id, { confidence: 0.95 });

      const updated = getPatternDetails(pattern.$id);
      expect(new Date(updated!.lastUpdated).getTime()).toBeGreaterThan(new Date(oldDate).getTime());
    });
  });

  // ============================================================================
  // Pattern Removal Tests
  // ============================================================================

  describe('removePattern', () => {
    it('should remove existing pattern', () => {
      const pattern = createTestPattern();
      storePattern(pattern);

      const result = removePattern(pattern.$id);

      expect(result.success).toBe(true);
      expect(getPatternDetails(pattern.$id)).toBeUndefined();
    });

    it('should fail for non-existent pattern', () => {
      const result = removePattern('urn:luhtech:test:success-pattern:PAT-9999-9999' as any);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Decay Tests
  // ============================================================================

  describe('decayAllPatterns', () => {
    it('should apply decay to all patterns', () => {
      // Store patterns with old lastApplied dates
      const halfLifeAgo = new Date();
      halfLifeAgo.setDate(halfLifeAgo.getDate() - 180);

      const pattern = createTestPattern({
        lastApplied: halfLifeAgo.toISOString(),
        confidence: 0.9,
        decayFactor: 1.0,
      });
      storePattern(pattern);

      const result = decayAllPatterns();

      expect(result.decayedCount).toBeGreaterThan(0);

      const updated = getPatternDetails(pattern.$id);
      expect(updated?.decayFactor).toBeLessThan(1.0);
    });

    it('should prune patterns below threshold', () => {
      const veryOld = new Date();
      veryOld.setDate(veryOld.getDate() - 720); // 4 half-lives

      const pattern = createTestPattern({
        lastApplied: veryOld.toISOString(),
        confidence: 0.2, // Low confidence + decay will drop below threshold
      });
      storePattern(pattern);

      const result = decayAllPatterns({ pruneThreshold: 0.1 });

      expect(result.prunedCount).toBeGreaterThan(0);
      expect(getPatternDetails(pattern.$id)).toBeUndefined();
    });

    it('should not decay recently applied patterns', () => {
      const pattern = createTestPattern({
        lastApplied: new Date().toISOString(),
        confidence: 0.9,
        decayFactor: 1.0,
      });
      storePattern(pattern);

      decayAllPatterns();

      const updated = getPatternDetails(pattern.$id);
      expect(updated?.decayFactor).toBeCloseTo(1.0, 1);
    });
  });

  // ============================================================================
  // Ranking Tests
  // ============================================================================

  describe('rankPatternsByRelevance', () => {
    it('should rank by combined similarity and confidence', () => {
      const patterns = [
        createTestPattern({ confidence: 0.9 }),
        createTestPattern({ confidence: 0.7 }),
        createTestPattern({ confidence: 0.95 }),
      ];

      const contextSignature = createTestEigenmodeVector(0.5);
      const ranked = rankPatternsByRelevance(patterns, contextSignature);

      // Higher confidence should rank higher for same similarity
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    });

    it('should return empty array for empty input', () => {
      const ranked = rankPatternsByRelevance([], createTestEigenmodeVector());
      expect(ranked).toHaveLength(0);
    });
  });

  // ============================================================================
  // Confidence Computation Tests
  // ============================================================================

  describe('computeOverallConfidence', () => {
    it('should return 0 for empty patterns', () => {
      const confidence = computeOverallConfidence([], []);
      expect(confidence).toBe(0);
    });

    it('should weight by similarity scores', () => {
      const patterns = [
        createTestPattern({ confidence: 0.9 }),
        createTestPattern({ confidence: 0.6 }),
      ];
      const scores = [0.95, 0.5]; // First is more similar

      const confidence = computeOverallConfidence(patterns, scores);

      // Should be weighted toward first pattern
      expect(confidence).toBeGreaterThan(0.7);
    });

    it('should return confidence between 0 and 1', () => {
      const patterns = [
        createTestPattern({ confidence: 0.9 }),
        createTestPattern({ confidence: 0.8 }),
      ];
      const scores = [0.9, 0.85];

      const confidence = computeOverallConfidence(patterns, scores);

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Recommended Action Tests
  // ============================================================================

  describe('getRecommendedAction', () => {
    it('should return action from highest confidence pattern', () => {
      const patterns = [
        createTestPattern({
          confidence: 0.95,
          actionTemplate: {
            type: 'best_action',
            parameters: { key: 'value1' },
            constraints: [],
          },
        }),
        createTestPattern({
          confidence: 0.7,
          actionTemplate: {
            type: 'worse_action',
            parameters: { key: 'value2' },
            constraints: [],
          },
        }),
      ];
      const scores = [0.9, 0.9]; // Same similarity

      const action = getRecommendedAction(patterns, scores);

      expect(action?.actionType).toBe('best_action');
    });

    it('should return undefined for empty patterns', () => {
      const action = getRecommendedAction([], []);
      expect(action).toBeUndefined();
    });

    it('should include estimated duration and cost if available', () => {
      const patterns = [
        createTestPattern({
          actionTemplate: {
            type: 'action',
            parameters: { estimatedHours: 4, estimatedCost: 1000 },
            constraints: [],
          },
        }),
      ];
      const scores = [0.9];

      const action = getRecommendedAction(patterns, scores);

      expect(action).toBeDefined();
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should query patterns in under 50ms for large sets', async () => {
      // Store 1000 patterns
      for (let i = 0; i < 1000; i++) {
        storePattern(createTestPattern({
          $id: `urn:luhtech:test:success-pattern:PAT-2026-${String(i).padStart(4, '0')}` as any,
          contextSignature: [
            Math.random(), Math.random(), Math.random(), Math.random(),
            Math.random(), Math.random(), Math.random(), Math.random(),
            Math.random(), Math.random(), Math.random(), Math.random(),
          ] as EigenmodeVector,
          projectId: TEST_PROJECT_ID,
        }));
      }

      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: createTestEigenmodeVector(0.5),
      };

      const start = performance.now();
      await querySuccessStack(input);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    it('should handle concurrent queries efficiently', async () => {
      // Store some patterns
      for (let i = 0; i < 100; i++) {
        storePattern(createTestPattern({
          $id: `urn:luhtech:test:success-pattern:PAT-2026-${String(i).padStart(4, '0')}` as any,
          projectId: TEST_PROJECT_ID,
        }));
      }

      const queries = Array(10).fill(null).map(() =>
        querySuccessStack({
          projectId: TEST_PROJECT_ID,
          contextSignature: createTestEigenmodeVector(Math.random()),
        })
      );

      const start = performance.now();
      await Promise.all(queries);
      const elapsed = performance.now() - start;

      // 10 concurrent queries should complete in under 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle zero vector context signature', async () => {
      storePattern(createTestPattern({ projectId: TEST_PROJECT_ID }));

      const input: QuerySuccessStackInput = {
        projectId: TEST_PROJECT_ID,
        contextSignature: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };

      const result = await querySuccessStack(input);

      // Should not crash
      expect(result).toBeDefined();
    });

    it('should handle pattern with all zero context', () => {
      const pattern = createTestPattern({
        contextSignature: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      });

      const result = storePattern(pattern);

      expect(result.success).toBe(true);
    });

    it('should handle empty project ID', async () => {
      const input: QuerySuccessStackInput = {
        projectId: '',
        contextSignature: createTestEigenmodeVector(),
      };

      const result = await querySuccessStack(input);

      // Should return empty results, not crash
      expect(result.applicablePatterns).toHaveLength(0);
    });
  });
});
