/**
 * RAG Layer Types
 *
 * Type definitions for the Retrieval-Augmented Generation system.
 *
 * @module services/rag/types
 * @version 1.0.0
 */

// ==============================================================================
// Collection Types
// ==============================================================================

export const RAG_COLLECTIONS = {
  PROJECT_DOCUMENTS: 'project_documents',
  DECISION_HISTORY: 'decision_history',
  VOXEL_METADATA: 'voxel_metadata',
  CONVERSATION_LOGS: 'conversation_logs',
  SAFETY_PROTOCOLS: 'safety_protocols',
} as const;

export type RagCollectionName = (typeof RAG_COLLECTIONS)[keyof typeof RAG_COLLECTIONS];

// Alias for backward compatibility
export type CollectionName = RagCollectionName;

export const RAG_COLLECTION_LIST: RagCollectionName[] = Object.values(RAG_COLLECTIONS);

// Alias for test compatibility
export const COLLECTIONS = RAG_COLLECTIONS;

// ==============================================================================
// Embedding Configuration
// ==============================================================================

export const EMBEDDING_CONFIG = {
  DIMENSIONS: 768,
  CHUNK_SIZE: 512,
  CHUNK_OVERLAP: 64,
  BATCH_SIZE: 32,
  MODEL: 'jina-embeddings-v3',
} as const;

// Config with camelCase for test compatibility
export const DEFAULT_EMBEDDING_CONFIG = {
  dimensions: EMBEDDING_CONFIG.DIMENSIONS,
  chunkSize: EMBEDDING_CONFIG.CHUNK_SIZE,
  chunkOverlap: EMBEDDING_CONFIG.CHUNK_OVERLAP,
  batchSize: EMBEDDING_CONFIG.BATCH_SIZE,
  model: EMBEDDING_CONFIG.MODEL,
} as const;

// ==============================================================================
// Chunking Configuration
// ==============================================================================

export const DEFAULT_CHUNKING_CONFIG = {
  chunkSize: 512,
  chunkOverlap: 64,
  minChunkSize: 100,
  maxChunkSize: 1000,
} as const;

// ==============================================================================
// Qdrant Configuration
// ==============================================================================

export const DEFAULT_QDRANT_CONFIG = {
  host: 'localhost',
  port: 6333,
  https: false,
  collectionPrefix: '',
  vectorSize: 768,
  distance: 'Cosine' as const,
} as const;

// ==============================================================================
// Context Assembly Configuration
// ==============================================================================

export const DEFAULT_CONTEXT_OPTIONS = {
  includeMetadata: true,
  includeCitations: true,
  formatForClaude: true,
  maxTokens: 4000,
} as const;

// ==============================================================================
// Authority Token Budgets
// ==============================================================================

export const AUTHORITY_TOKEN_BUDGETS: Record<number, AuthorityTokenBudget> = {
  0: { role: 'Field Worker', tokens: 1000, includes: ['Recent zone decisions', 'Safety alerts'] },
  1: { role: 'Foreman', tokens: 2000, includes: ['Crew assignments', 'Pending approvals', 'Zone status'] },
  2: { role: 'Superintendent', tokens: 3000, includes: ['Trade coordination', 'Open RFIs', 'Schedule context'] },
  3: { role: 'PM', tokens: 4000, includes: ['Budget status', 'Critical path', 'Stakeholder history'] },
  4: { role: 'Architect', tokens: 5000, includes: ['Design specifications', 'Change orders'] },
  5: { role: 'Owner/Executive', tokens: 6000, includes: ['Full project context', 'Financial summaries'] },
  6: { role: 'Regulatory', tokens: 4000, includes: ['Code compliance', 'Inspection history'] },
};

export interface AuthorityTokenBudget {
  role: string;
  tokens: number;
  includes: string[];
}

// Authority level type (0-6 hierarchy)
// Note: Using number for flexibility - runtime validation handles bounds
export type AuthorityLevel = number;

// Aliases for token budgets
export const TOKEN_BUDGETS = AUTHORITY_TOKEN_BUDGETS;
export const AUTHORITY_CONTEXT = AUTHORITY_TOKEN_BUDGETS;

// ==============================================================================
// Context Assembly Types (for context-assembly.ts)
// ==============================================================================

