/**
 * Eigenmode Similarity Service - DP-M3
 *
 * Computes similarity between 12-element eigenmode vectors.
 * Foundation service for the Success Stack pattern matching system.
 *
 * Implements:
 * - Cosine similarity for directional comparison
 * - Euclidean distance for magnitude comparison
 * - Weighted similarity with eigenmode importance decay
 * - Stability computation over time windows
 *
 * @see .roadmap/features/dual-process-decision/FEATURE.json
 * @version 1.0.0
 */

import {
  DEFAULT_DUAL_PROCESS_CONFIG,
  type EigenmodeVector,
} from '../types/dual-process.types.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Similarity computation configuration
 */
export interface SimilarityConfig {
  threshold: number; // Default similarity threshold (0.85)
  weights: EigenmodeVector; // Eigenmode importance weights
  method: 'cosine' | 'euclidean' | 'weighted';
}

/**
 * Default eigenmode weights - earlier modes are more important
 * Based on typical PCA variance explained decay
 */
export const DEFAULT_EIGENMODE_WEIGHTS: EigenmodeVector = [
  0.25, // Eigenmode 1 - highest importance
  0.18, // Eigenmode 2
  0.13, // Eigenmode 3
  0.10, // Eigenmode 4
  0.08, // Eigenmode 5
  0.07, // Eigenmode 6
  0.06, // Eigenmode 7
  0.05, // Eigenmode 8
  0.04, // Eigenmode 9
  0.02, // Eigenmode 10
  0.01, // Eigenmode 11
  0.01, // Eigenmode 12 - lowest importance
];

/**
 * Default similarity configuration
 */
export const DEFAULT_SIMILARITY_CONFIG: SimilarityConfig = {
  threshold: DEFAULT_DUAL_PROCESS_CONFIG.patternSimilarityThreshold,
  weights: DEFAULT_EIGENMODE_WEIGHTS,
  method: 'cosine',
};

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result of finding most similar vector
 */
export interface SimilaritySearchResult {
  index: number;
  similarity: number;
  vector?: EigenmodeVector;
  matches?: Array<{
    index: number;
    similarity: number;
    vector: EigenmodeVector;
  }>;
}

// ============================================================================
// Core Similarity Functions
// ============================================================================

/**
 * Compute cosine similarity between two eigenmode vectors
 *
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 *
 * Range: [-1, 1] where:
 * - 1 = identical direction
 * - 0 = orthogonal
 * - -1 = opposite direction
 *
 * @param v1 - First eigenmode vector
 * @param v2 - Second eigenmode vector
 * @returns Cosine similarity value
 */
