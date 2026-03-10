/**
 * RAG Client Service
 *
 * Frontend client for the RAG (Retrieval-Augmented Generation) service.
 * Handles search, document indexing, and context retrieval.
 *
 * @module services/rag
 * @version 1.0.0
 */

import { apiClient } from '../apiClient';

// ============================================================================
// Types
// ============================================================================

/**
 * Authority levels (0-6)
 */
export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Collection types
 */
export type CollectionName =
  | 'project_documents'
  | 'decision_history'
  | 'voxel_metadata'
  | 'conversation_logs'
  | 'safety_protocols';

/**
 * Document types
 */
export type DocumentType =
  | 'specification'
  | 'drawing'
  | 'rfi'
  | 'submittal'
  | 'decision'
  | 'inspection'
  | 'safety'
  | 'cost_estimate'
  | 'schedule'
  | 'contract'
  | 'correspondence'
  | 'general';

/**
 * Retrieval strategy
 */
export type RetrievalStrategy = 'vector' | 'keyword' | 'hybrid';

/**
 * Search filters
 */
export interface SearchFilters {
  documentTypes?: DocumentType[];
  dateRange?: {
    from?: string;
    to?: string;
  };
  zones?: string[];
  voxelIds?: string[];
  authors?: string[];
  tags?: string[];
}

/**
 * Search request
 */
export interface SearchRequest {
  query: string;
  tenantId: string;
  projectId?: string;
  collections?: CollectionName[];
  authorityLevel?: AuthorityLevel;
  topK?: number;
  finalK?: number;
  strategy?: RetrievalStrategy;
  filters?: SearchFilters;
  tokenBudget?: number;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  documentId: string;
  documentTitle: string;
  documentType: DocumentType;
  projectId?: string;
  tenantId: string;
  author?: string;
  zone?: string;
  voxelId?: string;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
}

/**
 * Retrieved chunk
 */
export interface RetrievedChunk {
  chunkId: string;
  content: string;
  sourceUrn: string;
  collection: CollectionName;
  vectorScore: number;
  keywordScore: number;
  fusedScore: number;
  metadata: DocumentMetadata;
}

/**
 * Citation
 */
export interface Citation {
  index: number;
  sourceUrn: string;
  title: string;
  excerpt: string;
  documentType: DocumentType;
  relevanceScore: number;
}

/**
 * Search metrics
 */
export interface SearchMetrics {
  vectorSearchMs: number;
  keywordSearchMs: number;
  rerankMs: number;
  totalMs: number;
  chunksRetrieved: number;
  chunksAfterRerank: number;
}

/**
 * Search result
 */
export interface SearchResult {
  contextId: string;
  query: string;
  projectId?: string;
  tenantId: string;
  retrievalStrategy: RetrievalStrategy;
  chunks: RetrievedChunk[];
  assembledContext: string;
  tokenCount: number;
  tokenBudget: number;
  reranked: boolean;
  citations: Citation[];
  searchMetrics: SearchMetrics;
  createdAt: string;
}

/**
 * Index request
 */
export interface IndexRequest {
  content: string;
  collection: CollectionName;
  metadata: Partial<DocumentMetadata> & { tenantId: string };
  chunkingConfig?: {
    chunkSize?: number;
    chunkOverlap?: number;
    preserveStructure?: boolean;
  };
}

/**
 * Index response
 */
export interface IndexResponse {
  documentId: string;
  chunksCreated: number;
  vectorIds: string[];
  collection: CollectionName;
  processingTimeMs: number;
}

/**
 * Tenant stats
 */
export interface TenantStats {
  tenantId: string;
  totalCollections: number;
  totalPoints: number;
  collections: Array<{ name: CollectionName; pointsCount: number }>;
}

/**
 * Service health
 */
export interface RAGHealth {
  healthy: boolean;
  qdrant: boolean;
  embedding: boolean;
}

/**
 * Service status
 */
export interface RAGStatus {
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
  lastHealthCheck: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

class RAGClientService {
  private baseURL = '/api/rag';

