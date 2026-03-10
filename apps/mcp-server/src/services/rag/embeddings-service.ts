/**
 * Jina Embeddings Service
 *
 * Generates embeddings using Jina AI v3 with fallback to local models.
 *
 * @module services/rag/embeddings-service
 * @version 1.0.0
 */

import { createHash } from 'crypto';
import { EMBEDDING_CONFIG, RagError } from './types.js';

// ==============================================================================
// Configuration
// ==============================================================================

interface EmbeddingsConfig {
  jinaApiKey: string | undefined;
  jinaModel: string;
  dimensions: number;
  batchSize: number;
  fallbackEnabled: boolean;
}

function getEmbeddingsConfig(): EmbeddingsConfig {
  return {
    jinaApiKey: process.env.JINA_API_KEY,
    jinaModel: process.env.JINA_MODEL || EMBEDDING_CONFIG.MODEL,
    dimensions: EMBEDDING_CONFIG.DIMENSIONS,
    batchSize: EMBEDDING_CONFIG.BATCH_SIZE,
    fallbackEnabled: process.env.EMBEDDINGS_FALLBACK !== 'false',
  };
}

// ==============================================================================
// Jina API Types
// ==============================================================================

interface JinaEmbeddingRequest {
  model: string;
  input: string[];
  encoding_type?: 'float' | 'binary' | 'ubinary';
  task?: 'retrieval.query' | 'retrieval.passage' | 'separation' | 'classification' | 'text-matching';
  dimensions?: number;
  late_chunking?: boolean;
}

interface JinaEmbeddingResponse {
  model: string;
  object: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
}

// ==============================================================================
// Embedding Generation
// ==============================================================================

/**
 * Generate embeddings using Jina AI
 */
export async function generateEmbeddings(
  texts: string[],
  options: {
    task?: 'query' | 'passage';
    dimensions?: number;
  } = {}
): Promise<number[][]> {
  const config = getEmbeddingsConfig();
  const { task = 'passage', dimensions = config.dimensions } = options;

  if (!config.jinaApiKey) {
    if (config.fallbackEnabled) {
      console.warn('Jina API key not configured, using fallback embeddings');
      return generateFallbackEmbeddings(texts, dimensions);
    }
    throw new RagError('Jina API key not configured', 'INVALID_CONFIG');
  }

  // Process in batches
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batch = texts.slice(i, i + config.batchSize);
    const batchEmbeddings = await generateJinaEmbeddings(batch, {
      task: task === 'query' ? 'retrieval.query' : 'retrieval.passage',
      dimensions,
    });
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(
  text: string,
  options: { task?: 'query' | 'passage' } = {}
): Promise<number[]> {
  const embeddings = await generateEmbeddings([text], options);
  return embeddings[0];
}

/**
 * Generate query embedding (optimized for retrieval)
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  return generateEmbedding(query, { task: 'query' });
}

/**
 * Generate passage embeddings (optimized for indexing)
 */
export async function generatePassageEmbeddings(passages: string[]): Promise<number[][]> {
  return generateEmbeddings(passages, { task: 'passage' });
}

// ==============================================================================
// Jina API Integration
// ==============================================================================

async function generateJinaEmbeddings(
  texts: string[],
  options: {
    task: JinaEmbeddingRequest['task'];
    dimensions: number;
  }
): Promise<number[][]> {
  const config = getEmbeddingsConfig();

  const requestBody: JinaEmbeddingRequest = {
    model: config.jinaModel,
    input: texts,
    encoding_type: 'float',
    task: options.task,
    dimensions: options.dimensions,
  };

  try {
    const response = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.jinaApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Jina API error: ${response.status} - ${errorBody}`);
    }

    const data: JinaEmbeddingResponse = await response.json();

    // Sort by index to ensure correct order
    const sortedData = data.data.sort((a, b) => a.index - b.index);
    return sortedData.map(d => d.embedding);
  } catch (error: any) {
    throw new RagError(
      `Failed to generate Jina embeddings: ${error.message}`,
      'EMBEDDING_FAILED',
      { textCount: texts.length }
    );
  }
}

// ==============================================================================
// Fallback Embeddings (Deterministic Hash-Based)
// ==============================================================================

/**
 * Generate fallback embeddings using deterministic hashing
 * This is used when Jina API is not available (development/testing)
 */
function generateFallbackEmbeddings(texts: string[], dimensions: number): number[][] {
  return texts.map(text => generateFallbackEmbedding(text, dimensions));
}

function generateFallbackEmbedding(text: string, dimensions: number): number[] {
  // Create deterministic hash-based embedding
  const hash = createHash('sha256').update(text).digest('hex');
  const embedding: number[] = [];

  // Generate pseudo-random but deterministic values from hash
  for (let i = 0; i < dimensions; i++) {
    const hashIndex = i % 32;
    const charCode = hash.charCodeAt(hashIndex);
    const nextCharCode = hash.charCodeAt((hashIndex + 1) % 32);
    // Generate value between -1 and 1
    const value = ((charCode * 256 + nextCharCode) / 65535) * 2 - 1;
    embedding.push(value);
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / magnitude);
}

// ==============================================================================
// Content Hashing
// ==============================================================================

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ==============================================================================
// Similarity Calculation
// ==============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ==============================================================================
// Health Check
// ==============================================================================

export async function healthCheck(): Promise<{
  healthy: boolean;
  provider: string;
  message: string;
}> {
  const config = getEmbeddingsConfig();

  if (!config.jinaApiKey) {
    return {
      healthy: config.fallbackEnabled,
      provider: 'fallback',
      message: config.fallbackEnabled
        ? 'Using fallback embeddings (Jina API key not configured)'
        : 'Jina API key not configured',
    };
  }

  try {
    // Test with a simple embedding
    await generateJinaEmbeddings(['health check'], {
      task: 'retrieval.passage',
      dimensions: config.dimensions,
    });

    return {
      healthy: true,
      provider: 'jina',
      message: `Jina AI embeddings operational (${config.jinaModel})`,
    };
  } catch (error: any) {
    return {
      healthy: config.fallbackEnabled,
      provider: config.fallbackEnabled ? 'fallback' : 'none',
      message: `Jina API error: ${error.message}`,
    };
  }
}

export default {
  generateEmbeddings,
  generateEmbedding,
  generateQueryEmbedding,
  generatePassageEmbeddings,
  generateContentHash,
  cosineSimilarity,
  healthCheck,
};
