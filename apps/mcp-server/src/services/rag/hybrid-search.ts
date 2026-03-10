/**
 * Hybrid Search with Reciprocal Rank Fusion
 *
 * Combines vector similarity search with keyword search using
 * Reciprocal Rank Fusion (RRF) for optimal retrieval results.
 *
 * @module rag/hybrid-search
 * @version 1.0.0
 */

import type {
  CollectionName,
  SearchRequest,
  SearchFilters,
  RetrievedChunk,
  RetrievedChunkMetadata,
  SearchMetrics,
  RetrievalStrategy,
  QdrantSearchResult,
} from './types.js';
import {
  vectorSearch,
  multiCollectionSearch,
} from './qdrant-client.js';
import { generateQueryEmbedding } from './embedding-client.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * RRF constant (k parameter) - higher values give more weight to lower-ranked items
 */
const RRF_K = 60;

/**
 * Default search parameters
 */
const DEFAULT_TOP_K = 20;
const DEFAULT_FINAL_K = 5;

// ============================================================================
// Reciprocal Rank Fusion
// ============================================================================

interface RankedResult {
  id: string;
  vectorRank?: number;
  keywordRank?: number;
  vectorScore?: number;
  keywordScore?: number;
  payload: Record<string, unknown>;
  collection: CollectionName;
}

/**
 * Calculate RRF score for a result
 */
function calculateRRFScore(
  vectorRank: number | undefined,
  keywordRank: number | undefined
): number {
  let score = 0;

  if (vectorRank !== undefined) {
    score += 1 / (RRF_K + vectorRank);
  }

  if (keywordRank !== undefined) {
    score += 1 / (RRF_K + keywordRank);
  }

  return score;
}

/**
 * Fuse vector and keyword search results using RRF
 */
export function fuseResults(
  vectorResults: Map<string, { rank: number; score: number; payload: Record<string, unknown>; collection: CollectionName }>,
  keywordResults: Map<string, { rank: number; score: number; payload: Record<string, unknown>; collection: CollectionName }>
): Array<{
  id: string;
  fusedScore: number;
  vectorScore: number;
  keywordScore: number;
  payload: Record<string, unknown>;
  collection: CollectionName;
}> {
  // Combine all unique IDs
  const allIds = new Set([...vectorResults.keys(), ...keywordResults.keys()]);

  const fusedResults: Array<{
    id: string;
    fusedScore: number;
    vectorScore: number;
    keywordScore: number;
    payload: Record<string, unknown>;
    collection: CollectionName;
  }> = [];

  for (const id of allIds) {
    const vectorResult = vectorResults.get(id);
    const keywordResult = keywordResults.get(id);

    const fusedScore = calculateRRFScore(
      vectorResult?.rank,
      keywordResult?.rank
    );

    fusedResults.push({
      id,
      fusedScore,
      vectorScore: vectorResult?.score || 0,
      keywordScore: keywordResult?.score || 0,
      payload: vectorResult?.payload || keywordResult?.payload || {},
      collection: vectorResult?.collection || keywordResult?.collection || 'project_documents',
    });
  }

  // Sort by fused score descending
  return fusedResults.sort((a, b) => b.fusedScore - a.fusedScore);
}

// ============================================================================
// Keyword Search (using Qdrant's payload filter + scroll)
// ============================================================================

/**
 * Simple keyword search using Qdrant's filter functionality
 * For production, this would be backed by PostgreSQL full-text search
 */
async function keywordSearch(
  tenantId: string,
  collection: CollectionName,
  query: string,
  topK: number,
  filter?: Record<string, unknown>
): Promise<Map<string, { rank: number; score: number; payload: Record<string, unknown>; collection: CollectionName }>> {
  // In a full implementation, this would call PostgreSQL with ts_rank
  // For now, we simulate keyword search by filtering Qdrant payloads

  const results = new Map<string, { rank: number; score: number; payload: Record<string, unknown>; collection: CollectionName }>();

  // Keywords from query
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) {
    return results;
  }

  // This is a simplified implementation
  // Production would use PostgreSQL full-text search with proper ranking
  // For now, we rely primarily on vector search

  return results;
}

// ============================================================================
// Hybrid Search Implementation
// ============================================================================

/**
 * Perform hybrid search across collections
 */
