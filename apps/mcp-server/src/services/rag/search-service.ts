/**
 * Hybrid Search Service
 *
 * Combines vector search with keyword search using Reciprocal Rank Fusion.
 *
 * @module services/rag/search-service
 * @version 1.0.0
 */

import {
  RagCollectionName,
  RAG_COLLECTION_LIST,
  RagChunk,
  ChunkMetadata,
  RagSearchRequest,
  RagSearchFilters,
  HybridSearchConfig,
  DEFAULT_HYBRID_CONFIG,
  RagError,
  buildRagChunkUrn,
} from './types.js';
import { searchVectors } from './qdrant-client.js';
import { generateQueryEmbedding, cosineSimilarity } from './embeddings-service.js';

// ==============================================================================
// Search Configuration
// ==============================================================================

const RRF_K = 60; // Reciprocal Rank Fusion constant

// ==============================================================================
// Hybrid Search
// ==============================================================================

/**
 * Perform hybrid search across collections
 */
export async function hybridSearch(
  request: RagSearchRequest,
  config: HybridSearchConfig = DEFAULT_HYBRID_CONFIG
): Promise<RagChunk[]> {
  const startTime = Date.now();

  const collections = request.collections || RAG_COLLECTION_LIST;

  // Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(request.query);

  // Perform vector search across all collections
  const vectorResults = await Promise.all(
    collections.map(collection =>
      vectorSearch(collection, request.tenantId, queryEmbedding, {
        limit: config.topK,
        projectId: request.projectId,
        filters: request.filters,
      })
    )
  );

  // Perform keyword search (PostgreSQL full-text) if available
  const keywordResults = await Promise.all(
    collections.map(collection =>
      keywordSearch(collection, request.tenantId, request.query, {
        limit: config.topK,
        projectId: request.projectId,
        filters: request.filters,
      })
    )
  );

  // Flatten and deduplicate results
  const flatVectorResults = vectorResults.flat();
  const flatKeywordResults = keywordResults.flat();

  // Apply Reciprocal Rank Fusion
  const fusedResults = reciprocalRankFusion(
    flatVectorResults,
    flatKeywordResults,
    config.vectorWeight,
    config.keywordWeight
  );

  // Optionally apply re-ranking
  let finalResults = fusedResults;
  if (config.useReranking && fusedResults.length > config.finalK) {
    finalResults = await rerankResults(fusedResults, request.query, config.finalK);
  }

  // Limit to final K
  return finalResults.slice(0, request.limit || config.finalK);
}

// ==============================================================================
// Vector Search
// ==============================================================================

async function vectorSearch(
  collectionName: RagCollectionName,
  tenantId: string,
  queryVector: number[],
  options: {
    limit: number;
    projectId?: string;
    filters?: RagSearchFilters;
  }
): Promise<RagChunk[]> {
  try {
    const results = await searchVectors(collectionName, tenantId, queryVector, {
      limit: options.limit,
      projectId: options.projectId,
      filters: buildQdrantFilters(options.filters),
    });

    return results.map(r => ({
      id: r.id,
      urn: buildRagChunkUrn(tenantId, collectionName, r.id),
      collectionName,
      content: (r.payload.content as string) || '',
      contentHash: (r.payload.content_hash as string) || '',
      score: r.score,
      vectorScore: r.score,
      keywordScore: 0,
      metadata: payloadToMetadata(r.payload, collectionName),
    }));
  } catch (error: any) {
    console.warn(`Vector search failed for ${collectionName}: ${error.message}`);
    return [];
  }
}

// ==============================================================================
// Keyword Search (PostgreSQL Full-Text)
// ==============================================================================

async function keywordSearch(
  collectionName: RagCollectionName,
  tenantId: string,
  query: string,
  options: {
    limit: number;
    projectId?: string;
    filters?: RagSearchFilters;
  }
): Promise<RagChunk[]> {
  // This would integrate with PostgreSQL full-text search
  // For now, return empty results (vector-only search)
  // TODO: Implement PostgreSQL ts_vector search integration

  // Placeholder - would query PostgreSQL rag_chunks table with ts_vector
  // SELECT * FROM rag_chunks
  // WHERE collection_name = $1
  // AND tenant_id = $2
  // AND to_tsvector('english', content) @@ plainto_tsquery('english', $3)
  // ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', $3)) DESC
  // LIMIT $4

  return [];
}

// ==============================================================================
// Reciprocal Rank Fusion
// ==============================================================================

/**
 * Combine vector and keyword results using RRF
 * RRF score = sum of 1/(k + rank) for each result list
 */