/**
 * Retrieved chunk from vector search - matches context-assembly.ts expectations
 */
export interface RetrievedChunk {
  /** Unique chunk ID */
  chunkId: string;
  /** Raw text content */
  content: string;
  /** URN identifying the source document */
  sourceUrn: string;
  /** Hybrid search fused score (vector + keyword) */
  fusedScore: number;
  /** Collection this chunk belongs to */
  collection: CollectionName;
  /** Chunk metadata */
  metadata: RetrievedChunkMetadata;
}

export interface RetrievedChunkMetadata {
  sourceUrn: string;
  sourceName: string;
  sourceType: string;
  projectId: string;
  tenantId: string;
  chunkIndex: number;
  totalChunks: number;
  /** Document ID for deduplication */
  documentId: string;
  /** Human-readable document title */
  documentTitle?: string;
  documentType?: string;
  /** Construction zone identifier */
  zone?: string;
  page?: number;
  section?: string;
  /** Creation timestamp */
  createdAt?: Date;
}

/**
 * Citation for source attribution - matches context-assembly.ts expectations
 */
export interface Citation {
  /** Citation index (1-based for display) */
  index: number;
  /** Source document URN */
  sourceUrn: string;
  /** Document title */
  title: string;
  /** Brief excerpt from the source */
  excerpt: string;
  /** Document type (spec, decision, etc.) */
  documentType?: string;
  /** Relevance score (0-1) */
  relevanceScore: number;
}

export interface ContextAssemblyOptions {
  includeMetadata?: boolean;
  includeCitations?: boolean;
  formatForClaude?: boolean;
  maxTokens?: number;
}

/**
 * Complete search result with assembled context - matches buildSearchResult expectations
 */
export interface SearchResult {
  /** Unique context assembly ID */
  contextId: string;
  /** Original search query */
  query: string;
  /** Project ID searched */
  projectId: string | undefined;
  /** Tenant ID */
  tenantId: string;
  /** Retrieval strategy used */
  retrievalStrategy: RetrievalStrategy;
  /** Retrieved chunks */
  chunks: RetrievedChunk[];
  /** Assembled context text */
  assembledContext: string;
  /** Token count of assembled context */
  tokenCount: number;
  /** Token budget based on authority level */
  tokenBudget: number;
  /** Whether results were reranked */
  reranked: boolean;
  /** Source citations */
  citations: Citation[];
  /** Search performance metrics */
  searchMetrics: SearchMetrics;
  /** Timestamp */
  createdAt: string;
}

export interface SearchMetrics {
  totalChunks: number;
  relevantChunks: number;
  searchTimeMs: number;
  embeddingTimeMs: number;
  rerankingTimeMs?: number;
  // Hybrid search timing fields
  vectorSearchMs?: number;
  keywordSearchMs?: number;
  rerankMs?: number;
  totalMs?: number;
  // Result tracking
  chunksRetrieved?: number;
  chunksAfterRerank?: number;
}

export type RetrievalStrategy = 'vector' | 'keyword' | 'hybrid';

// ==============================================================================
// Document Chunking Types (for chunker.ts)
// ==============================================================================

/**
 * Metadata for a document being chunked
 */
export interface DocumentMetadata {
  documentId: string;
  documentTitle?: string;
  documentType?: string;
  projectId?: string;
  tenantId?: string;
  sourceUrn?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * A chunk of a document for vector indexing
 */
export interface DocumentChunk {
  chunkId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  metadata: DocumentMetadata;
}

/**
 * Configuration for document chunking
 */
export interface ChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
  preserveStructure?: boolean;
  minChunkSize?: number;
  maxChunkSize?: number;
}

// ==============================================================================
// Search Types
// ==============================================================================

export interface RagSearchRequest {
  query: string;
  projectId?: string;
  tenantId: string;
  authorityLevel?: number;
  collections?: RagCollectionName[];
  filters?: RagSearchFilters;
  limit?: number;
  includeMetadata?: boolean;
  // Hybrid search parameters
  strategy?: RetrievalStrategy;
  topK?: number;
  finalK?: number;
  tokenBudget?: number;
}

