/**
 * Jina Embeddings Client
 *
 * Client for generating text embeddings using Jina AI's embedding models.
 * Supports batch processing and handles rate limiting gracefully.
 *
 * @module rag/embedding-client
 * @version 1.0.0
 */

import type { EmbeddingConfig, EmbeddingRequest, EmbeddingResponse } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const config: EmbeddingConfig = {
  provider: 'jina',
  model: process.env.JINA_EMBEDDING_MODEL || 'jina-embeddings-v3',
  dimensions: 768,
  batchSize: parseInt(process.env.JINA_BATCH_SIZE || '32', 10),
  apiKey: process.env.JINA_API_KEY,
  baseUrl: process.env.JINA_BASE_URL || 'https://api.jina.ai/v1',
};

/**
 * Check if embedding service is configured
 */
export function isEmbeddingConfigured(): boolean {
  return !!config.apiKey;
}

/**
 * Get current embedding configuration (without sensitive data)
 */
export function getEmbeddingConfig(): Omit<EmbeddingConfig, 'apiKey'> {
  return {
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    batchSize: config.batchSize,
    baseUrl: config.baseUrl,
  };
}

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Generate embeddings for a list of texts
 */
export async function generateEmbeddings(
  texts: string[],
  options?: {
    model?: string;
    task?: 'retrieval.query' | 'retrieval.passage' | 'text-matching' | 'classification';
  }
): Promise<{
  success: boolean;
  embeddings?: number[][];
  error?: string;
  usage?: { totalTokens: number };
}> {
  if (!config.apiKey) {
    return {
      success: false,
      error: 'JINA_API_KEY not configured',
    };
  }

  if (texts.length === 0) {
    return {
      success: true,
      embeddings: [],
      usage: { totalTokens: 0 },
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || config.model,
        input: texts,
        task: options?.task || 'retrieval.passage',
        dimensions: config.dimensions,
        normalized: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Handle rate limiting
      if (response.status === 429) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please retry after a delay.',
        };
      }

      return {
        success: false,
        error: errorData.detail || errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    // Extract embeddings from response
    const embeddings = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((item: { embedding: number[] }) => item.embedding);

    return {
      success: true,
      embeddings,
      usage: {
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate embedding for a single text (convenience wrapper)
 */
export async function generateEmbedding(
  text: string,
  task?: 'retrieval.query' | 'retrieval.passage' | 'text-matching' | 'classification'
): Promise<{
  success: boolean;
  embedding?: number[];
  error?: string;
}> {
  const result = await generateEmbeddings([text], { task });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.embeddings || result.embeddings.length === 0) {
    return { success: false, error: 'No embedding returned' };
  }

  return {
    success: true,
    embedding: result.embeddings[0],
  };
}

/**
 * Generate query embedding (optimized for search queries)
 */
export async function generateQueryEmbedding(query: string): Promise<{
  success: boolean;
  embedding?: number[];
  error?: string;
}> {
  return generateEmbedding(query, 'retrieval.query');
}

/**
 * Generate passage embedding (optimized for documents)
 */
export async function generatePassageEmbedding(passage: string): Promise<{
  success: boolean;
  embedding?: number[];
  error?: string;
}> {
  return generateEmbedding(passage, 'retrieval.passage');
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Generate embeddings in batches to respect rate limits
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  options?: {
    batchSize?: number;
    delayBetweenBatches?: number;
    task?: 'retrieval.query' | 'retrieval.passage' | 'text-matching' | 'classification';
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<{
  success: boolean;
  embeddings?: number[][];
  error?: string;
  totalTokens?: number;
  failedBatches?: number[];
}> {
  const batchSize = options?.batchSize || config.batchSize;
  const delayMs = options?.delayBetweenBatches || 100;
  const task = options?.task || 'retrieval.passage';

  const allEmbeddings: number[][] = [];
  const failedBatches: number[] = [];
  let totalTokens = 0;

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    // Add delay between batches (except first)
    if (batchIndex > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const result = await generateEmbeddings(batch, { task });

    if (result.success && result.embeddings) {
      allEmbeddings.push(...result.embeddings);
      totalTokens += result.usage?.totalTokens || 0;
    } else {
      // Handle failure - fill with zeros to maintain index alignment
      failedBatches.push(batchIndex);
      for (let i = 0; i < batch.length; i++) {
        allEmbeddings.push(new Array(config.dimensions).fill(0));
      }
    }

    // Report progress
    if (options?.onProgress) {
      const processed = Math.min((batchIndex + 1) * batchSize, texts.length);
      options.onProgress(processed, texts.length);
    }
  }

  return {
    success: failedBatches.length === 0,
    embeddings: allEmbeddings,
    totalTokens,
    failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
  };
}

// ============================================================================
// Similarity Calculations (Local)
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Calculate euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Find top-k most similar vectors from a set
 */
export function findTopKSimilar(
  queryVector: number[],
  vectors: Array<{ id: string; vector: number[] }>,
  k: number
): Array<{ id: string; score: number }> {
  const similarities = vectors.map((v) => ({
    id: v.id,
    score: cosineSimilarity(queryVector, v.vector),
  }));

  return similarities
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if embedding service is available
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  if (!config.apiKey) {
    return false;
  }

  try {
    // Try to generate a small embedding to verify service availability
    const result = await generateEmbedding('health check');
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Get embedding service status
 */
export async function getEmbeddingStatus(): Promise<{
  configured: boolean;
  available: boolean;
  model: string;
  dimensions: number;
}> {
  const configured = isEmbeddingConfigured();
  const available = configured ? await isEmbeddingAvailable() : false;

  return {
    configured,
    available,
    model: config.model,
    dimensions: config.dimensions,
  };
}

// ============================================================================
// Fallback Embeddings (for testing/development)
// ============================================================================

/**
 * Generate a deterministic pseudo-embedding for testing
 * This uses a simple hash-based approach - NOT for production use
 */
export function generateFallbackEmbedding(text: string): number[] {
  const embedding = new Array(config.dimensions).fill(0);

  // Simple deterministic hash-based embedding
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const idx = (charCode * (i + 1)) % config.dimensions;
    embedding[idx] += charCode / 1000;
  }

  // Normalize
  let norm = 0;
  for (const val of embedding) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

/**
 * Generate embeddings with fallback for when API is unavailable
 */
export async function generateEmbeddingsWithFallback(
  texts: string[],
  options?: {
    task?: 'retrieval.query' | 'retrieval.passage';
    useFallback?: boolean;
  }
): Promise<{
  success: boolean;
  embeddings: number[][];
  usedFallback: boolean;
  error?: string;
}> {
  // Try real embeddings first unless fallback is forced
  if (!options?.useFallback && config.apiKey) {
    const result = await generateEmbeddings(texts, { task: options?.task });
    if (result.success && result.embeddings) {
      return {
        success: true,
        embeddings: result.embeddings,
        usedFallback: false,
      };
    }
  }

  // Use fallback embeddings
  const embeddings = texts.map(generateFallbackEmbedding);
  return {
    success: true,
    embeddings,
    usedFallback: true,
    error: config.apiKey
      ? 'API unavailable, using fallback embeddings'
      : 'JINA_API_KEY not configured, using fallback embeddings',
  };
}