function reciprocalRankFusion(
  vectorResults: RagChunk[],
  keywordResults: RagChunk[],
  vectorWeight: number,
  keywordWeight: number
): RagChunk[] {
  const scoreMap = new Map<string, { chunk: RagChunk; vectorRank: number; keywordRank: number }>();

  // Process vector results
  vectorResults.forEach((chunk, index) => {
    const existing = scoreMap.get(chunk.id);
    if (existing) {
      existing.vectorRank = index + 1;
    } else {
      scoreMap.set(chunk.id, { chunk, vectorRank: index + 1, keywordRank: Infinity });
    }
  });

  // Process keyword results
  keywordResults.forEach((chunk, index) => {
    const existing = scoreMap.get(chunk.id);
    if (existing) {
      existing.keywordRank = index + 1;
      // Merge scores
      existing.chunk.keywordScore = chunk.keywordScore || chunk.score;
    } else {
      scoreMap.set(chunk.id, {
        chunk: { ...chunk, vectorScore: 0 },
        vectorRank: Infinity,
        keywordRank: index + 1,
      });
    }
  });

  // Calculate RRF scores
  const results = Array.from(scoreMap.values()).map(({ chunk, vectorRank, keywordRank }) => {
    const vectorRRF = vectorRank === Infinity ? 0 : 1 / (RRF_K + vectorRank);
    const keywordRRF = keywordRank === Infinity ? 0 : 1 / (RRF_K + keywordRank);
    const fusedScore = vectorWeight * vectorRRF + keywordWeight * keywordRRF;

    return {
      ...chunk,
      score: fusedScore,
    };
  });

  // Sort by fused score
  return results.sort((a, b) => b.score - a.score);
}

// ==============================================================================
// Re-ranking (Cross-Encoder)
// ==============================================================================

/**
 * Re-rank results using cross-encoder scoring
 * This provides more accurate relevance by directly comparing query-passage pairs
 */
async function rerankResults(
  chunks: RagChunk[],
  query: string,
  topK: number
): Promise<RagChunk[]> {
  // For now, use a simple relevance heuristic
  // TODO: Integrate with Jina Reranker or cross-encoder model

  const rerankedChunks = chunks.map(chunk => {
    // Calculate additional relevance signals
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const contentLower = chunk.content.toLowerCase();

    // Term overlap score
    const termOverlap = queryTerms.filter(term => contentLower.includes(term)).length / queryTerms.length;

    // Exact phrase match bonus
    const exactPhraseBonus = contentLower.includes(query.toLowerCase()) ? 0.2 : 0;

    // Recency bonus (newer content slightly preferred)
    const recencyBonus = chunk.metadata.createdAt
      ? Math.max(0, 0.1 - (Date.now() - new Date(chunk.metadata.createdAt).getTime()) / (365 * 24 * 60 * 60 * 1000) * 0.1)
      : 0;

    const rerankScore = chunk.score + termOverlap * 0.3 + exactPhraseBonus + recencyBonus;

    return { ...chunk, score: rerankScore };
  });

  return rerankedChunks.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ==============================================================================
// Helper Functions
// ==============================================================================

function buildQdrantFilters(filters?: RagSearchFilters): Record<string, unknown> {
  if (!filters) {return {};}

  const qdrantFilters: Record<string, unknown> = {};

  if (filters.documentType?.length) {
    qdrantFilters.documentType = filters.documentType[0]; // Qdrant expects single value
  }
  if (filters.dateFrom) {
    qdrantFilters.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    qdrantFilters.dateTo = filters.dateTo;
  }
  if (filters.voxelId) {
    qdrantFilters.voxelId = filters.voxelId;
  }
  if (filters.decisionId) {
    qdrantFilters.decisionId = filters.decisionId;
  }

  return qdrantFilters;
}

function payloadToMetadata(payload: Record<string, unknown>, collectionName: RagCollectionName): ChunkMetadata {
  return {
    sourceUrn: (payload.source_urn as string) || '',
    sourceType: (payload.source_type as string) || collectionName,
    sourceName: (payload.source_name as string) || '',
    projectId: (payload.project_id as string) || '',
    tenantId: (payload.tenant_id as string) || '',
    chunkIndex: (payload.chunk_index as number) || 0,
    totalChunks: (payload.total_chunks as number) || 1,
    startOffset: (payload.start_offset as number) || 0,
    endOffset: (payload.end_offset as number) || 0,
    createdAt: payload.created_at ? new Date(payload.created_at as string) : new Date(),
    updatedAt: payload.updated_at ? new Date(payload.updated_at as string) : new Date(),
    documentType: payload.document_type as string | undefined,
    voxelId: payload.voxel_id as string | undefined,
    decisionId: payload.decision_id as string | undefined,
    tags: payload.tags as string[] | undefined,
  };
}

// ==============================================================================
// Semantic Search (Simple Vector-Only)
// ==============================================================================

/**
 * Simple semantic search without hybrid fusion
 */
export async function semanticSearch(
  query: string,
  tenantId: string,
  options: {
    collections?: RagCollectionName[];
    projectId?: string;
    limit?: number;
    filters?: RagSearchFilters;
  } = {}
): Promise<RagChunk[]> {
  const queryEmbedding = await generateQueryEmbedding(query);
  const collections = options.collections || RAG_COLLECTION_LIST;
  const limit = options.limit || 10;

  const results = await Promise.all(
    collections.map(collection =>
      vectorSearch(collection, tenantId, queryEmbedding, {
        limit: Math.ceil(limit / collections.length) + 5,
        projectId: options.projectId,
        filters: options.filters,
      })
    )
  );

  return results
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export default {
  hybridSearch,
  semanticSearch,
};