export interface RagSearchFilters {
  documentType?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  voxelId?: string;
  decisionId?: string;
  tags?: string[];
  // Plural filter variants for multi-value filtering
  documentTypes?: string[];
  zones?: string[];
  voxelIds?: string[];
  authors?: string[];
}

export interface RagSearchResult {
  chunks: RagChunk[];
  citations: RagCitation[];
  assembledContext: string;
  metadata: SearchMetadata;
}

export interface SearchMetadata {
  totalChunks: number;
  tokensUsed: number;
  tokenBudget: number;
  searchDurationMs: number;
  collectionsSearched: RagCollectionName[];
  hybridScores: {
    vectorWeight: number;
    keywordWeight: number;
  };
}

// ==============================================================================
// Chunk Types
// ==============================================================================

export interface RagChunk {
  id: string;
  urn: string;
  collectionName: RagCollectionName;
  content: string;
  contentHash: string;
  score: number;
  vectorScore: number;
  keywordScore: number;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  sourceUrn: string;
  sourceType: string;
  sourceName: string;
  projectId: string;
  tenantId: string;
  chunkIndex: number;
  totalChunks: number;
  startOffset: number;
  endOffset: number;
  createdAt: Date;
  updatedAt: Date;
  documentType?: string;
  voxelId?: string;
  decisionId?: string;
  tags?: string[];
  customMetadata?: Record<string, unknown>;
  /** Document ID for cross-referencing */
  documentId?: string;
  /** Raw content (used in some indexing flows) */
  content?: string;
  /** Content hash for deduplication */
  content_hash?: string;
}

/**
 * Partial chunk metadata for upsert operations
 */
export type PartialChunkMetadata = Partial<ChunkMetadata> & {
  content?: string;
  content_hash?: string;
};

// ==============================================================================
// Citation Types
// ==============================================================================

export interface RagCitation {
  id: string;
  urn: string;
  sourceUrn: string;
  sourceName: string;
  sourceType: string;
  excerpt: string;
  relevanceScore: number;
  chunkIds: string[];
  metadata: {
    page?: number;
    section?: string;
    timestamp?: Date;
  };
}

// ==============================================================================
// Embedding Types
// ==============================================================================

export interface EmbedRequest {
  content: string;
  metadata: ChunkMetadata;
  collectionName: RagCollectionName;
}

export interface EmbedResult {
  vectorId: string;
  dimensions: number;
  contentHash: string;
}

/**
 * Embedding client configuration
 */
export interface EmbeddingConfig {
  provider: 'jina' | 'openai' | 'local';
  model: string;
  dimensions: number;
  batchSize: number;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Embedding generation request
 */
export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

/**
 * Embedding generation response
 */
export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

// ==============================================================================
// Index Types
// ==============================================================================

export interface IndexRequest {
  documentUrl?: string;
  documentContent?: string;
  /** Alias for documentContent - raw text content to index */
  content?: string;
  documentType: DocumentType;
  projectId: string;
  tenantId: string;
  metadata?: Partial<ChunkMetadata>;
  /** Target collection for indexing */
  collection?: RagCollectionName;
  /** Custom chunking configuration */
  chunkingConfig?: Partial<ChunkingConfig>;
}

export interface IndexResult {
  success: boolean;
  chunksCreated: number;
  vectorIds: string[];
  errors?: string[];
  processingTimeMs: number;
}

/**
 * Response from indexing operation
 */
export interface IndexResponse {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  vectorIds: string[];
  errors?: string[];
  processingTimeMs: number;
  /** Collection where content was indexed */
  collection?: RagCollectionName;
}

/**
 * Batch index request for multiple documents
 */
export interface BatchIndexRequest {
  documents: IndexRequest[];
  projectId: string;
  tenantId: string;
}

/**
 * Response from batch indexing
 */
export interface BatchIndexResponse {
  success: boolean;
  documentsProcessed: number;
  totalChunksCreated: number;
  results: IndexResponse[];
  errors?: string[];
  totalProcessingTimeMs: number;
}

/**
 * RAG service status
 */
export interface RAGServiceStatus {
  status: 'operational' | 'degraded' | 'unavailable';
  qdrant: {
    connected: boolean;
    collectionsCount: number;
  };
  embedding: {
    provider: string;
    model: string;
    available: boolean;
  };
  collections: CollectionInfo[];
  lastHealthCheck: string;
  errors?: string[];
}

export type DocumentType =
  | 'specification'
  | 'drawing'
  | 'rfi'
  | 'submittal'
  | 'decision'
  | 'voxel_data'
  | 'conversation'
  | 'safety_document'
  | 'contract'
  | 'change_order'
  | 'inspection_report'
  | 'other';

// ==============================================================================
// Collection Management Types
// ==============================================================================

export interface CollectionConfig {
  name: RagCollectionName;
  tenantId: string;
  dimensions: number;
  indexType: 'HNSW' | 'IVF' | 'FLAT';
  distanceMetric: 'Cosine' | 'Euclid' | 'Dot';
}

export interface CollectionInfo {
  name: string;
  vectorCount: number;
  dimensions: number;
  indexType: string;
  status: 'ready' | 'indexing' | 'error';
}

// ==============================================================================
// Hybrid Search Types
// ==============================================================================

export interface HybridSearchConfig {
  vectorWeight: number;
  keywordWeight: number;
  topK: number;
  finalK: number;
  useReranking: boolean;
}

export const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  vectorWeight: 0.7,
  keywordWeight: 0.3,
  topK: 20,
  finalK: 5,
  useReranking: true,
};

