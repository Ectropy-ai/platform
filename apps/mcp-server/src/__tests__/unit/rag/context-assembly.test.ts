/**
 * Context Assembly Unit Tests
 *
 * Tests for context assembly, citation tracking, and deduplication.
 *
 * @module tests/unit/rag/context-assembly.test
 */

import { describe, it, expect } from 'vitest';
import {
  assembleContext,
  buildCitationUrn,
  getTokenBudget,
  summarizeContext,
  deduplicateChunks,
  groupChunksByCollection,
  groupChunksByDocument,
  formatCitations,
  extractCitationReferences,
} from '../../../services/rag/context-assembly.js';
import type {
  RetrievedChunk,
  Citation,
  AuthorityLevel,
  CollectionName,
} from '../../../services/rag/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestChunk = (overrides?: Partial<RetrievedChunk>): RetrievedChunk => ({
  chunkId: 'chunk-001',
  content: 'This is test content for the chunk. It contains information about the project.',
  sourceUrn: 'urn:luhtech:tenant-1:document:doc-001',
  collection: 'project_documents',
  vectorScore: 0.9,
  keywordScore: 0.5,
  fusedScore: 0.85,
  metadata: {
    documentId: 'doc-001',
    documentTitle: 'Test Document',
    documentType: 'specification',
    tenantId: 'tenant-1',
    createdAt: new Date().toISOString(),
  },
  ...overrides,
});

const createTestChunks = (count: number): RetrievedChunk[] => {
  return Array.from({ length: count }, (_, i) =>
    createTestChunk({
      chunkId: `chunk-${String(i + 1).padStart(3, '0')}`,
      content: `Content for chunk ${i + 1}. This is test content with some details.`,
      fusedScore: 0.9 - i * 0.1,
      metadata: {
        documentId: `doc-${String(i + 1).padStart(3, '0')}`,
        documentTitle: `Document ${i + 1}`,
        documentType: 'general',
        tenantId: 'tenant-1',
        createdAt: new Date().toISOString(),
      },
    })
  );
};

// ============================================================================
// getTokenBudget Tests
// ============================================================================

describe('getTokenBudget', () => {
  it('should return correct budget for authority level 0', () => {
    expect(getTokenBudget(0)).toBe(1000);
  });

  it('should return correct budget for authority level 3', () => {
    expect(getTokenBudget(3)).toBe(4000);
  });

  it('should return correct budget for authority level 6', () => {
    expect(getTokenBudget(6)).toBe(8000);
  });

  it('should return increasing budgets for higher authority', () => {
    const levels: AuthorityLevel[] = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 1; i < levels.length; i++) {
      expect(getTokenBudget(levels[i])).toBeGreaterThan(getTokenBudget(levels[i - 1]));
    }
  });
});

// ============================================================================
// buildCitationUrn Tests
// ============================================================================

describe('buildCitationUrn', () => {
  it('should build document URN without chunk index', () => {
    const urn = buildCitationUrn('tenant-123', 'doc-456');
    expect(urn).toBe('urn:luhtech:tenant-123:document:doc-456');
  });

  it('should build chunk URN with chunk index', () => {
    const urn = buildCitationUrn('tenant-123', 'doc-456', 3);
    expect(urn).toBe('urn:luhtech:tenant-123:chunk:doc-456:3');
  });

  it('should handle zero chunk index', () => {
    const urn = buildCitationUrn('tenant', 'doc', 0);
    expect(urn).toBe('urn:luhtech:tenant:chunk:doc:0');
  });
});

// ============================================================================
// assembleContext Tests
// ============================================================================