export function computeCosineSimilarity(
  v1: EigenmodeVector,
  v2: EigenmodeVector
): number {
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < 12; i++) {
    dotProduct += v1[i] * v2[i];
    magnitude1 += v1[i] * v1[i];
    magnitude2 += v2[i] * v2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  // Handle zero vectors
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Compute Euclidean distance between two eigenmode vectors
 *
 * Formula: d = √(Σ(a_i - b_i)²)
 *
 * @param v1 - First eigenmode vector
 * @param v2 - Second eigenmode vector
 * @returns Euclidean distance (0 = identical)
 */
export function computeEuclideanDistance(
  v1: EigenmodeVector,
  v2: EigenmodeVector
): number {
  let sumSquares = 0;

  for (let i = 0; i < 12; i++) {
    const diff = v1[i] - v2[i];
    sumSquares += diff * diff;
  }

  return Math.sqrt(sumSquares);
}

/**
 * Compute weighted similarity with eigenmode importance decay
 *
 * Earlier eigenmodes (which explain more variance) are weighted more heavily.
 * This reflects the fact that changes in primary eigenmodes are more significant.
 *
 * @param v1 - First eigenmode vector
 * @param v2 - Second eigenmode vector
 * @param weights - Optional custom weights (default: exponential decay)
 * @returns Weighted similarity (0-1)
 */
export function computeWeightedSimilarity(
  v1: EigenmodeVector,
  v2: EigenmodeVector,
  weights: EigenmodeVector = DEFAULT_EIGENMODE_WEIGHTS
): number {
  let weightedDotProduct = 0;
  let weightedMag1 = 0;
  let weightedMag2 = 0;

  for (let i = 0; i < 12; i++) {
    const w = weights[i];
    weightedDotProduct += w * v1[i] * v2[i];
    weightedMag1 += w * v1[i] * v1[i];
    weightedMag2 += w * v2[i] * v2[i];
  }

  weightedMag1 = Math.sqrt(weightedMag1);
  weightedMag2 = Math.sqrt(weightedMag2);

  // Handle zero vectors
  if (weightedMag1 === 0 || weightedMag2 === 0) {
    return 0;
  }

  // Convert cosine similarity to 0-1 range
  const cosineSim = weightedDotProduct / (weightedMag1 * weightedMag2);
  return (cosineSim + 1) / 2;
}

/**
 * Normalize a vector to unit length
 *
 * @param v - Input vector
 * @returns Normalized vector with magnitude 1
 */
export function normalizeVector(v: EigenmodeVector): EigenmodeVector {
  let magnitude = 0;
  for (let i = 0; i < 12; i++) {
    magnitude += v[i] * v[i];
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude === 0) {
    return [...v] as EigenmodeVector;
  }

  return v.map(val => val / magnitude) as EigenmodeVector;
}

/**
 * Compute normalized context signature distance
 *
 * Returns a distance metric normalized to [0, 1] range.
 * 0 = identical, 1 = maximally different
 *
 * @param v1 - First context signature
 * @param v2 - Second context signature
 * @returns Normalized distance (0-1)
 */
export function computeContextSignatureDistance(
  v1: EigenmodeVector,
  v2: EigenmodeVector
): number {
  // Normalize both vectors first
  const norm1 = normalizeVector(v1);
  const norm2 = normalizeVector(v2);

  // Compute Euclidean distance between normalized vectors
  // Max possible distance between unit vectors is 2 (opposite directions)
  const distance = computeEuclideanDistance(norm1, norm2);

  // Normalize to [0, 1] range
  return Math.min(1, distance / 2);
}

// ============================================================================
// Threshold and Matching Functions
// ============================================================================

/**
 * Check if two vectors are similar based on threshold
 *
 * @param v1 - First eigenmode vector
 * @param v2 - Second eigenmode vector
 * @param threshold - Similarity threshold (default: 0.85)
 * @returns true if similarity >= threshold
 */
export function areVectorsSimilar(
  v1: EigenmodeVector,
  v2: EigenmodeVector,
  threshold: number = DEFAULT_SIMILARITY_CONFIG.threshold
): boolean {
  const similarity = computeCosineSimilarity(v1, v2);
  return similarity >= threshold;
}

/**
 * Find the most similar vector from a set of candidates
 *
 * @param target - Target vector to match
 * @param candidates - Array of candidate vectors
 * @param minSimilarity - Minimum similarity threshold (optional)
 * @param returnAllMatches - Return all matches above threshold (optional)
 * @returns Search result with index and similarity
 */
export function findMostSimilarVector(
  target: EigenmodeVector,
  candidates: EigenmodeVector[],
  minSimilarity: number = 0,
  returnAllMatches: boolean = false
): SimilaritySearchResult {
  if (candidates.length === 0) {
    return { index: -1, similarity: 0 };
  }

  let bestIndex = -1;
  let bestSimilarity = -Infinity;
  const matches: Array<{ index: number; similarity: number; vector: EigenmodeVector }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const similarity = computeCosineSimilarity(target, candidates[i]);

    if (similarity >= minSimilarity) {
      if (returnAllMatches) {
        matches.push({ index: i, similarity, vector: candidates[i] });
      }

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIndex = i;
      }
    }
  }

  // If no match found above threshold
  if (bestIndex === -1) {
    return { index: -1, similarity: 0 };
  }

  const result: SimilaritySearchResult = {
    index: bestIndex,
    similarity: bestSimilarity,
    vector: candidates[bestIndex],
  };

  if (returnAllMatches) {
    // Sort matches by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);
    result.matches = matches;
  }

  return result;
}

// ============================================================================
// Stability and Trend Functions
// ============================================================================

/**
 * Compute eigenmode stability over a time window
 *
 * Measures how consistent the eigenmode vector has been over time.
 * Higher stability = safer to rely on patterns.
 *
 * @param history - Array of eigenmode vectors over time (oldest first)
 * @returns Stability score (0-1)
 */
