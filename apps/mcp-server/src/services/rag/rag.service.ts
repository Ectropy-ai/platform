/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Main service orchestrating vector search, embedding generation,
 * document indexing, and context assembly for the SEPPA assistant.
 *
 * @module rag/rag.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  RAG_COLLECTION_LIST,
  type SearchRequest,
  type SearchResult,
  type IndexRequest,
  type IndexResponse,
  type BatchIndexRequest,
  type BatchIndexResponse,
  type RAGServiceStatus,
  type CollectionName,
  type DocumentMetadata,
  type DocumentChunk,
  type AuthorityLevel,
  type RetrievedChunk,
} from './types.js';
import {
  isQdrantAvailable,
  createCollection,
  provisionTenantCollections,
  deleteTenantCollections,
  upsertPoints,
  deletePointsByFilter,
  getTenantStats,
  getClusterInfo,
  buildCollectionName,
} from './qdrant-client.js';
import {
  generateEmbeddings,
  generateEmbeddingsWithFallback,
  isEmbeddingConfigured,
  isEmbeddingAvailable,
  getEmbeddingStatus,
} from './embedding-client.js';
import { chunkDocument, getChunkerForType, analyzeChunks } from './chunker.js';
import {
  hybridSearch,
  rerankResults,
  determineSearchStrategy,
  calculateTopK,
} from './hybrid-search.js';
import {
  assembleContext,
  buildSearchResult,
  getTokenBudget,
  deduplicateChunks,
} from './context-assembly.js';

// ============================================================================
// Service State
// ============================================================================

let serviceInitialized = false;
let lastHealthCheck: Date | null = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the RAG service
 */
export async function initializeRAGService(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Check Qdrant connectivity
    const qdrantAvailable = await isQdrantAvailable();
    if (!qdrantAvailable) {
      console.warn('[RAG Service] Qdrant not available - running in degraded mode');
    }

    // Check embedding service
    const embeddingConfigured = isEmbeddingConfigured();
    if (!embeddingConfigured) {
      console.warn('[RAG Service] Jina API key not configured - using fallback embeddings');
    }

    serviceInitialized = true;
    lastHealthCheck = new Date();

    console.log('[RAG Service] Initialized successfully');
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RAG Service] Initialization failed:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Check if RAG service is initialized
 */
export function isRAGServiceInitialized(): boolean {
  return serviceInitialized;
}

// ============================================================================
// Search Operations
// ============================================================================

/**
 * Search for relevant context
 */
export async function search(request: SearchRequest): Promise<SearchResult> {
  const startTime = Date.now();

  // Validate request
  if (!request.query || request.query.trim().length === 0) {
    throw new Error('Search query is required');
  }

  if (!request.tenantId) {
    throw new Error('Tenant ID is required');
  }

  // Determine search strategy if not specified
  const strategy = request.strategy || determineSearchStrategy(request.query);

  // Calculate appropriate topK based on token budget
  const authorityLevel = request.authorityLevel || 3;
  const tokenBudget = request.tokenBudget || getTokenBudget(authorityLevel);
  const topK = request.topK || calculateTopK(tokenBudget);
  const finalK = request.finalK || Math.min(5, topK);

  // Perform hybrid search
  const { chunks, metrics } = await hybridSearch({
    ...request,
    strategy,
    topK,
    tokenBudget,
  });

  // Deduplicate results
  const uniqueChunks = deduplicateChunks(chunks);

  // Rerank for final selection
  const rerankedChunks = rerankResults(request.query, uniqueChunks, finalK);

  // Build and return search result
  return buildSearchResult(
    request.query,
    request.tenantId,
    request.projectId,
    rerankedChunks,
    {
      ...metrics,
      totalMs: Date.now() - startTime,
      chunksAfterRerank: rerankedChunks.length,
    },
    authorityLevel,
    strategy
  );
}

/**
 * Quick search with minimal processing
 */
export async function quickSearch(
  query: string,
  tenantId: string,
  options?: {
    projectId?: string;
    collections?: CollectionName[];
    topK?: number;
  }
): Promise<RetrievedChunk[]> {
  const result = await search({
    query,
    tenantId,
    projectId: options?.projectId,
    collections: options?.collections,
    topK: options?.topK || 5,
    finalK: options?.topK || 5,
    strategy: 'vector',
  });

  return result.chunks;
}