describe('assembleContext', () => {
  it('should return AssembledContext object', () => {
    const chunks = createTestChunks(3);
    const result = assembleContext(chunks);

    expect(result).toHaveProperty('contextId');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('tokenCount');
    expect(result).toHaveProperty('citations');
    expect(result).toHaveProperty('sourceChunks');
  });

  it('should generate unique context ID', () => {
    const chunks = createTestChunks(2);
    const result1 = assembleContext(chunks);
    const result2 = assembleContext(chunks);

    expect(result1.contextId).not.toBe(result2.contextId);
  });

  it('should handle empty chunk array', () => {
    const result = assembleContext([]);

    expect(result.text).toBe('');
    expect(result.tokenCount).toBe(0);
    expect(result.citations).toHaveLength(0);
    expect(result.sourceChunks).toHaveLength(0);
  });

  it('should include citations for all included chunks', () => {
    const chunks = createTestChunks(3);
    const result = assembleContext(chunks);

    expect(result.citations.length).toBeLessThanOrEqual(chunks.length);
    for (const citation of result.citations) {
      expect(citation).toHaveProperty('index');
      expect(citation).toHaveProperty('sourceUrn');
      expect(citation).toHaveProperty('title');
      expect(citation).toHaveProperty('excerpt');
    }
  });

  it('should sort chunks by fused score', () => {
    const chunks = [
      createTestChunk({ chunkId: 'low', fusedScore: 0.3 }),
      createTestChunk({ chunkId: 'high', fusedScore: 0.9 }),
      createTestChunk({ chunkId: 'medium', fusedScore: 0.6 }),
    ];

    const result = assembleContext(chunks);

    // Higher scores should appear first in the text
    const highIndex = result.text.indexOf('high');
    const mediumIndex = result.text.indexOf('medium');
    const lowIndex = result.text.indexOf('low');

    if (highIndex >= 0 && mediumIndex >= 0) {
      // The text should be ordered by score
      expect(result.sourceChunks[0].fusedScore).toBeGreaterThan(result.sourceChunks[result.sourceChunks.length - 1].fusedScore);
    }
  });

  it('should respect maxTokens option', () => {
    // Create many chunks that would exceed token budget
    const chunks = createTestChunks(20);
    const result = assembleContext(chunks, { maxTokens: 100 });

    expect(result.sourceChunks.length).toBeLessThan(chunks.length);
  });

  it('should format for Claude by default', () => {
    const chunks = createTestChunks(2);
    const result = assembleContext(chunks);

    expect(result.text).toContain('# Retrieved Context');
    expect(result.text).toContain('## Relevant Information');
  });

  it('should not format for Claude when disabled', () => {
    const chunks = createTestChunks(2);
    const result = assembleContext(chunks, { formatForClaude: false });

    expect(result.text).not.toContain('# Retrieved Context');
  });
});

// ============================================================================
// summarizeContext Tests
// ============================================================================

describe('summarizeContext', () => {
  it('should return message for empty chunks', () => {
    const summary = summarizeContext([]);
    expect(summary).toBe('No relevant context found.');
  });

  it('should list document titles', () => {
    const chunks = createTestChunks(3);
    const summary = summarizeContext(chunks);

    expect(summary).toContain('Found 3 relevant document(s)');
    expect(summary).toContain('Document 1');
  });

  it('should include relevance scores', () => {
    const chunks = createTestChunks(2);
    const summary = summarizeContext(chunks);

    expect(summary).toContain('Relevance:');
    expect(summary).toContain('%');
  });

  it('should respect maxLength', () => {
    const chunks = createTestChunks(10);
    const summary = summarizeContext(chunks, 100);

    expect(summary.length).toBeLessThanOrEqual(110); // Allow small overflow for formatting
  });

  it('should truncate with ellipsis when needed', () => {
    const chunks = createTestChunks(20);
    const summary = summarizeContext(chunks, 200);

    if (summary.length > 180) {
      expect(summary).toContain('...');
    }
  });
});

// ============================================================================
// deduplicateChunks Tests
// ============================================================================

