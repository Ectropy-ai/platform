/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Main orchestration service for the RAG layer.
 * Combines vector search, hybrid retrieval, and context assembly.
 *
 * @module services/rag/rag-service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  RagSearchRequest,
  RagSearchResult,
  IndexRequest,
  IndexResult,
  EmbedRequest,
  EmbedResult,
  RagCollectionName,
  RAG_COLLECTIONS,
  RAG_COLLECTION_LIST,
  DocumentType,
  RagError,
  SearchMetadata,
  DEFAULT_HYBRID_CONFIG,
  EMBEDDING_CONFIG,
  buildRagChunkUrn,
} from './types.js';
import {
  provisionTenantCollections,
  getCollectionInfo,
  upsertVectors,
  deleteVectors,
  healthCheck as qdrantHealthCheck,
} from './qdrant-client.js';
import {
  generateEmbedding,
  generatePassageEmbeddings,
  generateContentHash,
  healthCheck as embeddingsHealthCheck,
} from './embeddings-service.js';
import { chunkDocument, estimateTokens } from './chunk-service.js';
import { hybridSearch, semanticSearch } from './search-service.js';
import {
  assembleContext,
  filterChunksByAuthority,
  deduplicateChunks,
  enhanceContext,
} from './context-assembler.js';

// ==============================================================================
// Main Search Function
// ==============================================================================

/**
 * Perform RAG search and return assembled context
 */
export async function search(request: RagSearchRequest): Promise<RagSearchResult> {
  const startTime = Date.now();

  try {
    // Validate request
    validateSearchRequest(request);

    // Perform hybrid search
    const chunks = await hybridSearch(request, DEFAULT_HYBRID_CONFIG);

    // Filter by authority level
    const authorityLevel = request.authorityLevel ?? 0;
    const filteredChunks = filterChunksByAuthority(chunks, authorityLevel);

    // Deduplicate
    const uniqueChunks = deduplicateChunks(filteredChunks);

    // Assemble context
    const assembled = assembleContext({
      chunks: uniqueChunks,
      query: request.query,
      authorityLevel,
    });

    // Enhance context if needed
    const enhanced = enhanceContext(assembled, {
      includeSafetyAlerts: true,
    });

    const searchDuration = Date.now() - startTime;

    return {
      chunks: uniqueChunks,
      citations: enhanced.citations,
      assembledContext: enhanced.context,
      metadata: {
        totalChunks: chunks.length,
        tokensUsed: enhanced.tokensUsed,
        tokenBudget: enhanced.tokensUsed + 100, // Small buffer
        searchDurationMs: searchDuration,
        collectionsSearched: request.collections || RAG_COLLECTION_LIST,
        hybridScores: {
          vectorWeight: DEFAULT_HYBRID_CONFIG.vectorWeight,
          keywordWeight: DEFAULT_HYBRID_CONFIG.keywordWeight,
        },
      },
    };
  } catch (error: any) {
    throw new RagError(
      `Search failed: ${error.message}`,
      'SEARCH_FAILED',
      { query: request.query, projectId: request.projectId }
    );
  }
}

// ==============================================================================
// Document Indexing
// ==============================================================================

/**
 * Index a document into the RAG system
 */
