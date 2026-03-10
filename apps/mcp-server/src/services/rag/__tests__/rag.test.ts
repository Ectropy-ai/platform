/**
 * RAG Layer Unit Tests
 *
 * Comprehensive test suite for the RAG layer components.
 *
 * @module tests/services/rag
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==============================================================================
// Types Tests
// ==============================================================================

describe('RAG Types', () => {
  describe('RAG_COLLECTIONS', () => {
    it('should have 5 standard collections', async () => {
      const { RAG_COLLECTIONS, RAG_COLLECTION_LIST } = await import('../types.js');
      expect(RAG_COLLECTION_LIST).toHaveLength(5);
      expect(RAG_COLLECTIONS.PROJECT_DOCUMENTS).toBe('project_documents');
      expect(RAG_COLLECTIONS.DECISION_HISTORY).toBe('decision_history');
      expect(RAG_COLLECTIONS.VOXEL_METADATA).toBe('voxel_metadata');
      expect(RAG_COLLECTIONS.CONVERSATION_LOGS).toBe('conversation_logs');
      expect(RAG_COLLECTIONS.SAFETY_PROTOCOLS).toBe('safety_protocols');
    });
  });

  describe('EMBEDDING_CONFIG', () => {
    it('should have correct Jina v3 configuration', async () => {
      const { EMBEDDING_CONFIG } = await import('../types.js');
      expect(EMBEDDING_CONFIG.DIMENSIONS).toBe(768);
      expect(EMBEDDING_CONFIG.CHUNK_SIZE).toBe(512);
      expect(EMBEDDING_CONFIG.CHUNK_OVERLAP).toBe(64);
      expect(EMBEDDING_CONFIG.BATCH_SIZE).toBe(32);
      expect(EMBEDDING_CONFIG.MODEL).toBe('jina-embeddings-v3');
    });
  });

  describe('AUTHORITY_TOKEN_BUDGETS', () => {
    it('should have token budgets for all authority levels', async () => {
      const { AUTHORITY_TOKEN_BUDGETS } = await import('../types.js');
      expect(AUTHORITY_TOKEN_BUDGETS[0].role).toBe('Field Worker');
      expect(AUTHORITY_TOKEN_BUDGETS[0].tokens).toBe(1000);
      expect(AUTHORITY_TOKEN_BUDGETS[3].role).toBe('PM');
      expect(AUTHORITY_TOKEN_BUDGETS[3].tokens).toBe(4000);
      expect(AUTHORITY_TOKEN_BUDGETS[5].role).toBe('Owner/Executive');
      expect(AUTHORITY_TOKEN_BUDGETS[5].tokens).toBe(6000);
    });
  });

  describe('URN Builders', () => {
    it('should build correct chunk URN', async () => {
      const { buildRagChunkUrn } = await import('../types.js');
      const urn = buildRagChunkUrn('tenant-123', 'project_documents', 'chunk-456');
      expect(urn).toBe('urn:luhtech:tenant-123:rag-chunk:project_documents:chunk-456');
    });

    it('should build correct collection URN', async () => {
      const { buildRagCollectionUrn } = await import('../types.js');
      const urn = buildRagCollectionUrn('tenant-123', 'decision_history');
      expect(urn).toBe('urn:luhtech:tenant-123:rag-collection:decision_history');
    });

    it('should build correct tenant collection name', async () => {
      const { getTenantCollectionName } = await import('../types.js');
      const name = getTenantCollectionName('project_documents', 'tenant-abc');
      expect(name).toBe('tenant-abc_project_documents');
    });
  });

  describe('DEFAULT_HYBRID_CONFIG', () => {
    it('should have correct hybrid search defaults', async () => {
      const { DEFAULT_HYBRID_CONFIG } = await import('../types.js');
      expect(DEFAULT_HYBRID_CONFIG.vectorWeight).toBe(0.7);
      expect(DEFAULT_HYBRID_CONFIG.keywordWeight).toBe(0.3);
      expect(DEFAULT_HYBRID_CONFIG.topK).toBe(20);
      expect(DEFAULT_HYBRID_CONFIG.finalK).toBe(5);
      expect(DEFAULT_HYBRID_CONFIG.useReranking).toBe(true);
    });
  });
});

// ==============================================================================
// Embeddings Service Tests
// ==============================================================================

describe('Embeddings Service', () => {
  describe('generateContentHash', () => {
    it('should generate consistent hash for same content', async () => {
      const { generateContentHash } = await import('../embeddings-service.js');
      const hash1 = generateContentHash('test content');
      const hash2 = generateContentHash('test content');
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
    });

    it('should generate different hashes for different content', async () => {
      const { generateContentHash } = await import('../embeddings-service.js');
      const hash1 = generateContentHash('content A');
      const hash2 = generateContentHash('content B');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate correct similarity for identical vectors', async () => {
      const { cosineSimilarity } = await import('../embeddings-service.js');
      const vector = [1, 0, 0, 0];
      const similarity = cosineSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1.0);
    });

    it('should calculate correct similarity for orthogonal vectors', async () => {
      const { cosineSimilarity } = await import('../embeddings-service.js');
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(0);
    });

    it('should calculate correct similarity for opposite vectors', async () => {
      const { cosineSimilarity } = await import('../embeddings-service.js');
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1.0);
    });

    it('should throw error for vectors with different dimensions', async () => {
      const { cosineSimilarity } = await import('../embeddings-service.js');
      const a = [1, 0, 0];
      const b = [1, 0];
      expect(() => cosineSimilarity(a, b)).toThrow();
    });
  });
});

// ==============================================================================
// Chunk Service Tests
// ==============================================================================

describe('Chunk Service', () => {
  describe('chunkDocument', () => {
    it('should chunk a document into smaller pieces', async () => {
      const { chunkDocument } = await import('../chunk-service.js');

      const content = 'This is the first sentence. This is the second sentence. '.repeat(20);
      const result = chunkDocument(content, {
        projectId: 'proj-123',
        tenantId: 'tenant-123',
        sourceUrn: 'urn:test:doc:1',
        sourceName: 'test-doc.txt',
        sourceType: 'specification',
        documentType: 'specification',
      });

      expect(result.totalChunks).toBeGreaterThan(1);
      expect(result.chunks[0].content).toBeTruthy();
      expect(result.chunks[0].metadata.projectId).toBe('proj-123');
      expect(result.chunks[0].metadata.tenantId).toBe('tenant-123');
    });

    it('should preserve chunk metadata', async () => {
      const { chunkDocument } = await import('../chunk-service.js');

      const result = chunkDocument('Short content for testing.', {
        projectId: 'proj-456',
        tenantId: 'tenant-456',
        sourceUrn: 'urn:test:doc:2',
        sourceName: 'metadata-test.txt',
        sourceType: 'decision',
        documentType: 'decision',
        additionalMetadata: { customField: 'value' },
      });

      expect(result.totalChunks).toBe(1);
      expect(result.chunks[0].metadata.sourceName).toBe('metadata-test.txt');
      expect(result.chunks[0].metadata.documentType).toBe('decision');
      expect(result.chunks[0].metadata.customMetadata).toEqual({ customField: 'value' });
    });

    it('should handle empty content gracefully', async () => {
      const { chunkDocument } = await import('../chunk-service.js');

      const result = chunkDocument('', {
        projectId: 'proj-789',
        tenantId: 'tenant-789',
        sourceUrn: 'urn:test:doc:3',
        sourceName: 'empty.txt',
        sourceType: 'other',
      });

      // Empty content may result in 0 or 1 chunk depending on implementation
      expect(result.totalChunks).toBeLessThanOrEqual(1);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', async () => {
      const { estimateTokens } = await import('../chunk-service.js');

      // ~4 characters per token
      expect(estimateTokens('test')).toBe(1);
      expect(estimateTokens('test test')).toBe(3); // 9 chars / 4 = ~2-3
      expect(estimateTokens('a'.repeat(100))).toBe(25);
    });
  });

  describe('truncateToTokenBudget', () => {
    it('should not truncate text within budget', async () => {
      const { truncateToTokenBudget } = await import('../chunk-service.js');
      const text = 'Short text.';
      const result = truncateToTokenBudget(text, 100);
      expect(result).toBe(text);
    });

    it('should truncate at sentence boundary when possible', async () => {
      const { truncateToTokenBudget } = await import('../chunk-service.js');
      const text = 'First sentence. Second sentence. Third sentence.';
      const result = truncateToTokenBudget(text, 6); // ~24 chars
      expect(result).toContain('First sentence.');
      expect(result.length).toBeLessThanOrEqual(30);
    });
  });
});

// ==============================================================================
// Context Assembly Tests
// ==============================================================================

describe('Context Assembly', () => {
  describe('assembleContext', () => {
    it('should assemble context from chunks', async () => {
      const { assembleContext } = await import('../context-assembler.js');
      const { RagChunk } = await import('../types.js');

      const mockChunks = [
        {
          id: 'chunk-1',
          urn: 'urn:test:chunk:1',
          collectionName: 'project_documents',
          content: 'First chunk content about valve specifications.',
          contentHash: 'hash1',
          score: 0.95,
          vectorScore: 0.95,
          keywordScore: 0,
          metadata: {
            sourceUrn: 'urn:test:doc:1',
            sourceType: 'specification',
            sourceName: 'valve-spec.pdf',
            projectId: 'proj-123',
            tenantId: 'tenant-123',
            chunkIndex: 0,
            totalChunks: 1,
            startOffset: 0,
            endOffset: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: 'chunk-2',
          urn: 'urn:test:chunk:2',
          collectionName: 'decision_history',
          content: 'Second chunk about previous decision.',
          contentHash: 'hash2',
          score: 0.85,
          vectorScore: 0.85,
          keywordScore: 0,
          metadata: {
            sourceUrn: 'urn:test:doc:2',
            sourceType: 'decision',
            sourceName: 'decision-log.json',
            projectId: 'proj-123',
            tenantId: 'tenant-123',
            chunkIndex: 0,
            totalChunks: 1,
            startOffset: 0,
            endOffset: 50,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      const result = assembleContext({
        chunks: mockChunks,
        query: 'valve specifications',
        authorityLevel: 0,
      });

      expect(result.context).toContain('valve specifications');
      expect(result.citations).toHaveLength(2);
      expect(result.chunksIncluded).toBe(2);
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should respect token budget based on authority level', async () => {
      const { assembleContext } = await import('../context-assembler.js');

      // Create chunks that exceed field worker budget
      const largeChunks = Array.from({ length: 10 }, (_, i) => ({
        id: `chunk-${i}`,
        urn: `urn:test:chunk:${i}`,
        collectionName: 'project_documents' as const,
        content: 'A'.repeat(500), // ~125 tokens each
        contentHash: `hash${i}`,
        score: 0.9 - i * 0.05,
        vectorScore: 0.9 - i * 0.05,
        keywordScore: 0,
        metadata: {
          sourceUrn: `urn:test:doc:${i}`,
          sourceType: 'specification',
          sourceName: `doc-${i}.txt`,
          projectId: 'proj-123',
          tenantId: 'tenant-123',
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 500,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }));

      const result = assembleContext({
        chunks: largeChunks,
        query: 'test query',
        authorityLevel: 0, // Field worker: 1000 tokens
      });

      // Should not include all 10 chunks (would be ~1250 tokens)
      expect(result.chunksIncluded).toBeLessThan(10);
      expect(result.tokensUsed).toBeLessThanOrEqual(1100); // Allow some buffer
    });
  });

  describe('filterChunksByAuthority', () => {
    it('should filter sensitive documents for low authority', async () => {
      const { filterChunksByAuthority } = await import('../context-assembler.js');

      const chunks = [
        {
          id: '1',
          urn: 'urn:1',
          collectionName: 'project_documents' as const,
          content: 'Public document',
          contentHash: 'h1',
          score: 0.9,
          vectorScore: 0.9,
          keywordScore: 0,
          metadata: {
            sourceUrn: 'urn:1',
            sourceType: 'specification',
            sourceName: 'spec.pdf',
            projectId: 'p1',
            tenantId: 't1',
            chunkIndex: 0,
            totalChunks: 1,
            startOffset: 0,
            endOffset: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
            documentType: 'specification',
          },
        },
        {
          id: '2',
          urn: 'urn:2',
          collectionName: 'project_documents' as const,
          content: 'Budget document',
          contentHash: 'h2',
          score: 0.85,
          vectorScore: 0.85,
          keywordScore: 0,
          metadata: {
            sourceUrn: 'urn:2',
            sourceType: 'contract',
            sourceName: 'budget.xlsx',
            projectId: 'p1',
            tenantId: 't1',
            chunkIndex: 0,
            totalChunks: 1,
            startOffset: 0,
            endOffset: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
            documentType: 'budget',
          },
        },
      ];

      // Field worker should not see budget documents
      const filtered = filterChunksByAuthority(chunks, 0);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].metadata.documentType).toBe('specification');

      // PM (level 3) should NOT see budget documents (sensitive type requires level 4+)
      const pmFiltered = filterChunksByAuthority(chunks, 3);
      expect(pmFiltered).toHaveLength(1);
      expect(pmFiltered[0].metadata.documentType).toBe('specification');

      // Senior PM/Superintendent (level 4+) should see all documents including budget
      const seniorFiltered = filterChunksByAuthority(chunks, 4);
      expect(seniorFiltered).toHaveLength(2);
    });
  });

  describe('deduplicateChunks', () => {
    it('should remove duplicate chunks by content hash', async () => {
      const { deduplicateChunks } = await import('../context-assembler.js');

      const chunks = [
        {
          id: '1',
          urn: 'urn:1',
          collectionName: 'project_documents' as const,
          content: 'Same content',
          contentHash: 'same-hash',
          score: 0.9,
          vectorScore: 0.9,
          keywordScore: 0,
          metadata: {} as any,
        },
        {
          id: '2',
          urn: 'urn:2',
          collectionName: 'project_documents' as const,
          content: 'Same content',
          contentHash: 'same-hash',
          score: 0.85,
          vectorScore: 0.85,
          keywordScore: 0,
          metadata: {} as any,
        },
      ];

      const unique = deduplicateChunks(chunks);
      expect(unique).toHaveLength(1);
    });

    it('should keep chunks with different content', async () => {
      const { deduplicateChunks } = await import('../context-assembler.js');

      const chunks = [
        {
          id: '1',
          urn: 'urn:1',
          collectionName: 'project_documents' as const,
          content: 'First unique content',
          contentHash: 'hash-1',
          score: 0.9,
          vectorScore: 0.9,
          keywordScore: 0,
          metadata: {} as any,
        },
        {
          id: '2',
          urn: 'urn:2',
          collectionName: 'project_documents' as const,
          content: 'Second unique content',
          contentHash: 'hash-2',
          score: 0.85,
          vectorScore: 0.85,
          keywordScore: 0,
          metadata: {} as any,
        },
      ];

      const unique = deduplicateChunks(chunks);
      expect(unique).toHaveLength(2);
    });
  });
});

// ==============================================================================
// RagError Tests
// ==============================================================================

describe('RagError', () => {
  it('should create error with code', async () => {
    const { RagError } = await import('../types.js');

    const error = new RagError('Search failed', 'SEARCH_FAILED', { query: 'test' });

    expect(error.message).toBe('Search failed');
    expect(error.code).toBe('SEARCH_FAILED');
    expect(error.details).toEqual({ query: 'test' });
    expect(error.name).toBe('RagError');
  });
});

// ==============================================================================
// Integration Tests (Mocked)
// ==============================================================================

describe('RAG Service Integration', () => {
  it('should export all required components', async () => {
    const ragModule = await import('../index.js');

    // Main service
    expect(ragModule.ragService).toBeDefined();
    expect(ragModule.search).toBeDefined();
    expect(ragModule.indexDocument).toBeDefined();
    expect(ragModule.embed).toBeDefined();

    // Types
    expect(ragModule.RAG_COLLECTIONS).toBeDefined();
    expect(ragModule.EMBEDDING_CONFIG).toBeDefined();
    expect(ragModule.AUTHORITY_TOKEN_BUDGETS).toBeDefined();

    // Services
    expect(ragModule.chunkDocument).toBeDefined();
    expect(ragModule.hybridSearch).toBeDefined();
    expect(ragModule.assembleContext).toBeDefined();
  });
});