export async function hybridSearch(
  request: SearchRequest
): Promise<{
  chunks: RetrievedChunk[];
  metrics: SearchMetrics;
}> {
  const startTime = Date.now();
  const metrics: SearchMetrics = {
    // Required base fields
    totalChunks: 0,
    relevantChunks: 0,
    searchTimeMs: 0,
    embeddingTimeMs: 0,
    // Hybrid search timing fields
    vectorSearchMs: 0,
    keywordSearchMs: 0,
    rerankMs: 0,
    totalMs: 0,
    chunksRetrieved: 0,
    chunksAfterRerank: 0,
  };

  const topK = request.topK || DEFAULT_TOP_K;
  const finalK = request.finalK || DEFAULT_FINAL_K;
  const collections = request.collections || [
    'project_documents',
    'decision_history',
    'voxel_metadata',
    'conversation_logs',
    'safety_protocols',
  ];

  // Build filter from request
  const qdrantFilter = buildQdrantFilter(request.filters, request.projectId);

  // Generate query embedding
  const embeddingResult = await generateQueryEmbedding(request.query);

  if (!embeddingResult.success || !embeddingResult.embedding) {
    console.error('[HybridSearch] Failed to generate query embedding:', embeddingResult.error);
    return {
      chunks: [],
      metrics: { ...metrics, totalMs: Date.now() - startTime },
    };
  }

  // Vector search
  const vectorStartTime = Date.now();
  const vectorResultsMap = await multiCollectionSearch(
    request.tenantId,
    collections,
    embeddingResult.embedding,
    topK,
    qdrantFilter
  );
  metrics.vectorSearchMs = Date.now() - vectorStartTime;

  // Combine all vector results with ranks
  const allVectorResults = new Map<string, {
    rank: number;
    score: number;
    payload: Record<string, unknown>;
    collection: CollectionName;
  }>();

  let rank = 1;
  // Merge results from all collections, sorted by score
  const allResults: Array<QdrantSearchResult & { collection: CollectionName }> = [];

  for (const [collection, results] of vectorResultsMap) {
    for (const result of results) {
      allResults.push({ ...result, collection });
    }
  }

  // Sort by score descending
  allResults.sort((a, b) => b.score - a.score);

  // Assign ranks
  for (const result of allResults) {
    allVectorResults.set(result.id, {
      rank: rank++,
      score: result.score,
      payload: result.payload,
      collection: result.collection,
    });
  }

  metrics.chunksRetrieved = allVectorResults.size;

  // Keyword search (simplified - in production use PostgreSQL)
  const keywordStartTime = Date.now();
  const allKeywordResults = new Map<string, {
    rank: number;
    score: number;
    payload: Record<string, unknown>;
    collection: CollectionName;
  }>();

  // For now, skip keyword search if strategy is 'vector'
  if (request.strategy !== 'vector') {
    for (const collection of collections) {
      const keywordResults = await keywordSearch(
        request.tenantId,
        collection,
        request.query,
        topK,
        qdrantFilter
      );

      for (const [id, result] of keywordResults) {
        const existing = allKeywordResults.get(id);
        if (!existing || result.score > existing.score) {
          allKeywordResults.set(id, result);
        }
      }
    }
  }
  metrics.keywordSearchMs = Date.now() - keywordStartTime;

  // Fuse results using RRF
  const rerankStartTime = Date.now();
  let fusedResults: Array<{
    id: string;
    fusedScore: number;
    vectorScore: number;
    keywordScore: number;
    payload: Record<string, unknown>;
    collection: CollectionName;
  }>;

  if (request.strategy === 'vector' || allKeywordResults.size === 0) {
    // Just use vector results
    fusedResults = Array.from(allVectorResults.entries()).map(([id, result]) => ({
      id,
      fusedScore: result.score,
      vectorScore: result.score,
      keywordScore: 0,
      payload: result.payload,
      collection: result.collection,
    }));
    fusedResults.sort((a, b) => b.fusedScore - a.fusedScore);
  } else if (request.strategy === 'keyword') {
    // Just use keyword results
    fusedResults = Array.from(allKeywordResults.entries()).map(([id, result]) => ({
      id,
      fusedScore: result.score,
      vectorScore: 0,
      keywordScore: result.score,
      payload: result.payload,
      collection: result.collection,
    }));
    fusedResults.sort((a, b) => b.fusedScore - a.fusedScore);
  } else {
    // Hybrid: fuse with RRF
    fusedResults = fuseResults(allVectorResults, allKeywordResults);
  }

  // Take top finalK results
  const topResults = fusedResults.slice(0, finalK);
  metrics.rerankMs = Date.now() - rerankStartTime;
  metrics.chunksAfterRerank = topResults.length;

  // Convert to RetrievedChunk format
  const chunks: RetrievedChunk[] = topResults.map((result) => {
    const payload = result.payload;
    const documentId = (payload.documentId as string) || '';
    const sourceUrn = (payload.sourceUrn as string) || `urn:luhtech:${request.tenantId}:document:${documentId}`;

    const metadata: RetrievedChunkMetadata = {
      sourceUrn,
      sourceName: (payload.sourceName as string) || 'Unknown',
      sourceType: (payload.sourceType as string) || 'document',
      projectId: (payload.projectId as string) || request.projectId || '',
      tenantId: request.tenantId,
      chunkIndex: (payload.chunkIndex as number) || 0,
      totalChunks: (payload.totalChunks as number) || 1,
      documentId,
      documentTitle: (payload.documentTitle as string) || 'Untitled',
      documentType: (payload.documentType as string) || 'general',
      zone: payload.zone as string | undefined,
      createdAt: payload.createdAt ? new Date(payload.createdAt as string) : undefined,
    };

    return {
      chunkId: result.id,
      content: (payload.content as string) || '',
      sourceUrn,
      collection: result.collection,
      fusedScore: result.fusedScore,
      metadata,
    };
  });

  metrics.totalMs = Date.now() - startTime;

  return { chunks, metrics };
}