/**
 * Search request for hybrid search - alias for RagSearchRequest
 */
export type SearchRequest = RagSearchRequest;

/**
 * Search filters - alias for RagSearchFilters
 */
export type SearchFilters = RagSearchFilters;

/**
 * Qdrant vector search result
 */
export interface QdrantSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
}

// ==============================================================================
// Context Assembly Types
// ==============================================================================

export interface ContextAssemblyRequest {
  chunks: RagChunk[];
  query: string;
  authorityLevel: number;
  maxTokens?: number;
}

/**
 * Assembled context result - used by context-assembler.ts (legacy interface)
 */
export interface AssembledContext {
  context: string;
  citations: RagCitation[];
  tokensUsed: number;
  chunksIncluded: number;
  truncated: boolean;
}

/**
 * Assembled context result - used by context-assembly.ts (new interface)
 * Named differently to avoid conflicts with legacy code
 */
export interface AssembledContextResult {
  /** Unique context assembly ID */
  contextId: string;
  /** Assembled context text */
  text: string;
  /** Token count of assembled text */
  tokenCount: number;
  /** Source citations */
  citations: Citation[];
  /** Source chunks included */
  sourceChunks: RetrievedChunk[];
}

// ==============================================================================
// Error Types
// ==============================================================================

export class RagError extends Error {
  constructor(
    message: string,
    public code: RagErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RagError';
  }
}

export type RagErrorCode =
  | 'COLLECTION_NOT_FOUND'
  | 'EMBEDDING_FAILED'
  | 'SEARCH_FAILED'
  | 'INDEX_FAILED'
  | 'CONTEXT_ASSEMBLY_FAILED'
  | 'TENANT_NOT_FOUND'
  | 'INVALID_CONFIG'
  | 'RATE_LIMITED'
  | 'EXTERNAL_SERVICE_ERROR';

// ==============================================================================
// URN Builders
// ==============================================================================

export function buildRagChunkUrn(tenantId: string, collectionName: string, chunkId: string): string {
  return `urn:luhtech:${tenantId}:rag-chunk:${collectionName}:${chunkId}`;
}

export function buildRagCollectionUrn(tenantId: string, collectionName: string): string {
  return `urn:luhtech:${tenantId}:rag-collection:${collectionName}`;
}

export function buildRagCitationUrn(tenantId: string, citationId: string): string {
  return `urn:luhtech:${tenantId}:rag-citation:${citationId}`;
}

export function getTenantCollectionName(baseName: RagCollectionName, tenantId: string): string {
  return `${tenantId}_${baseName}`;
}

export function buildDocumentUrn(tenantId: string, documentId: string): string {
  return `urn:luhtech:${tenantId}:document:${documentId}`;
}

export function buildChunkUrn(tenantId: string, documentId: string, chunkIndex: number): string {
  return `urn:luhtech:${tenantId}:chunk:${documentId}:${chunkIndex}`;
}

export function buildContextUrn(tenantId: string, contextId: string): string {
  return `urn:luhtech:${tenantId}:rag-context:${contextId}`;
}
