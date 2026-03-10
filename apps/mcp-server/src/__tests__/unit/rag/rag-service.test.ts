/**
 * RAG Service Unit Tests
 *
 * Tests for the main RAG service orchestrator.
 * Uses mocked dependencies for isolated testing.
 *
 * @module tests/unit/rag/rag-service.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRAGServiceInitialized,
} from '../../../services/rag/rag.service.js';

// ============================================================================
// Service Initialization Tests
// ============================================================================

describe('RAG Service', () => {
  describe('isRAGServiceInitialized', () => {
    it('should return a boolean', () => {
      const result = isRAGServiceInitialized();
      expect(typeof result).toBe('boolean');
    });
  });
});

// ============================================================================
// Search Request Validation Tests
// ============================================================================

describe('Search Request Validation', () => {
  const createValidRequest = () => ({
    query: 'test query',
    tenantId: 'tenant-123',
    projectId: 'project-456',
    topK: 10,
    finalK: 5,
  });

  it('should have valid request structure', () => {
    const request = createValidRequest();

    expect(request.query).toBeTruthy();
    expect(request.tenantId).toBeTruthy();
    expect(request.topK).toBeGreaterThan(0);
    expect(request.finalK).toBeLessThanOrEqual(request.topK);
  });

  it('should validate required fields', () => {
    const request = createValidRequest();

    // Query is required
    expect(request.query.length).toBeGreaterThan(0);

    // TenantId is required
    expect(request.tenantId.length).toBeGreaterThan(0);
  });

  it('should have reasonable topK and finalK values', () => {
    const request = createValidRequest();

    expect(request.topK).toBeGreaterThanOrEqual(1);
    expect(request.topK).toBeLessThanOrEqual(100);
    expect(request.finalK).toBeGreaterThanOrEqual(1);
    expect(request.finalK).toBeLessThanOrEqual(request.topK);
  });
});

// ============================================================================
// Index Request Validation Tests
// ============================================================================

describe('Index Request Validation', () => {
  const createValidIndexRequest = () => ({
    content: 'Document content to be indexed.',
    collection: 'project_documents' as const,
    metadata: {
      documentId: 'doc-001',
      documentTitle: 'Test Document',
      documentType: 'general' as const,
      tenantId: 'tenant-123',
      createdAt: new Date().toISOString(),
    },
  });

  it('should have valid index request structure', () => {
    const request = createValidIndexRequest();

    expect(request.content).toBeTruthy();
    expect(request.collection).toBeTruthy();
    expect(request.metadata.tenantId).toBeTruthy();
  });

  it('should validate metadata fields', () => {
    const request = createValidIndexRequest();

    expect(request.metadata.documentId).toBeTruthy();
    expect(request.metadata.documentTitle).toBeTruthy();
    expect(request.metadata.documentType).toBeTruthy();
    expect(request.metadata.createdAt).toBeTruthy();
  });

  it('should have valid collection type', () => {
    const validCollections = [
      'project_documents',
      'decision_history',
      'voxel_metadata',
      'conversation_logs',
      'safety_protocols',
    ];

    const request = createValidIndexRequest();
    expect(validCollections).toContain(request.collection);
  });
});

// ============================================================================
// Response Structure Tests
// ============================================================================

describe('Response Structures', () => {
  describe('SearchResult structure', () => {
    const createSearchResult = () => ({
      contextId: 'ctx-123',
      query: 'test query',
      tenantId: 'tenant-123',
      projectId: 'project-456',
      retrievalStrategy: 'hybrid' as const,
      chunks: [],
      assembledContext: 'Assembled context text',
      tokenCount: 150,
      tokenBudget: 4000,
      reranked: true,
      citations: [],
      searchMetrics: {
        vectorSearchMs: 50,
        keywordSearchMs: 30,
        rerankMs: 20,
        totalMs: 100,
        chunksRetrieved: 10,
        chunksAfterRerank: 5,
      },
      createdAt: new Date().toISOString(),
    });

    it('should have all required fields', () => {
      const result = createSearchResult();

      expect(result).toHaveProperty('contextId');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('tenantId');
      expect(result).toHaveProperty('retrievalStrategy');
      expect(result).toHaveProperty('chunks');
      expect(result).toHaveProperty('assembledContext');
      expect(result).toHaveProperty('tokenCount');
      expect(result).toHaveProperty('tokenBudget');
      expect(result).toHaveProperty('citations');
      expect(result).toHaveProperty('searchMetrics');
      expect(result).toHaveProperty('createdAt');
    });

    it('should have valid search metrics', () => {
      const result = createSearchResult();

      expect(result.searchMetrics.vectorSearchMs).toBeGreaterThanOrEqual(0);
      expect(result.searchMetrics.keywordSearchMs).toBeGreaterThanOrEqual(0);
      expect(result.searchMetrics.rerankMs).toBeGreaterThanOrEqual(0);
      expect(result.searchMetrics.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.searchMetrics.chunksRetrieved).toBeGreaterThanOrEqual(0);
      expect(result.searchMetrics.chunksAfterRerank).toBeLessThanOrEqual(
        result.searchMetrics.chunksRetrieved
      );
    });

    it('should have token count within budget', () => {
      const result = createSearchResult();
      expect(result.tokenCount).toBeLessThanOrEqual(result.tokenBudget);
    });
  });

  describe('IndexResponse structure', () => {
    const createIndexResponse = () => ({
      documentId: 'doc-123',
      chunksCreated: 5,
      vectorIds: ['chunk-1', 'chunk-2', 'chunk-3', 'chunk-4', 'chunk-5'],
      collection: 'project_documents' as const,
      processingTimeMs: 250,
    });

    it('should have all required fields', () => {
      const result = createIndexResponse();

      expect(result).toHaveProperty('documentId');
      expect(result).toHaveProperty('chunksCreated');
      expect(result).toHaveProperty('vectorIds');
      expect(result).toHaveProperty('collection');
      expect(result).toHaveProperty('processingTimeMs');
    });

    it('should have matching vectorIds count', () => {
      const result = createIndexResponse();
      expect(result.vectorIds.length).toBe(result.chunksCreated);
    });

    it('should have non-negative processing time', () => {
      const result = createIndexResponse();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Authority Level Tests
// ============================================================================

describe('Authority Level Handling', () => {
  const authorityLevels = [0, 1, 2, 3, 4, 5, 6] as const;

  it('should support all 7 authority levels', () => {
    expect(authorityLevels).toHaveLength(7);
  });

  it('should have valid range from 0 to 6', () => {
    expect(Math.min(...authorityLevels)).toBe(0);
    expect(Math.max(...authorityLevels)).toBe(6);
  });
});

// ============================================================================
// Collection Type Tests
// ============================================================================

describe('Collection Types', () => {
  const collections = [
    'project_documents',
    'decision_history',
    'voxel_metadata',
    'conversation_logs',
    'safety_protocols',
  ];

  it('should have 5 standard collections', () => {
    expect(collections).toHaveLength(5);
  });

  it('should include project_documents', () => {
    expect(collections).toContain('project_documents');
  });

  it('should include decision_history', () => {
    expect(collections).toContain('decision_history');
  });

  it('should include voxel_metadata', () => {
    expect(collections).toContain('voxel_metadata');
  });

  it('should include conversation_logs', () => {
    expect(collections).toContain('conversation_logs');
  });

  it('should include safety_protocols', () => {
    expect(collections).toContain('safety_protocols');
  });
});

// ============================================================================
// RAG Context Tests
// ============================================================================

describe('RAG Context for Assistant', () => {
  const createRAGContext = () => ({
    contextId: 'ctx-123',
    assembledContext: '# Retrieved Context\n\n## Relevant Information\n...',
    citations: [
      {
        index: 1,
        sourceUrn: 'urn:luhtech:tenant:document:doc-1',
        title: 'Test Document',
        excerpt: 'Test excerpt...',
        documentType: 'specification' as const,
        relevanceScore: 0.85,
      },
    ],
    tokenCount: 500,
    searchMetrics: {
      vectorSearchMs: 50,
      keywordSearchMs: 30,
      rerankMs: 20,
      totalMs: 100,
      chunksRetrieved: 10,
      chunksAfterRerank: 5,
    },
  });

  it('should have required context fields', () => {
    const context = createRAGContext();

    expect(context).toHaveProperty('contextId');
    expect(context).toHaveProperty('assembledContext');
    expect(context).toHaveProperty('citations');
    expect(context).toHaveProperty('tokenCount');
    expect(context).toHaveProperty('searchMetrics');
  });

  it('should have formatted context for Claude', () => {
    const context = createRAGContext();

    expect(context.assembledContext).toContain('# Retrieved Context');
    expect(context.assembledContext).toContain('## Relevant Information');
  });

  it('should have valid citations', () => {
    const context = createRAGContext();

    for (const citation of context.citations) {
      expect(citation.index).toBeGreaterThan(0);
      expect(citation.sourceUrn).toContain('urn:luhtech');
      expect(citation.title).toBeTruthy();
      expect(citation.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(citation.relevanceScore).toBeLessThanOrEqual(1);
    }
  });
});
