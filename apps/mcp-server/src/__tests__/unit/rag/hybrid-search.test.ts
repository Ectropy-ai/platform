/**
 * Hybrid Search Unit Tests
 *
 * Tests for hybrid search, RRF fusion, and search strategy utilities.
 *
 * @module tests/unit/rag/hybrid-search.test
 */

import { describe, it, expect } from 'vitest';
import {
  fuseResults,
  rerankResults,
  determineSearchStrategy,
  calculateTopK,
} from '../../../services/rag/hybrid-search.js';
import type { RetrievedChunk, CollectionName } from '../../../services/rag/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createVectorResult = (
  id: string,
  rank: number,
  score: number,
  collection: CollectionName = 'project_documents'
): { rank: number; score: number; payload: Record<string, unknown>; collection: CollectionName } => ({
  rank,
  score,
  payload: { id },
  collection,
});

const createTestChunk = (overrides?: Partial<RetrievedChunk>): RetrievedChunk => ({
  chunkId: 'chunk-001',
  content: 'This is test content for the chunk.',
  sourceUrn: 'urn:luhtech:tenant-1:document:doc-001',
  collection: 'project_documents',
  vectorScore: 0.9,
  keywordScore: 0.5,
  fusedScore: 0.85,
  metadata: {
    documentId: 'doc-001',
    documentTitle: 'Test Document',
    documentType: 'general',
    tenantId: 'tenant-1',
    createdAt: new Date().toISOString(),
  },
  ...overrides,
});

// ============================================================================
// fuseResults Tests
// ============================================================================

describe('fuseResults', () => {
  it('should return empty array when both inputs are empty', () => {
    const vectorResults = new Map();
    const keywordResults = new Map();
    const fused = fuseResults(vectorResults, keywordResults);

    expect(fused).toHaveLength(0);
  });

  it('should handle only vector results', () => {
    const vectorResults = new Map([
      ['id-1', createVectorResult('id-1', 1, 0.9)],
      ['id-2', createVectorResult('id-2', 2, 0.8)],
    ]);
    const keywordResults = new Map();

    const fused = fuseResults(vectorResults, keywordResults);

    expect(fused).toHaveLength(2);
    expect(fused[0].id).toBe('id-1'); // Higher score first
    expect(fused[0].vectorScore).toBe(0.9);
    expect(fused[0].keywordScore).toBe(0);
  });

  it('should handle only keyword results', () => {
    const vectorResults = new Map();
    const keywordResults = new Map([
      ['id-1', createVectorResult('id-1', 1, 0.85)],
      ['id-2', createVectorResult('id-2', 2, 0.75)],
    ]);

    const fused = fuseResults(vectorResults, keywordResults);

    expect(fused).toHaveLength(2);
    expect(fused[0].vectorScore).toBe(0);
    expect(fused[0].keywordScore).toBeGreaterThan(0);
  });

  it('should fuse overlapping results with RRF', () => {
    const vectorResults = new Map([
      ['id-overlap', createVectorResult('id-overlap', 1, 0.9)],
      ['id-vector-only', createVectorResult('id-vector-only', 2, 0.8)],
    ]);
    const keywordResults = new Map([
      ['id-overlap', createVectorResult('id-overlap', 2, 0.7)],
      ['id-keyword-only', createVectorResult('id-keyword-only', 1, 0.85)],
    ]);

    const fused = fuseResults(vectorResults, keywordResults);

    expect(fused).toHaveLength(3);

    // Find the overlapping result - should have highest fused score
    const overlapResult = fused.find((r) => r.id === 'id-overlap');
    expect(overlapResult).toBeDefined();
    expect(overlapResult!.vectorScore).toBe(0.9);
    expect(overlapResult!.keywordScore).toBe(0.7);

    // Fused score should be boosted for items in both lists
    expect(overlapResult!.fusedScore).toBeGreaterThan(0);
  });

  it('should sort results by fused score descending', () => {
    const vectorResults = new Map([
      ['id-1', createVectorResult('id-1', 3, 0.5)],
      ['id-2', createVectorResult('id-2', 1, 0.9)],
      ['id-3', createVectorResult('id-3', 2, 0.7)],
    ]);
    const keywordResults = new Map();

    const fused = fuseResults(vectorResults, keywordResults);

    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1].fusedScore).toBeGreaterThanOrEqual(fused[i].fusedScore);
    }
  });

  it('should preserve collection information', () => {
    const vectorResults = new Map([
      ['id-1', createVectorResult('id-1', 1, 0.9, 'decision_history')],
    ]);
    const keywordResults = new Map();

    const fused = fuseResults(vectorResults, keywordResults);

    expect(fused[0].collection).toBe('decision_history');
  });

  it('should handle large result sets', () => {
    const vectorResults = new Map();
    const keywordResults = new Map();

    for (let i = 0; i < 100; i++) {
      vectorResults.set(`v-${i}`, createVectorResult(`v-${i}`, i + 1, 1 - i * 0.01));
      keywordResults.set(`k-${i}`, createVectorResult(`k-${i}`, i + 1, 1 - i * 0.01));
    }

    const fused = fuseResults(vectorResults, keywordResults);

    expect(fused.length).toBe(200);
    // Should still be sorted
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1].fusedScore).toBeGreaterThanOrEqual(fused[i].fusedScore);
    }
  });
});

// ============================================================================
// rerankResults Tests
// ============================================================================

