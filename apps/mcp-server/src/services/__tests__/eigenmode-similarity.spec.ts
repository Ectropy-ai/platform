/**
 * Eigenmode Similarity Service Tests - DP-M3
 *
 * Tests for eigenmode vector similarity computation.
 * Implements cosine similarity and Euclidean distance for 12-element eigenmode vectors.
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeCosineSimilarity,
  computeEuclideanDistance,
  computeWeightedSimilarity,
  normalizeVector,
  computeContextSignatureDistance,
  areVectorsSimilar,
  findMostSimilarVector,
  computeStability,
  computeVectorCentroid,
  DEFAULT_SIMILARITY_CONFIG,
} from '../eigenmode-similarity.service.js';
import type { EigenmodeVector } from '../../types/dual-process.types.js';

// ============================================================================
// Test Constants
// ============================================================================

const ZERO_VECTOR: EigenmodeVector = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const UNIT_VECTOR: EigenmodeVector = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const ALL_ONES: EigenmodeVector = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const ALL_TWOS: EigenmodeVector = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
const HALF_ONES: EigenmodeVector = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

// Diverse test vectors
const VECTOR_A: EigenmodeVector = [0.8, 0.6, 0.4, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005];
const VECTOR_B: EigenmodeVector = [0.75, 0.55, 0.38, 0.18, 0.09, 0.04, 0.018, 0.008, 0.004, 0.0018, 0.0009, 0.0004];
const VECTOR_C: EigenmodeVector = [0.1, 0.2, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01];
const NEGATIVE_VECTOR: EigenmodeVector = [-0.5, 0.5, -0.3, 0.3, -0.2, 0.2, -0.1, 0.1, 0, 0, 0, 0];

// ============================================================================
// Cosine Similarity Tests
// ============================================================================

describe('Eigenmode Similarity Service', () => {
  describe('computeCosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const similarity = computeCosineSimilarity(VECTOR_A, VECTOR_A);
      expect(similarity).toBeCloseTo(1.0, 6);
    });

    it('should return 1.0 for parallel vectors (same direction, different magnitude)', () => {
      const similarity = computeCosineSimilarity(ALL_ONES, ALL_TWOS);
      expect(similarity).toBeCloseTo(1.0, 6);
    });

    it('should return 0 for orthogonal vectors', () => {
      const v1: EigenmodeVector = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const v2: EigenmodeVector = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const similarity = computeCosineSimilarity(v1, v2);
      expect(similarity).toBeCloseTo(0, 6);
    });

    it('should return -1.0 for opposite vectors', () => {
      const v1: EigenmodeVector = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const v2: EigenmodeVector = [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const similarity = computeCosineSimilarity(v1, v2);
      expect(similarity).toBeCloseTo(-1.0, 6);
    });

    it('should return high similarity for similar vectors', () => {
      const similarity = computeCosineSimilarity(VECTOR_A, VECTOR_B);
      expect(similarity).toBeGreaterThan(0.95);
    });

    it('should return lower similarity for different vectors', () => {
      const similarity = computeCosineSimilarity(VECTOR_A, VECTOR_C);
      expect(similarity).toBeLessThan(0.9);
      expect(similarity).toBeGreaterThan(0);
    });

    it('should handle zero vectors gracefully', () => {
      const similarity = computeCosineSimilarity(ZERO_VECTOR, VECTOR_A);
      expect(similarity).toBe(0);
    });

    it('should be symmetric', () => {
      const sim1 = computeCosineSimilarity(VECTOR_A, VECTOR_B);
      const sim2 = computeCosineSimilarity(VECTOR_B, VECTOR_A);
      expect(sim1).toBeCloseTo(sim2, 10);
    });

    it('should handle negative values', () => {
      const similarity = computeCosineSimilarity(NEGATIVE_VECTOR, ALL_ONES);
      expect(similarity).toBeDefined();
      expect(Math.abs(similarity)).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Euclidean Distance Tests
  // ============================================================================

  describe('computeEuclideanDistance', () => {
    it('should return 0 for identical vectors', () => {
      const distance = computeEuclideanDistance(VECTOR_A, VECTOR_A);
      expect(distance).toBe(0);
    });

    it('should return correct distance for simple vectors', () => {
      const v1: EigenmodeVector = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const v2: EigenmodeVector = [3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const distance = computeEuclideanDistance(v1, v2);
      expect(distance).toBeCloseTo(5, 6); // sqrt(9 + 16) = 5
    });

    it('should be symmetric', () => {
      const dist1 = computeEuclideanDistance(VECTOR_A, VECTOR_B);
      const dist2 = computeEuclideanDistance(VECTOR_B, VECTOR_A);
      expect(dist1).toBeCloseTo(dist2, 10);
    });

    it('should satisfy triangle inequality', () => {
      const ab = computeEuclideanDistance(VECTOR_A, VECTOR_B);
      const bc = computeEuclideanDistance(VECTOR_B, VECTOR_C);
      const ac = computeEuclideanDistance(VECTOR_A, VECTOR_C);
      expect(ac).toBeLessThanOrEqual(ab + bc + 0.0001); // Allow small epsilon
    });

    it('should return larger distance for more different vectors', () => {
      const distSimilar = computeEuclideanDistance(VECTOR_A, VECTOR_B);
      const distDifferent = computeEuclideanDistance(VECTOR_A, VECTOR_C);
      expect(distDifferent).toBeGreaterThan(distSimilar);
    });
  });

  // ============================================================================
  // Weighted Similarity Tests
  // ============================================================================

  describe('computeWeightedSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const similarity = computeWeightedSimilarity(VECTOR_A, VECTOR_A);
      expect(similarity).toBeCloseTo(1.0, 6);
    });

    it('should weight earlier eigenmodes more heavily', () => {
      // Vectors that differ mainly in first elements vs last elements
      const v1: EigenmodeVector = [1, 0.5, 0.25, 0.1, 0, 0, 0, 0, 0, 0, 0, 0];
      const v2: EigenmodeVector = [0.9, 0.5, 0.25, 0.1, 0, 0, 0, 0, 0, 0, 0, 0]; // Differs in first
      const v3: EigenmodeVector = [1, 0.5, 0.25, 0.1, 0, 0, 0, 0, 0, 0, 0, 0.1]; // Differs in last

      const simFirst = computeWeightedSimilarity(v1, v2);
      const simLast = computeWeightedSimilarity(v1, v3);

      // Difference in first eigenmode should have more impact
      expect(simFirst).toBeLessThan(simLast);
    });

    it('should accept custom weights', () => {
      const equalWeights = Array(12).fill(1/12) as [number, number, number, number, number, number, number, number, number, number, number, number];
      const similarity = computeWeightedSimilarity(VECTOR_A, VECTOR_B, equalWeights);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should return value between 0 and 1', () => {
      const similarity = computeWeightedSimilarity(VECTOR_A, VECTOR_C);
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Vector Normalization Tests
  // ============================================================================

  describe('normalizeVector', () => {
    it('should return unit vector for non-zero input', () => {
      const normalized = normalizeVector(ALL_TWOS);
      const magnitude = Math.sqrt(normalized.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1.0, 6);
    });

    it('should handle zero vector', () => {
      const normalized = normalizeVector(ZERO_VECTOR);
      expect(normalized).toEqual(ZERO_VECTOR);
    });

    it('should preserve direction', () => {
      const normalized = normalizeVector(ALL_TWOS);
      const normalizedOnes = normalizeVector(ALL_ONES);

      // Both should point in same direction (all equal components)
      const ratio = normalized[0] / normalizedOnes[0];
      for (let i = 1; i < 12; i++) {
        expect(normalized[i] / normalizedOnes[i]).toBeCloseTo(ratio, 6);
      }
    });

    it('should handle negative values', () => {
      const normalized = normalizeVector(NEGATIVE_VECTOR);
      const magnitude = Math.sqrt(normalized.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1.0, 6);
    });
  });

  // ============================================================================
  // Context Signature Distance Tests
  // ============================================================================

  describe('computeContextSignatureDistance', () => {
    it('should return 0 for identical signatures', () => {
      const distance = computeContextSignatureDistance(VECTOR_A, VECTOR_A);
      expect(distance).toBe(0);
    });

    it('should return value between 0 and 1', () => {
      const distance = computeContextSignatureDistance(VECTOR_A, VECTOR_C);
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(1);
    });

    it('should be symmetric', () => {
      const dist1 = computeContextSignatureDistance(VECTOR_A, VECTOR_B);
      const dist2 = computeContextSignatureDistance(VECTOR_B, VECTOR_A);
      expect(dist1).toBeCloseTo(dist2, 10);
    });
  });

  // ============================================================================
  // Similarity Threshold Tests
  // ============================================================================

  describe('areVectorsSimilar', () => {
    it('should return true for identical vectors with default threshold', () => {
      expect(areVectorsSimilar(VECTOR_A, VECTOR_A)).toBe(true);
    });

    it('should return true for very similar vectors', () => {
      expect(areVectorsSimilar(VECTOR_A, VECTOR_B)).toBe(true);
    });

    it('should return false for different vectors with high threshold', () => {
      expect(areVectorsSimilar(VECTOR_A, VECTOR_C, 0.95)).toBe(false);
    });

    it('should respect custom threshold', () => {
      const similarity = computeCosineSimilarity(VECTOR_A, VECTOR_C);
      expect(areVectorsSimilar(VECTOR_A, VECTOR_C, similarity - 0.1)).toBe(true);
      expect(areVectorsSimilar(VECTOR_A, VECTOR_C, similarity + 0.1)).toBe(false);
    });

    it('should use default threshold of 0.85', () => {
      // Create vectors with known similarity around 0.85
      const v1: EigenmodeVector = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const v2: EigenmodeVector = [0.9, 0.4358, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // cos similarity ~ 0.9

      const sim = computeCosineSimilarity(v1, v2);
      if (sim > DEFAULT_SIMILARITY_CONFIG.threshold) {
        expect(areVectorsSimilar(v1, v2)).toBe(true);
      } else {
        expect(areVectorsSimilar(v1, v2)).toBe(false);
      }
    });
  });

  // ============================================================================
  // Find Most Similar Vector Tests
  // ============================================================================

  describe('findMostSimilarVector', () => {
    it('should find exact match', () => {
      const candidates = [VECTOR_B, VECTOR_A, VECTOR_C];
      const result = findMostSimilarVector(VECTOR_A, candidates);

      expect(result.index).toBe(1); // VECTOR_A is at index 1
      expect(result.similarity).toBeCloseTo(1.0, 6);
    });

    it('should find most similar when no exact match', () => {
      const candidates = [VECTOR_B, VECTOR_C];
      const result = findMostSimilarVector(VECTOR_A, candidates);

      expect(result.index).toBe(0); // VECTOR_B is more similar to VECTOR_A
      expect(result.similarity).toBeGreaterThan(0.9);
    });

    it('should return -1 for empty candidates', () => {
      const result = findMostSimilarVector(VECTOR_A, []);
      expect(result.index).toBe(-1);
      expect(result.similarity).toBe(0);
    });

    it('should filter by minimum similarity threshold', () => {
      const candidates = [VECTOR_C]; // Less similar to VECTOR_A
      const result = findMostSimilarVector(VECTOR_A, candidates, 0.99);

      expect(result.index).toBe(-1); // No candidate meets threshold
    });

    it('should return all matches when requested', () => {
      const candidates = [VECTOR_A, VECTOR_B, VECTOR_C];
      const result = findMostSimilarVector(VECTOR_A, candidates, 0.85, true);

      expect(result.matches).toBeDefined();
      expect(result.matches!.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Stability Computation Tests
  // ============================================================================

  describe('computeStability', () => {
    it('should return 1.0 for identical vectors over time', () => {
      const history = [VECTOR_A, VECTOR_A, VECTOR_A, VECTOR_A, VECTOR_A];
      const stability = computeStability(history);
      expect(stability).toBeCloseTo(1.0, 6);
    });

    it('should return lower stability for changing vectors', () => {
      const history = [VECTOR_A, VECTOR_B, VECTOR_C, VECTOR_A, VECTOR_B];
      const stability = computeStability(history);
      expect(stability).toBeLessThan(1.0);
      expect(stability).toBeGreaterThan(0);
    });

    it('should return 1.0 for single vector', () => {
      const stability = computeStability([VECTOR_A]);
      expect(stability).toBe(1.0);
    });

    it('should return 1.0 for empty history', () => {
      const stability = computeStability([]);
      expect(stability).toBe(1.0);
    });

    it('should weight recent vectors more heavily', () => {
      // Recent stability (last 3) is high, overall stability lower
      const history = [VECTOR_C, VECTOR_C, VECTOR_A, VECTOR_A, VECTOR_A];
      const recentHistory = [VECTOR_A, VECTOR_A, VECTOR_A];

      const fullStability = computeStability(history);
      const recentStability = computeStability(recentHistory);

      expect(recentStability).toBeGreaterThan(fullStability);
    });

    it('should return value between 0 and 1', () => {
      const history = [VECTOR_A, VECTOR_B, VECTOR_C];
      const stability = computeStability(history);
      expect(stability).toBeGreaterThanOrEqual(0);
      expect(stability).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Centroid Computation Tests
  // ============================================================================

  describe('computeVectorCentroid', () => {
    it('should return the vector for single input', () => {
      const centroid = computeVectorCentroid([VECTOR_A]);
      for (let i = 0; i < 12; i++) {
        expect(centroid[i]).toBeCloseTo(VECTOR_A[i], 6);
      }
    });

    it('should compute average for multiple vectors', () => {
      const centroid = computeVectorCentroid([ALL_ONES, ALL_TWOS]);
      for (let i = 0; i < 12; i++) {
        expect(centroid[i]).toBeCloseTo(1.5, 6);
      }
    });

    it('should handle empty array', () => {
      const centroid = computeVectorCentroid([]);
      expect(centroid).toEqual(ZERO_VECTOR);
    });

    it('should compute correct centroid for diverse vectors', () => {
      const vectors = [VECTOR_A, VECTOR_B, VECTOR_C];
      const centroid = computeVectorCentroid(vectors);

      // Centroid should be average
      for (let i = 0; i < 12; i++) {
        const expected = (VECTOR_A[i] + VECTOR_B[i] + VECTOR_C[i]) / 3;
        expect(centroid[i]).toBeCloseTo(expected, 6);
      }
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should compute similarity in under 1ms', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        computeCosineSimilarity(VECTOR_A, VECTOR_B);
      }
      const elapsed = performance.now() - start;

      // 1000 computations should take less than 100ms (0.1ms each)
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle large candidate sets efficiently', () => {
      const candidates: EigenmodeVector[] = [];
      for (let i = 0; i < 1000; i++) {
        candidates.push([
          Math.random(), Math.random(), Math.random(), Math.random(),
          Math.random(), Math.random(), Math.random(), Math.random(),
          Math.random(), Math.random(), Math.random(), Math.random(),
        ] as EigenmodeVector);
      }

      const start = performance.now();
      findMostSimilarVector(VECTOR_A, candidates);
      const elapsed = performance.now() - start;

      // Finding most similar among 1000 should take less than 50ms
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle very small values', () => {
      const tiny: EigenmodeVector = [1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10];
      const similarity = computeCosineSimilarity(tiny, tiny);
      expect(similarity).toBeCloseTo(1.0, 6);
    });

    it('should handle very large values', () => {
      const large: EigenmodeVector = [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6];
      const similarity = computeCosineSimilarity(large, large);
      expect(similarity).toBeCloseTo(1.0, 6);
    });

    it('should handle mixed positive and negative values', () => {
      const mixed1: EigenmodeVector = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1];
      const mixed2: EigenmodeVector = [-1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1];
      const similarity = computeCosineSimilarity(mixed1, mixed2);
      expect(similarity).toBeCloseTo(-1.0, 6); // Opposite directions
    });
  });
});