export async function indexDocument(request: IndexRequest): Promise<IndexResult> {
  const startTime = Date.now();
  const vectorIds: string[] = [];
  const errors: string[] = [];

  try {
    // Get document content
    let content = request.documentContent;
    if (!content && request.documentUrl) {
      content = await fetchDocumentContent(request.documentUrl);
    }

    if (!content) {
      throw new RagError('No document content provided', 'INDEX_FAILED');
    }

    // Determine collection based on document type
    const collectionName = getCollectionForDocumentType(request.documentType);

    // Chunk the document
    const sourceUrn = `urn:luhtech:${request.tenantId}:document:${uuidv4()}`;
    const chunksResult = chunkDocument(content, {
      projectId: request.projectId,
      tenantId: request.tenantId,
      sourceUrn,
      sourceName: request.documentUrl || 'uploaded-document',
      sourceType: request.documentType,
      documentType: request.documentType,
      additionalMetadata: request.metadata as Record<string, unknown>,
    });

    // Generate embeddings for all chunks
    const chunkContents = chunksResult.chunks.map(c => c.content);
    const embeddings = await generatePassageEmbeddings(chunkContents);

    // Prepare vectors for upsert
    const vectors = chunksResult.chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: embeddings[index],
      payload: {
        ...chunk.metadata,
        content: chunk.content,
        content_hash: chunk.contentHash,
      },
    }));

    // Upsert to Qdrant
    const upsertedIds = await upsertVectors(collectionName, request.tenantId, vectors);
    vectorIds.push(...upsertedIds);

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      chunksCreated: chunksResult.totalChunks,
      vectorIds,
      processingTimeMs: processingTime,
    };
  } catch (error: any) {
    return {
      success: false,
      chunksCreated: 0,
      vectorIds,
      errors: [error.message],
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Embed content and store in collection
 */
export async function embed(request: EmbedRequest): Promise<EmbedResult> {
  try {
    const id = uuidv4();
    const embedding = await generateEmbedding(request.content, { task: 'passage' });
    const contentHash = generateContentHash(request.content);

    await upsertVectors(request.collectionName, request.metadata.tenantId, [
      {
        id,
        vector: embedding,
        payload: {
          ...request.metadata,
          content: request.content,
          content_hash: contentHash,
        },
      },
    ]);

    return {
      vectorId: id,
      dimensions: EMBEDDING_CONFIG.DIMENSIONS,
      contentHash,
    };
  } catch (error: any) {
    throw new RagError(
      `Embedding failed: ${error.message}`,
      'EMBEDDING_FAILED',
      { collectionName: request.collectionName }
    );
  }
}

// ==============================================================================
// Collection Management
// ==============================================================================

/**
 * Initialize collections for a new tenant
 */
export async function initializeTenant(tenantId: string): Promise<void> {
  await provisionTenantCollections(tenantId);
}

/**
 * Get status of all collections for a tenant
 */
export async function getTenantCollectionStatus(tenantId: string): Promise<{
  collections: Array<{
    name: RagCollectionName;
    status: string;
    vectorCount: number;
  }>;
}> {
  const statuses = await Promise.all(
    RAG_COLLECTION_LIST.map(async name => {
      const info = await getCollectionInfo(name, tenantId);
      return {
        name,
        status: info?.status || 'not_found',
        vectorCount: info?.vectorCount || 0,
      };
    })
  );

  return { collections: statuses };
}

// ==============================================================================
// Delete Operations
// ==============================================================================

/**
 * Delete vectors by source URN
 */
export async function deleteBySource(
  tenantId: string,
  sourceUrn: string,
  collectionName?: RagCollectionName
): Promise<{ deletedCount: number }> {
  // This would require querying Qdrant for vectors with matching source_urn
  // and then deleting them. For now, placeholder implementation.
  console.log(`Delete by source: ${sourceUrn} in tenant ${tenantId}`);
  return { deletedCount: 0 };
}

/**
 * Delete specific vectors
 */
export async function deleteVectorsByIds(
  tenantId: string,
  collectionName: RagCollectionName,
  vectorIds: string[]
): Promise<void> {
  await deleteVectors(collectionName, tenantId, vectorIds);
}

// ==============================================================================
// Health Check
// ==============================================================================

/**
 * Comprehensive health check for RAG system
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  components: {
    qdrant: { healthy: boolean; message: string; collections: number };
    embeddings: { healthy: boolean; provider: string; message: string };
  };
  message: string;
}> {
  const [qdrantHealth, embeddingsHealth] = await Promise.all([
    qdrantHealthCheck(),
    embeddingsHealthCheck(),
  ]);

  const healthy = qdrantHealth.healthy && embeddingsHealth.healthy;

  return {
    healthy,
    components: {
      qdrant: qdrantHealth,
      embeddings: embeddingsHealth,
    },
    message: healthy
      ? 'RAG system healthy'
      : `RAG system degraded: ${!qdrantHealth.healthy ? 'Qdrant ' : ''}${!embeddingsHealth.healthy ? 'Embeddings' : ''}`,
  };
}

// ==============================================================================
// Helper Functions
// ==============================================================================

function validateSearchRequest(request: RagSearchRequest): void {
  if (!request.query || request.query.trim().length === 0) {
    throw new RagError('Query is required', 'INVALID_CONFIG');
  }
  if (!request.tenantId) {
    throw new RagError('Tenant ID is required', 'TENANT_NOT_FOUND');
  }
  if (!request.projectId) {
    throw new RagError('Project ID is required', 'INVALID_CONFIG');
  }
}

function getCollectionForDocumentType(docType: DocumentType): RagCollectionName {
  switch (docType) {
    case 'specification':
    case 'drawing':
    case 'rfi':
    case 'submittal':
    case 'contract':
    case 'change_order':
      return RAG_COLLECTIONS.PROJECT_DOCUMENTS;
    case 'decision':
      return RAG_COLLECTIONS.DECISION_HISTORY;
    case 'voxel_data':
      return RAG_COLLECTIONS.VOXEL_METADATA;
    case 'conversation':
      return RAG_COLLECTIONS.CONVERSATION_LOGS;
    case 'safety_document':
    case 'inspection_report':
      return RAG_COLLECTIONS.SAFETY_PROTOCOLS;
    default:
      return RAG_COLLECTIONS.PROJECT_DOCUMENTS;
  }
}

async function fetchDocumentContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status}`);
    }
    return response.text();
  } catch (error: any) {
    throw new RagError(
      `Failed to fetch document from ${url}: ${error.message}`,
      'INDEX_FAILED'
    );
  }
}

// ==============================================================================
// Export Service
// ==============================================================================

export const ragService = {
  search,
  indexDocument,
  embed,
  initializeTenant,
  getTenantCollectionStatus,
  deleteBySource,
  deleteVectorsByIds,
  healthCheck,
};

export default ragService;