describe('rerankResults', () => {
  it('should return limited results based on finalK', () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      createTestChunk({
        chunkId: `chunk-${i}`,
        content: `Content ${i}`,
        fusedScore: 0.9 - i * 0.05,
      })
    );

    const reranked = rerankResults('test query', chunks, 5);

    expect(reranked).toHaveLength(5);
  });

  it('should boost chunks containing query terms', () => {
    const chunks = [
      createTestChunk({
        chunkId: 'no-match',
        content: 'This content does not contain the search terms.',
        fusedScore: 0.8,
      }),
      createTestChunk({
        chunkId: 'match',
        content: 'This content contains concrete specifications for the project.',
        fusedScore: 0.8,
      }),
    ];

    const reranked = rerankResults('concrete specifications', chunks, 2);

    // The chunk with matching terms should be boosted
    expect(reranked[0].chunkId).toBe('match');
  });

  it('should handle empty chunks array', () => {
    const reranked = rerankResults('query', [], 5);
    expect(reranked).toHaveLength(0);
  });

  it('should handle finalK larger than chunks length', () => {
    const chunks = createTestChunks(3);
    const reranked = rerankResults('query', chunks, 10);

    expect(reranked).toHaveLength(3);
  });

  it('should boost recent documents', () => {
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year ago
    const newDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago

    const chunks = [
      createTestChunk({
        chunkId: 'old',
        content: 'Same content here.',
        fusedScore: 0.8,
        metadata: {
          ...createTestChunk().metadata,
          createdAt: oldDate,
        },
      }),
      createTestChunk({
        chunkId: 'new',
        content: 'Same content here.',
        fusedScore: 0.8,
        metadata: {
          ...createTestChunk().metadata,
          createdAt: newDate,
        },
      }),
    ];

    const reranked = rerankResults('content', chunks, 2);

    // Newer document should be boosted
    expect(reranked[0].chunkId).toBe('new');
  });

  it('should maintain sorted order by boosted score', () => {
    const chunks = createTestChunks(10);
    const reranked = rerankResults('test query', chunks, 10);

    for (let i = 1; i < reranked.length; i++) {
      expect(reranked[i - 1].fusedScore).toBeGreaterThanOrEqual(reranked[i].fusedScore);
    }
  });
});

// Helper to create test chunks for reranking
function createTestChunks(count: number): RetrievedChunk[] {
  return Array.from({ length: count }, (_, i) =>
    createTestChunk({
      chunkId: `chunk-${i}`,
      content: `Content for chunk ${i}. Testing rerank functionality.`,
      fusedScore: 0.9 - i * 0.05,
    })
  );
}

// ============================================================================
// determineSearchStrategy Tests
// ============================================================================

describe('determineSearchStrategy', () => {
  it('should return vector for very short queries', () => {
    const strategy = determineSearchStrategy('hello');
    expect(strategy).toBe('vector');
  });

  it('should return vector for two-word queries', () => {
    const strategy = determineSearchStrategy('concrete specs');
    expect(strategy).toBe('vector');
  });

  it('should return hybrid for longer queries', () => {
    const strategy = determineSearchStrategy('what are the concrete specifications for zone A');
    expect(strategy).toBe('hybrid');
  });

  it('should return hybrid for queries with identifiers', () => {
    const strategy = determineSearchStrategy('find RFI-123 details');
    expect(strategy).toBe('hybrid');
  });

  it('should return hybrid for VOX identifier', () => {
    const strategy = determineSearchStrategy('get VOX-456 information');
    expect(strategy).toBe('hybrid');
  });

  it('should return hybrid for DEC identifier', () => {
    const strategy = determineSearchStrategy('what is DEC-789 about');
    expect(strategy).toBe('hybrid');
  });

  it('should handle empty query', () => {
    const strategy = determineSearchStrategy('');
    expect(strategy).toBe('vector');
  });

  it('should handle whitespace-only query', () => {
    const strategy = determineSearchStrategy('   ');
    expect(strategy).toBe('vector');
  });

  it('should return hybrid as default for medium-length queries', () => {
    const strategy = determineSearchStrategy('concrete foundation specifications requirements');
    expect(strategy).toBe('hybrid');
  });
});

// ============================================================================
// calculateTopK Tests
// ============================================================================

describe('calculateTopK', () => {
  it('should calculate reasonable topK for small budget', () => {
    const topK = calculateTopK(1000);

    expect(topK).toBeGreaterThanOrEqual(3);
    expect(topK).toBeLessThanOrEqual(20);
  });

  it('should calculate higher topK for larger budget', () => {
    const smallBudget = calculateTopK(1000);
    const largeBudget = calculateTopK(8000);

    expect(largeBudget).toBeGreaterThanOrEqual(smallBudget);
  });

  it('should respect minimum topK of 3', () => {
    const topK = calculateTopK(100);
    expect(topK).toBeGreaterThanOrEqual(3);
  });

  it('should respect maximum topK of 20', () => {
    const topK = calculateTopK(100000);
    expect(topK).toBeLessThanOrEqual(20);
  });

  it('should use custom average chunk tokens', () => {
    const topK128 = calculateTopK(4000, 128);
    const topK256 = calculateTopK(4000, 256);

    // Larger chunks should result in fewer retrieved
    expect(topK128).toBeGreaterThan(topK256);
  });

  it('should calculate topK for PM authority level budget', () => {
    const pmBudget = 4000;
    const topK = calculateTopK(pmBudget);

    // Should return reasonable number for default PM budget
    // With 4000 tokens * 0.8 / 128 avg tokens = ~25, clamped to max 20
    expect(topK).toBeGreaterThanOrEqual(5);
    expect(topK).toBeLessThanOrEqual(20);
  });
});