export function computeStability(history: EigenmodeVector[]): number {
  if (history.length <= 1) {
    return 1.0; // Single or no samples = perfectly stable
  }

  // Compute pairwise similarities with time-weighted average
  // Recent similarities matter more
  let totalWeight = 0;
  let weightedSimilaritySum = 0;

  for (let i = 1; i < history.length; i++) {
    // Weight increases linearly for more recent pairs
    const weight = i / history.length;
    const similarity = computeCosineSimilarity(history[i - 1], history[i]);

    // Convert cosine similarity to 0-1 stability (1 = identical)
    const stabilityContribution = (similarity + 1) / 2;

    weightedSimilaritySum += weight * stabilityContribution;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return 1.0;
  }

  return weightedSimilaritySum / totalWeight;
}

/**
 * Compute the centroid (average) of multiple eigenmode vectors
 *
 * Useful for finding the "typical" context for a set of patterns.
 *
 * @param vectors - Array of eigenmode vectors
 * @returns Centroid vector
 */
export function computeVectorCentroid(vectors: EigenmodeVector[]): EigenmodeVector {
  if (vectors.length === 0) {
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  const centroid: EigenmodeVector = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (const vector of vectors) {
    for (let i = 0; i < 12; i++) {
      centroid[i] += vector[i];
    }
  }

  for (let i = 0; i < 12; i++) {
    centroid[i] /= vectors.length;
  }

  return centroid;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Compute similarity matrix for a set of vectors
 *
 * Returns an NxN matrix where element [i][j] is the similarity
 * between vectors[i] and vectors[j].
 *
 * @param vectors - Array of eigenmode vectors
 * @returns Similarity matrix
 */
export function computeSimilarityMatrix(vectors: EigenmodeVector[]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0; // Diagonal is always 1
    for (let j = i + 1; j < n; j++) {
      const similarity = computeCosineSimilarity(vectors[i], vectors[j]);
      matrix[i][j] = similarity;
      matrix[j][i] = similarity; // Symmetric
    }
  }

  return matrix;
}

/**
 * Find all vectors similar to target above threshold
 *
 * @param target - Target vector
 * @param candidates - Candidate vectors
 * @param threshold - Similarity threshold
 * @returns Array of indices and similarities above threshold
 */
export function findAllSimilar(
  target: EigenmodeVector,
  candidates: EigenmodeVector[],
  threshold: number = DEFAULT_SIMILARITY_CONFIG.threshold
): Array<{ index: number; similarity: number }> {
  const results: Array<{ index: number; similarity: number }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const similarity = computeCosineSimilarity(target, candidates[i]);
    if (similarity >= threshold) {
      results.push({ index: i, similarity });
    }
  }

  // Sort by similarity descending
  return results.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Cluster vectors by similarity
 *
 * Simple greedy clustering - assigns each vector to the first cluster
 * it's similar to, or creates a new cluster.
 *
 * @param vectors - Vectors to cluster
 * @param threshold - Similarity threshold for clustering
 * @returns Array of cluster indices for each vector
 */
export function clusterVectors(
  vectors: EigenmodeVector[],
  threshold: number = DEFAULT_SIMILARITY_CONFIG.threshold
): number[] {
  const clusters: number[] = [];
  const centroids: EigenmodeVector[] = [];

  for (let i = 0; i < vectors.length; i++) {
    let assignedCluster = -1;

    // Try to assign to existing cluster
    for (let c = 0; c < centroids.length; c++) {
      if (areVectorsSimilar(vectors[i], centroids[c], threshold)) {
        assignedCluster = c;
        break;
      }
    }

    if (assignedCluster === -1) {
      // Create new cluster
      assignedCluster = centroids.length;
      centroids.push([...vectors[i]] as EigenmodeVector);
    }

    clusters.push(assignedCluster);
  }

  return clusters;
}

// ============================================================================
// Export Service Object
// ============================================================================

/**
 * Eigenmode Similarity Service singleton
 */
export const EigenmodeSimilarityService = {
  computeCosineSimilarity,
  computeEuclideanDistance,
  computeWeightedSimilarity,
  normalizeVector,
  computeContextSignatureDistance,
  areVectorsSimilar,
  findMostSimilarVector,
  computeStability,
  computeVectorCentroid,
  computeSimilarityMatrix,
  findAllSimilar,
  clusterVectors,
  DEFAULT_EIGENMODE_WEIGHTS,
  DEFAULT_SIMILARITY_CONFIG,
};