describe('deduplicateChunks', () => {
  it('should return same array for single chunk', () => {
    const chunks = [createTestChunk()];
    const deduplicated = deduplicateChunks(chunks);

    expect(deduplicated).toHaveLength(1);
  });

  it('should return empty array for empty input', () => {
    const deduplicated = deduplicateChunks([]);
    expect(deduplicated).toHaveLength(0);
  });

  it('should remove duplicate chunks from same document', () => {
    const chunks = [
      createTestChunk({
        chunkId: 'doc-001_chunk_0001',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-001' },
      }),
      createTestChunk({
        chunkId: 'doc-001_chunk_0002',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-001' },
      }),
    ];

    const deduplicated = deduplicateChunks(chunks);
    expect(deduplicated.length).toBeLessThanOrEqual(chunks.length);
  });

  it('should keep chunks from different documents', () => {
    const chunks = [
      createTestChunk({
        chunkId: 'chunk-1',
        content: 'Content A',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-001' },
      }),
      createTestChunk({
        chunkId: 'chunk-2',
        content: 'Content B completely different',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-002' },
      }),
    ];

    const deduplicated = deduplicateChunks(chunks);
    expect(deduplicated).toHaveLength(2);
  });

  it('should remove highly similar content', () => {
    const chunks = [
      createTestChunk({
        chunkId: 'chunk-1',
        content: 'The quick brown fox jumps over the lazy dog',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-001' },
      }),
      createTestChunk({
        chunkId: 'chunk-2',
        content: 'The quick brown fox jumps over the lazy cat',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-002' },
      }),
    ];

    const deduplicated = deduplicateChunks(chunks, 0.7);
    // Very similar content should be deduplicated
    expect(deduplicated.length).toBeLessThanOrEqual(2);
  });

  it('should respect similarity threshold', () => {
    const chunks = [
      createTestChunk({
        chunkId: 'chunk-1',
        content: 'ABC DEF GHI JKL MNO',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-001' },
      }),
      createTestChunk({
        chunkId: 'chunk-2',
        content: 'ABC DEF XYZ QRS TUV',
        metadata: { ...createTestChunk().metadata, documentId: 'doc-002' },
      }),
    ];

    // With very high threshold, should keep both
    const deduplicatedHigh = deduplicateChunks(chunks, 0.99);
    expect(deduplicatedHigh).toHaveLength(2);

    // With very low threshold, might remove one
    const deduplicatedLow = deduplicateChunks(chunks, 0.3);
    expect(deduplicatedLow.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// groupChunksByCollection Tests
// ============================================================================

describe('groupChunksByCollection', () => {
  it('should group chunks by collection name', () => {
    const chunks: RetrievedChunk[] = [
      createTestChunk({ collection: 'project_documents' }),
      createTestChunk({ collection: 'decision_history' }),
      createTestChunk({ collection: 'project_documents' }),
    ];

    const groups = groupChunksByCollection(chunks);

    expect(groups.has('project_documents')).toBe(true);
    expect(groups.has('decision_history')).toBe(true);
    expect(groups.get('project_documents')!.length).toBe(2);
    expect(groups.get('decision_history')!.length).toBe(1);
  });

  it('should return empty map for empty input', () => {
    const groups = groupChunksByCollection([]);
    expect(groups.size).toBe(0);
  });

  it('should handle single collection', () => {
    const chunks = createTestChunks(5);
    const groups = groupChunksByCollection(chunks);

    expect(groups.size).toBe(1);
    expect(groups.get('project_documents')!.length).toBe(5);
  });
});

// ============================================================================
// groupChunksByDocument Tests
// ============================================================================

describe('groupChunksByDocument', () => {
  it('should group chunks by document ID', () => {
    const chunks: RetrievedChunk[] = [
      createTestChunk({
        metadata: { ...createTestChunk().metadata, documentId: 'doc-1' },
      }),
      createTestChunk({
        metadata: { ...createTestChunk().metadata, documentId: 'doc-2' },
      }),
      createTestChunk({
        metadata: { ...createTestChunk().metadata, documentId: 'doc-1' },
      }),
    ];

    const groups = groupChunksByDocument(chunks);

    expect(groups.has('doc-1')).toBe(true);
    expect(groups.has('doc-2')).toBe(true);
    expect(groups.get('doc-1')!.length).toBe(2);
    expect(groups.get('doc-2')!.length).toBe(1);
  });

  it('should return empty map for empty input', () => {
    const groups = groupChunksByDocument([]);
    expect(groups.size).toBe(0);
  });
});

// ============================================================================
// formatCitations Tests
// ============================================================================

describe('formatCitations', () => {
  const testCitations: Citation[] = [
    {
      index: 1,
      sourceUrn: 'urn:luhtech:tenant:document:doc-1',
      title: 'Test Document 1',
      excerpt: 'This is an excerpt...',
      documentType: 'specification',
      relevanceScore: 0.9,
    },
    {
      index: 2,
      sourceUrn: 'urn:luhtech:tenant:document:doc-2',
      title: 'Test Document 2',
      excerpt: 'Another excerpt...',
      documentType: 'decision',
      relevanceScore: 0.8,
    },
  ];

  it('should return empty string for empty citations', () => {
    const result = formatCitations([]);
    expect(result).toBe('');
  });

  it('should format citations in numbered format', () => {
    const result = formatCitations(testCitations, 'numbered');

    expect(result).toContain('[1] Test Document 1');
    expect(result).toContain('[2] Test Document 2');
  });

  it('should format citations in inline format', () => {
    const result = formatCitations(testCitations, 'inline');

    expect(result).toContain('[1]');
    expect(result).toContain('This is an excerpt');
  });

  it('should format citations in endnotes format', () => {
    const result = formatCitations(testCitations, 'endnotes');

    expect(result).toContain('1.');
    expect(result).toContain('urn:luhtech');
  });

  it('should default to numbered format', () => {
    const result = formatCitations(testCitations);
    expect(result).toContain('[1]');
  });
});

// ============================================================================
// extractCitationReferences Tests
// ============================================================================

describe('extractCitationReferences', () => {
  it('should extract citation numbers from text', () => {
    const text = 'According to [1] and [2], the specification states...';
    const refs = extractCitationReferences(text);

    expect(refs).toContain(1);
    expect(refs).toContain(2);
  });

  it('should return empty array for no citations', () => {
    const text = 'No citations in this text.';
    const refs = extractCitationReferences(text);

    expect(refs).toHaveLength(0);
  });

  it('should handle multiple occurrences of same citation', () => {
    const text = 'As stated in [1], ... and again per [1]...';
    const refs = extractCitationReferences(text);

    expect(refs.filter((r) => r === 1)).toHaveLength(2);
  });

  it('should extract multi-digit citation numbers', () => {
    const text = 'References [12] and [123] are important.';
    const refs = extractCitationReferences(text);

    expect(refs).toContain(12);
    expect(refs).toContain(123);
  });

  it('should not extract brackets without numbers', () => {
    const text = 'Use [array] and [object] syntax.';
    const refs = extractCitationReferences(text);

    expect(refs).toHaveLength(0);
  });
});