  /**
   * Search for relevant context
   */
  async search(request: SearchRequest): Promise<{
    success: boolean;
    data?: SearchResult;
    error?: string;
  }> {
    try {
      const response = await apiClient.post<{ success: boolean; data: SearchResult }>(
        `${this.baseURL}/search`,
        request
      );

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Search failed',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Search error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Get assembled context for a query (simplified)
   */
  async getContext(
    query: string,
    tenantId: string,
    options?: {
      projectId?: string;
      authorityLevel?: AuthorityLevel;
      tokenBudget?: number;
    }
  ): Promise<{
    success: boolean;
    data?: {
      contextId: string;
      assembledContext: string;
      citations: Citation[];
      tokenCount: number;
      searchMetrics: SearchMetrics;
    };
    error?: string;
  }> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: {
          contextId: string;
          assembledContext: string;
          citations: Citation[];
          tokenCount: number;
          searchMetrics: SearchMetrics;
        };
      }>(`${this.baseURL}/context`, {
        query,
        tenantId,
        ...options,
      });

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Context retrieval failed',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Context error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Index a document
   */
  async indexDocument(request: IndexRequest): Promise<{
    success: boolean;
    data?: IndexResponse;
    error?: string;
  }> {
    try {
      const response = await apiClient.post<{ success: boolean; data: IndexResponse }>(
        `${this.baseURL}/index`,
        request
      );

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Indexing failed',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Index error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Index multiple documents
   */
  async indexDocuments(documents: IndexRequest[]): Promise<{
    success: boolean;
    data?: {
      totalDocuments: number;
      totalChunks: number;
      vectorIds: string[];
      processingTimeMs: number;
      errors?: Array<{ documentId: string; error: string }>;
    };
    error?: string;
  }> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: {
          totalDocuments: number;
          totalChunks: number;
          vectorIds: string[];
          processingTimeMs: number;
          errors?: Array<{ documentId: string; error: string }>;
        };
      }>(`${this.baseURL}/index/batch`, { documents });

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Batch indexing failed',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Batch index error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(
    documentId: string,
    tenantId: string,
    collection: CollectionName
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await apiClient.delete<{ success: boolean }>(
        `${this.baseURL}/documents/${documentId}?tenantId=${encodeURIComponent(tenantId)}&collection=${collection}`
      );

      return { success: response.success };
    } catch (error: unknown) {
      console.error('[RAG Client] Delete error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Provision collections for a tenant
   */
  async provisionTenant(tenantId: string): Promise<{
    success: boolean;
    data?: {
      tenantId: string;
      collections: CollectionName[];
      errors?: Array<{ collection: CollectionName; error: string }>;
    };
    error?: string;
  }> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: {
          tenantId: string;
          collections: CollectionName[];
          errors?: Array<{ collection: CollectionName; error: string }>;
        };
      }>(`${this.baseURL}/tenant/provision`, { tenantId });

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Provisioning failed',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Provision error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(tenantId: string): Promise<{
    success: boolean;
    data?: TenantStats;
    error?: string;
  }> {
    try {
      const response = await apiClient.get<{ success: boolean; data: TenantStats }>(
        `${this.baseURL}/tenant/${tenantId}/stats`
      );

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Failed to get stats',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Stats error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<{
    success: boolean;
    data?: RAGHealth;
    error?: string;
  }> {
    try {
      const response = await apiClient.get<{ success: boolean; data: RAGHealth }>(
        `${this.baseURL}/health`
      );

      if (response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: 'Health check failed',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Health error:', error);
      return {
        success: false,
        error: 'Health check failed',
      };
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    success: boolean;
    data?: RAGStatus;
    error?: string;
  }> {
    try {
      const response = await apiClient.get<{ success: boolean; data: RAGStatus }>(
        `${this.baseURL}/status`
      );

      if (response.success && response.data) {
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error: response.error || 'Failed to get status',
      };
    } catch (error: unknown) {
      console.error('[RAG Client] Status error:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const ragClient = new RAGClientService();
export default ragClient;
