/**
 * RAG Layer Module Exports
 *
 * Central export for all RAG layer components.
 *
 * @module services/rag
 * @version 1.0.0
 */

// Main service
export { ragService, search, indexDocument, embed, healthCheck } from './rag-service.js';

// Types
export {
  // Collection constants (values)
  RAG_COLLECTIONS,
  RAG_COLLECTION_LIST,
  // Config constants (values)
  EMBEDDING_CONFIG,
  AUTHORITY_TOKEN_BUDGETS,
  DEFAULT_HYBRID_CONFIG,
  // Error class (value)
  RagError,
  // URN builders (functions)
  buildRagChunkUrn,
  buildRagCollectionUrn,
  buildRagCitationUrn,
  getTenantCollectionName,
} from './types.js';

// Type exports (isolatedModules compatibility)
export type {
  RagCollectionName,
  AuthorityTokenBudget,
  RagSearchRequest,
  RagSearchFilters,
  RagSearchResult,
  SearchMetadata,
  RagChunk,
  ChunkMetadata,
  RagCitation,
  EmbedRequest,
  EmbedResult,
  IndexRequest,
  IndexResult,
  DocumentType,
  CollectionConfig,
  CollectionInfo,
  HybridSearchConfig,
  ContextAssemblyRequest,
  AssembledContext,
  RagErrorCode,
} from './types.js';

// Qdrant client
export {
  getQdrantClient,
  createCollection,
  provisionTenantCollections,
  getCollectionInfo,
  deleteCollection,
  upsertVectors,
  searchVectors,
  deleteVectors,
  getVectors,
  healthCheck as qdrantHealthCheck,
} from './qdrant-client.js';

// Embeddings service
export {
  generateEmbeddings,
  generateEmbedding,
  generateQueryEmbedding,
  generatePassageEmbeddings,
  generateContentHash,
  cosineSimilarity,
  healthCheck as embeddingsHealthCheck,
} from './embeddings-service.js';

// Chunking service
export {
  chunkDocument,
  estimateTokens,
  truncateToTokenBudget,
} from './chunk-service.js';

export type { DocumentChunk, ChunkingResult } from './chunk-service.js';

// Search service
export { hybridSearch, semanticSearch } from './search-service.js';

// Context assembly
export {
  assembleContext,
  summarizeContext,
  filterChunksByAuthority,
  deduplicateChunks,
  enhanceContext,
} from './context-assembler.js';