// ============================================================================
// Filter Building
// ============================================================================

/**
 * Build Qdrant filter from search filters
 */
function buildQdrantFilter(
  filters?: SearchFilters,
  projectId?: string
): Record<string, unknown> | undefined {
  const conditions: Array<{ key: string; match: { value?: unknown; any?: unknown[] } }> = [];

  // Project filter
  if (projectId) {
    conditions.push({
      key: 'projectId',
      match: { value: projectId },
    });
  }

  if (!filters) {
    return conditions.length > 0 ? { must: conditions } : undefined;
  }

  // Document type filter
  if (filters.documentTypes && filters.documentTypes.length > 0) {
    conditions.push({
      key: 'documentType',
      match: { any: filters.documentTypes },
    });
  }

  // Zone filter
  if (filters.zones && filters.zones.length > 0) {
    conditions.push({
      key: 'zone',
      match: { any: filters.zones },
    });
  }

  // Voxel filter
  if (filters.voxelIds && filters.voxelIds.length > 0) {
    conditions.push({
      key: 'voxelId',
      match: { any: filters.voxelIds },
    });
  }

  // Author filter
  if (filters.authors && filters.authors.length > 0) {
    conditions.push({
      key: 'author',
      match: { any: filters.authors },
    });
  }

  // Tag filter
  if (filters.tags && filters.tags.length > 0) {
    // Tags need special handling - check if any tag matches
    conditions.push({
      key: 'tags',
      match: { any: filters.tags },
    });
  }

  // Date range filter would need Qdrant range queries
  // For simplicity, we skip date filtering here

  return conditions.length > 0 ? { must: conditions } : undefined;
}

// ============================================================================
// Search Strategy Helpers
// ============================================================================

/**
 * Determine optimal search strategy based on query characteristics
 */
export function determineSearchStrategy(query: string): RetrievalStrategy {
  // Short queries with specific terms -> keyword may help
  // Long, semantic queries -> vector is better
  // For most cases, hybrid is safest

  const words = query.split(/\s+/).filter((w) => w.length > 2);

  // Very short queries - vector only (embeddings capture intent)
  if (words.length <= 2) {
    return 'vector';
  }

  // Queries with specific identifiers - hybrid helps
  const hasIdentifier = /\b(VOX-|DEC-|RFI-|[A-Z]{2,3}-\d+)\b/.test(query);
  if (hasIdentifier) {
    return 'hybrid';
  }

  // Default to hybrid for best overall performance
  return 'hybrid';
}

/**
 * Adjust topK based on token budget
 */
export function calculateTopK(
  tokenBudget: number,
  avgChunkTokens: number = 128
): number {
  // Aim to fill about 80% of the budget
  const targetTokens = Math.floor(tokenBudget * 0.8);
  const estimatedChunks = Math.floor(targetTokens / avgChunkTokens);

  // Clamp to reasonable range
  return Math.max(3, Math.min(20, estimatedChunks));
}

// ============================================================================
// Reranking (Cross-Encoder Simulation)
// ============================================================================

/**
 * Rerank results using a simple heuristic
 * In production, this would use a cross-encoder model
 */
export function rerankResults(
  query: string,
  chunks: RetrievedChunk[],
  finalK: number
): RetrievedChunk[] {
  // Simple heuristic reranking:
  // - Boost chunks that contain exact query terms
  // - Boost recent documents
  // - Boost documents from relevant collections

  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  const scoredChunks = chunks.map((chunk) => {
    let boost = 0;
    const contentLower = chunk.content.toLowerCase();

    // Exact term matches
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        boost += 0.1;
      }
    }

    // Phrase match (consecutive terms)
    const queryPhrase = queryTerms.slice(0, 3).join(' ');
    if (contentLower.includes(queryPhrase)) {
      boost += 0.2;
    }

    // Recency boost (if date available)
    const createdAt = chunk.metadata.createdAt;
    if (createdAt) {
      const ageMs = Date.now() - new Date(createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 7) {
        boost += 0.15;
      } else if (ageDays < 30) {
        boost += 0.1;
      } else if (ageDays < 90) {
        boost += 0.05;
      }
    }

    return {
      ...chunk,
      fusedScore: chunk.fusedScore + boost,
    };
  });

  // Sort by boosted score and return top finalK
  return scoredChunks
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, finalK);
}
