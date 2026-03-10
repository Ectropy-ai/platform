/**
 * Embedding Client Unit Tests
 *
 * Tests for Jina embeddings client including similarity calculations
 * and fallback embedding generation.
 *
 * @module tests/unit/rag/embedding-client.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isEmbeddingConfigured,
  getEmbeddingConfig,
  cosineSimilarity,
  euclideanDistance,
  findTopKSimilar,
  generateFallbackEmbedding,
} from '../../../services/rag/embedding-client.js';

// ============================================================================
// Configuration Tests
// ============================================================================

describe('isEmbeddingConfigured', () => {
  it('should return a boolean', () => {
    const result = isEmbeddingConfigured();
    expect(typeof result).toBe('boolean');
  });
});

describe('getEmbeddingConfig', () => {
  it('should return config without API key', () => {
    const config = getEmbeddingConfig();
    expect(config).not.toHaveProperty('apiKey');
  });

  it('should have provider as jina', () => {
    const config = getEmbeddingConfig();
    expect(config.provider).toBe('jina');
  });

  it('should have correct dimensions', () => {
    const config = getEmbeddingConfig();
    expect(config.dimensions).toBe(768);
  });

  it('should have a batch size', () => {
    const config = getEmbeddingConfig();
    expect(typeof config.batchSize).toBe('number');
    expect(config.batchSize).toBeGreaterThan(0);
  });

  it('should have a base URL', () => {
    const config = getEmbeddingConfig();
    expect(config.baseUrl).toBeTruthy();
    expect(config.baseUrl).toContain('jina');
  });
});

// ============================================================================
// Cosine Similarity Tests
// ============================================================================

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vector = [1, 2, 3, 4, 5];
    const similarity = cosineSimilarity(vector, vector);
    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1, 5);
  });

  it('should throw error for vectors of different lengths', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow('Vectors must have the same length');
  });

  it('should return 0 for zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });

  it('should handle normalized vectors correctly', () => {
    const a = [0.6, 0.8, 0];
    const b = [0, 0.6, 0.8];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0.48, 5);
  });

  it('should be symmetric', () => {
    const a = [1, 2, 3, 4];
    const b = [5, 6, 7, 8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});

// ============================================================================
// Euclidean Distance Tests
// ============================================================================

describe('euclideanDistance', () => {
  it('should return 0 for identical vectors', () => {
    const vector = [1, 2, 3, 4, 5];
    const distance = euclideanDistance(vector, vector);
    expect(distance).toBe(0);
  });

  it('should calculate correct distance for simple vectors', () => {
    const a = [0, 0, 0];
    const b = [3, 4, 0];
    const distance = euclideanDistance(a, b);
    expect(distance).toBe(5);
  });

  it('should throw error for vectors of different lengths', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => euclideanDistance(a, b)).toThrow('Vectors must have the same length');
  });

  it('should be symmetric', () => {
    const a = [1, 2, 3, 4];
    const b = [5, 6, 7, 8];
    expect(euclideanDistance(a, b)).toBe(euclideanDistance(b, a));
  });

  it('should handle negative values', () => {
    const a = [-1, -2, -3];
    const b = [1, 2, 3];
    const distance = euclideanDistance(a, b);
    expect(distance).toBeGreaterThan(0);
  });

  it('should calculate correct distance for 2D vectors', () => {
    const a = [0, 0];
    const b = [1, 1];
    const distance = euclideanDistance(a, b);
    expect(distance).toBeCloseTo(Math.sqrt(2), 5);
  });
});

// ============================================================================
// Find Top K Similar Tests
// ============================================================================

describe('findTopKSimilar', () => {
  const testVectors = [
    { id: 'vec1', vector: [1, 0, 0] },
    { id: 'vec2', vector: [0, 1, 0] },
    { id: 'vec3', vector: [0, 0, 1] },
    { id: 'vec4', vector: [0.9, 0.1, 0] },
    { id: 'vec5', vector: [0.8, 0.2, 0] },
  ];

  it('should return top K most similar vectors', () => {
    const queryVector = [1, 0, 0];
    const results = findTopKSimilar(queryVector, testVectors, 3);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('vec1'); // Exact match
  });

  it('should return results sorted by score descending', () => {
    const queryVector = [1, 0, 0];
    const results = findTopKSimilar(queryVector, testVectors, 5);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('should handle K larger than vector count', () => {
    const queryVector = [1, 0, 0];
    const results = findTopKSimilar(queryVector, testVectors, 10);

    expect(results).toHaveLength(5);
  });

  it('should return empty array for empty vector list', () => {
    const queryVector = [1, 0, 0];
    const results = findTopKSimilar(queryVector, [], 3);

    expect(results).toHaveLength(0);
  });

  it('should handle K of 1', () => {
    const queryVector = [1, 0, 0];
    const results = findTopKSimilar(queryVector, testVectors, 1);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('vec1');
  });

  it('should include similarity scores', () => {
    const queryVector = [1, 0, 0];
    const results = findTopKSimilar(queryVector, testVectors, 3);

    for (const result of results) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('score');
      expect(typeof result.score).toBe('number');
    }
  });
});

// ============================================================================
// Fallback Embedding Tests
// ============================================================================

describe('generateFallbackEmbedding', () => {
  it('should return embedding of correct dimensions', () => {
    const embedding = generateFallbackEmbedding('test text');
    expect(embedding).toHaveLength(768);
  });

  it('should return normalized embedding', () => {
    const embedding = generateFallbackEmbedding('test text');

    // Calculate L2 norm
    let norm = 0;
    for (const val of embedding) {
      norm += val * val;
    }
    norm = Math.sqrt(norm);

    // Should be approximately 1 (normalized)
    expect(norm).toBeCloseTo(1, 3);
  });

  it('should be deterministic for same input', () => {
    const text = 'deterministic test';
    const embedding1 = generateFallbackEmbedding(text);
    const embedding2 = generateFallbackEmbedding(text);

    expect(embedding1).toEqual(embedding2);
  });

  it('should produce different embeddings for different inputs', () => {
    const embedding1 = generateFallbackEmbedding('text one');
    const embedding2 = generateFallbackEmbedding('text two');

    expect(embedding1).not.toEqual(embedding2);
  });

  it('should handle empty string', () => {
    const embedding = generateFallbackEmbedding('');
    expect(embedding).toHaveLength(768);
    // Empty string should produce all zeros
    const isAllZeros = embedding.every((v) => v === 0);
    expect(isAllZeros).toBe(true);
  });

  it('should handle long text', () => {
    const longText = 'word '.repeat(1000);
    const embedding = generateFallbackEmbedding(longText);
    expect(embedding).toHaveLength(768);
  });

  it('should handle unicode characters', () => {
    const embedding = generateFallbackEmbedding('Hello \u4e16\u754c \ud83d\ude80');
    expect(embedding).toHaveLength(768);
  });

  it('should produce similar embeddings for similar texts', () => {
    const embedding1 = generateFallbackEmbedding('the quick brown fox');
    const embedding2 = generateFallbackEmbedding('the quick brown dog');

    // They should be somewhat similar (same prefix)
    const similarity = cosineSimilarity(embedding1, embedding2);
    expect(similarity).toBeGreaterThan(0.5);
  });
});