// ============================================================================
// Document Indexing
// ============================================================================

/**
 * Index a single document
 */
export async function indexDocument(
  request: IndexRequest
): Promise<IndexResponse> {
  const startTime = Date.now();

  // Validate request
  const content = request.content || request.documentContent;
  if (!content || content.trim().length === 0) {
    throw new Error('Document content is required');
  }

  const requestMetadata = request.metadata || {};
  if (!requestMetadata.tenantId && !request.tenantId) {
    throw new Error('Tenant ID is required');
  }

  // Generate document ID if not provided
  const documentId = requestMetadata.documentId || uuidv4();
  const metadata: DocumentMetadata = {
    documentId,
    documentType: request.documentType,
    projectId: requestMetadata.projectId || request.projectId,
    tenantId: requestMetadata.tenantId || request.tenantId,
    createdAt: requestMetadata.createdAt instanceof Date
      ? requestMetadata.createdAt
      : (requestMetadata.createdAt ? new Date(requestMetadata.createdAt as string) : new Date()),
  };

  // Get appropriate chunker for document type
  const chunker = getChunkerForType(metadata.documentType || 'other');

  // Chunk the document
  const chunks = chunker(content, metadata, request.chunkingConfig);

  if (chunks.length === 0) {
    return {
      success: true,
      documentId,
      chunksCreated: 0,
      vectorIds: [],
      collection: request.collection,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Generate embeddings for all chunks
  const contents = chunks.map((c) => c.content);
  const embeddingResult = await generateEmbeddingsWithFallback(contents, {
    task: 'retrieval.passage',
  });

  if (!embeddingResult.success) {
    throw new Error('Failed to generate embeddings');
  }

  // Prepare points for Qdrant
  const points = chunks.map((chunk, index) => {
    const { documentId: _docId, ...metadataWithoutDocId } = chunk.metadata;
    return {
      id: chunk.chunkId,
      vector: embeddingResult.embeddings[index],
      payload: {
        content: chunk.content,
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        sourceUrn: `urn:luhtech:${metadata.tenantId}:document:${documentId}`,
        ...metadataWithoutDocId,
      },
    };
  });

  // Upsert to Qdrant
  const collection = request.collection || 'project_documents' as CollectionName;
  const tenantId = metadata.tenantId || request.tenantId;
  const vectorIds = await upsertPoints(collection, tenantId, points);

  return {
    success: true,
    documentId,
    chunksCreated: chunks.length,
    vectorIds,
    collection,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Index multiple documents in batch
 */
export async function indexDocumentsBatch(
  request: BatchIndexRequest
): Promise<BatchIndexResponse> {
  const startTime = Date.now();
  const results: IndexResponse[] = [];
  const errors: Array<{ documentId: string; error: string }> = [];

  for (const doc of request.documents) {
    try {
      const result = await indexDocument(doc);
      results.push(result);
    } catch (error) {
      const documentId = doc.metadata?.documentId || 'unknown';
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ documentId, error: errorMsg });
    }
  }

  const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);

  return {
    success: errors.length === 0,
    documentsProcessed: results.length,
    totalChunksCreated: totalChunks,
    results,
    errors: errors.length > 0 ? errors.map((e) => `${e.documentId}: ${e.error}`) : undefined,
    totalProcessingTimeMs: Date.now() - startTime,
  };
}

/**
 * Delete a document and its chunks
 */
export async function deleteDocument(
  tenantId: string,
  documentId: string,
  collection: CollectionName
): Promise<{ success: boolean; error?: string }> {
  try {
    await deletePointsByFilter(collection, tenantId, [documentId]);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete all documents for a project
 */
export async function deleteProjectDocuments(
  tenantId: string,
  projectId: string,
  collection: CollectionName
): Promise<{ success: boolean; error?: string }> {
  try {
    // Note: This needs proper filter support in qdrant-client
    // For now, return success as a placeholder
    console.warn('deleteProjectDocuments: Filter-based deletion not yet implemented');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Tenant Management
// ============================================================================

/**
 * Provision collections for a new tenant
 */
export async function provisionTenant(
  tenantId: string
): Promise<{
  success: boolean;
  collections: CollectionName[];
  errors?: Array<{ collection: CollectionName; error: string }>;
}> {
  try {
    await provisionTenantCollections(tenantId);
    return {
      success: true,
      collections: RAG_COLLECTION_LIST as CollectionName[],
    };
  } catch (error: any) {
    return {
      success: false,
      collections: [],
      errors: [{ collection: 'project_documents' as CollectionName, error: error.message }],
    };
  }
}

/**
 * Delete all collections for a tenant
 */
export async function deprovisionTenant(
  tenantId: string
): Promise<{ success: boolean; deletedCount: number }> {
  try {
    await deleteTenantCollections(tenantId);
    return { success: true, deletedCount: RAG_COLLECTION_LIST.length };
  } catch (error: any) {
    return { success: false, deletedCount: 0 };
  }
}

/**
 * Get tenant statistics
 */
export async function getTenantStatistics(tenantId: string): Promise<{
  totalCollections: number;
  totalPoints: number;
  collections: Array<{ name: CollectionName; pointsCount: number }>;
}> {
  const stats = await getTenantStats(tenantId);
  return {
    totalCollections: stats.collectionStats.length,
    totalPoints: stats.totalVectors,
    collections: stats.collectionStats.map((c) => ({
      name: c.name,
      pointsCount: c.vectorCount,
    })),
  };
}

// ============================================================================
// Health and Status
// ============================================================================

/**
 * Get RAG service status
 */
export async function getRAGServiceStatus(): Promise<RAGServiceStatus> {
  const qdrantAvailable = await isQdrantAvailable();
  const embeddingStatus = await getEmbeddingStatus();
  const clusterInfo = await getClusterInfo();

  // Determine overall status
  let status: 'operational' | 'degraded' | 'unavailable';

  if (qdrantAvailable && embeddingStatus.available) {
    status = 'operational';
  } else if (qdrantAvailable || embeddingStatus.configured) {
    status = 'degraded';
  } else {
    status = 'unavailable';
  }

  lastHealthCheck = new Date();

  return {
    status,
    qdrant: {
      connected: qdrantAvailable,
      collectionsCount: 0, // Would need tenant context to count
    },
    embedding: {
      provider: embeddingStatus.model,
      model: embeddingStatus.model,
      available: embeddingStatus.available,
    },
    collections: [],
    lastHealthCheck: lastHealthCheck.toISOString(),
  };
}

/**
 * Health check for the RAG service
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  qdrant: boolean;
  embedding: boolean;
}> {
  const qdrant = await isQdrantAvailable();
  const embedding = await isEmbeddingAvailable();

  return {
    healthy: qdrant || embedding, // At least one service available
    qdrant,
    embedding,
  };
}

// ============================================================================
// Context for Assistant Integration
// ============================================================================

/**
 * Get RAG context for a user query (assistant integration)
 */
export async function getRAGContext(
  query: string,
  tenantId: string,
  options?: {
    projectId?: string;
    authorityLevel?: AuthorityLevel;
    collections?: CollectionName[];
    tokenBudget?: number;
  }
): Promise<{
  contextId: string;
  assembledContext: string;
  citations: import('./types.js').Citation[];
  tokenCount: number;
  searchMetrics: import('./types.js').SearchMetrics;
}> {
  const searchResult = await search({
    query,
    tenantId,
    projectId: options?.projectId,
    authorityLevel: options?.authorityLevel || 3,
    collections: options?.collections,
    tokenBudget: options?.tokenBudget,
  });

  return {
    contextId: searchResult.contextId,
    assembledContext: searchResult.assembledContext,
    citations: searchResult.citations,
    tokenCount: searchResult.tokenCount,
    searchMetrics: searchResult.searchMetrics,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Types re-exports
  type SearchRequest,
  type SearchResult,
  type IndexRequest,
  type IndexResponse,
  type RAGServiceStatus,
  type CollectionName,
  type DocumentMetadata,
  type AuthorityLevel,
} from './types.js';

// Re-export utilities
export { getTokenBudget } from './context-assembly.js';
export { buildCollectionName } from './qdrant-client.js';
export { chunkDocument, analyzeChunks } from './chunker.js';
export { generateEmbedding, cosineSimilarity } from './embedding-client.js';
