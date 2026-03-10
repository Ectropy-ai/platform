/**
 * Document Chunker Unit Tests
 *
 * Tests for document chunking pipeline including specialized chunkers.
 *
 * @module tests/unit/rag/chunker.test
 */

import { describe, it, expect } from 'vitest';
import {
  chunkDocument,
  chunkDocuments,
  chunkSpecification,
  chunkDecisionRecord,
  chunkSafetyProtocol,
  getChunkerForType,
  analyzeChunks,
  getChunkContext,
} from '../../../services/rag/chunker.js';
import type { DocumentMetadata, DocumentChunk } from '../../../services/rag/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestMetadata = (overrides?: Partial<DocumentMetadata>): DocumentMetadata => ({
  documentId: 'test-doc-001',
  documentTitle: 'Test Document',
  documentType: 'general',
  tenantId: 'test-tenant',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const shortContent = 'This is a short test document content.';

const longContent = `
This is the first paragraph of a longer document. It contains multiple sentences
that will be used for testing the chunking functionality. The content here should
be long enough to require splitting into multiple chunks.

This is the second paragraph. It adds more content to the document. We want to
ensure that the chunker handles paragraph boundaries correctly. This paragraph
continues with more text to increase the overall length.

The third paragraph introduces new topics. It discusses different aspects of the
test content. This helps verify that the chunker preserves document structure
when the preserveStructure option is enabled.

Finally, the fourth paragraph concludes the test document. It summarizes the
key points and provides a clear ending to the content being tested.
`.trim();

const specificationContent = `
1.0 General Requirements
The concrete shall conform to all applicable standards.

1.1 Material Specifications
All materials must be certified before use.
Concrete strength: minimum 4000 psi at 28 days.

1.2 Installation Requirements
Install per manufacturer specifications.
Maintain proper curing conditions.

2.0 Testing Requirements
2.1 Compressive strength testing required.
2.2 Slump tests at point of delivery.
`.trim();

const safetyContent = `
SAFETY PROTOCOL: Working at Heights

Step 1: Inspect all fall protection equipment before use.
Step 2: Identify anchor points and secure harness.
Step 3: Maintain three points of contact while climbing.

WARNING: Never work at heights without proper PPE.

CAUTION: Wet surfaces increase fall risk.

Step 4: Ensure work area is clear of debris.
Step 5: Communicate with ground crew before descending.

DANGER: Do not exceed rated load capacity.
`.trim();

// ============================================================================
// chunkDocument Tests
// ============================================================================

describe('chunkDocument', () => {
  it('should return array of DocumentChunk objects', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(shortContent, metadata);

    expect(Array.isArray(chunks)).toBe(true);
    for (const chunk of chunks) {
      expect(chunk).toHaveProperty('chunkId');
      expect(chunk).toHaveProperty('documentId');
      expect(chunk).toHaveProperty('content');
      expect(chunk).toHaveProperty('chunkIndex');
      expect(chunk).toHaveProperty('totalChunks');
      expect(chunk).toHaveProperty('metadata');
    }
  });

  it('should preserve document ID in all chunks', () => {
    const metadata = createTestMetadata({ documentId: 'my-doc-123' });
    const chunks = chunkDocument(longContent, metadata);

    for (const chunk of chunks) {
      expect(chunk.documentId).toBe('my-doc-123');
    }
  });

  it('should generate unique chunk IDs', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(longContent, metadata);

    const chunkIds = chunks.map((c) => c.chunkId);
    const uniqueIds = new Set(chunkIds);
    expect(uniqueIds.size).toBe(chunkIds.length);
  });

  it('should correctly number chunks', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(longContent, metadata);

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].totalChunks).toBe(chunks.length);
    }
  });

  it('should handle empty content', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument('', metadata);

    expect(chunks).toHaveLength(0);
  });

  it('should handle whitespace-only content', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument('   \n\n   ', metadata);

    expect(chunks).toHaveLength(0);
  });

  it('should respect custom chunk size', () => {
    const metadata = createTestMetadata();
    const smallChunkConfig = { chunkSize: 50, chunkOverlap: 10, preserveStructure: true };
    const chunks = chunkDocument(longContent, metadata, smallChunkConfig);

    // With smaller chunk size, should have more chunks
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should preserve metadata in all chunks', () => {
    const metadata = createTestMetadata({
      projectId: 'project-123',
      author: 'Test Author',
      zone: 'zone-A',
    });
    const chunks = chunkDocument(longContent, metadata);

    for (const chunk of chunks) {
      expect(chunk.metadata.projectId).toBe('project-123');
      expect(chunk.metadata.author).toBe('Test Author');
      expect(chunk.metadata.zone).toBe('zone-A');
    }
  });

  it('should have content in all chunks', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(longContent, metadata);

    for (const chunk of chunks) {
      expect(chunk.content).toBeTruthy();
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// chunkDocuments Tests
// ============================================================================

describe('chunkDocuments', () => {
  it('should chunk multiple documents', () => {
    const documents = [
      { content: shortContent, metadata: createTestMetadata({ documentId: 'doc-1' }) },
      { content: shortContent, metadata: createTestMetadata({ documentId: 'doc-2' }) },
    ];

    const chunks = chunkDocuments(documents);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const docIds = new Set(chunks.map((c) => c.documentId));
    expect(docIds.has('doc-1')).toBe(true);
    expect(docIds.has('doc-2')).toBe(true);
  });

  it('should handle empty document array', () => {
    const chunks = chunkDocuments([]);
    expect(chunks).toHaveLength(0);
  });

  it('should combine chunks from all documents', () => {
    const documents = [
      { content: longContent, metadata: createTestMetadata({ documentId: 'doc-1' }) },
      { content: longContent, metadata: createTestMetadata({ documentId: 'doc-2' }) },
    ];

    const chunks = chunkDocuments(documents);

    const doc1Chunks = chunks.filter((c) => c.documentId === 'doc-1');
    const doc2Chunks = chunks.filter((c) => c.documentId === 'doc-2');

    expect(doc1Chunks.length).toBeGreaterThan(0);
    expect(doc2Chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBe(doc1Chunks.length + doc2Chunks.length);
  });
});

// ============================================================================
// Specialized Chunker Tests
// ============================================================================

describe('chunkSpecification', () => {
  it('should handle specification document', () => {
    const metadata = createTestMetadata({ documentType: 'specification' });
    const chunks = chunkSpecification(specificationContent, metadata);

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content).toBeTruthy();
    }
  });

  it('should preserve section numbers', () => {
    const metadata = createTestMetadata({ documentType: 'specification' });
    const chunks = chunkSpecification(specificationContent, metadata);

    // At least one chunk should contain a section number
    const hasSection = chunks.some((c) => /\d+\.\d+/.test(c.content));
    expect(hasSection).toBe(true);
  });
});

describe('chunkDecisionRecord', () => {
  const decisionContent = 'Decision: Approve concrete mix design. Rationale: Meets strength requirements.';

  it('should keep short decisions as single chunk', () => {
    const metadata = createTestMetadata({ documentType: 'decision' });
    const chunks = chunkDecisionRecord(decisionContent, metadata);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(decisionContent.trim());
  });

  it('should chunk long decisions with larger overlap', () => {
    const longDecision = 'Decision context. '.repeat(500);
    const metadata = createTestMetadata({ documentType: 'decision' });
    const chunks = chunkDecisionRecord(longDecision, metadata);

    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('chunkSafetyProtocol', () => {
  it('should handle safety protocol document', () => {
    const metadata = createTestMetadata({ documentType: 'safety' });
    const chunks = chunkSafetyProtocol(safetyContent, metadata);

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should preserve warning labels', () => {
    const metadata = createTestMetadata({ documentType: 'safety' });
    const chunks = chunkSafetyProtocol(safetyContent, metadata);

    const allContent = chunks.map((c) => c.content).join(' ');
    expect(allContent).toContain('WARNING');
    expect(allContent).toContain('CAUTION');
    expect(allContent).toContain('DANGER');
  });
});

// ============================================================================
// getChunkerForType Tests
// ============================================================================

describe('getChunkerForType', () => {
  it('should return specification chunker for specification type', () => {
    const chunker = getChunkerForType('specification');
    expect(chunker).toBe(chunkSpecification);
  });

  it('should return specification chunker for spec alias', () => {
    const chunker = getChunkerForType('spec');
    expect(chunker).toBe(chunkSpecification);
  });

  it('should return decision chunker for decision type', () => {
    const chunker = getChunkerForType('decision');
    expect(chunker).toBe(chunkDecisionRecord);
  });

  it('should return safety chunker for safety type', () => {
    const chunker = getChunkerForType('safety');
    expect(chunker).toBe(chunkSafetyProtocol);
  });

  it('should return safety chunker for safety_protocol type', () => {
    const chunker = getChunkerForType('safety_protocol');
    expect(chunker).toBe(chunkSafetyProtocol);
  });

  it('should return default chunker for unknown type', () => {
    const chunker = getChunkerForType('unknown');
    expect(chunker).toBe(chunkDocument);
  });

  it('should return default chunker for general type', () => {
    const chunker = getChunkerForType('general');
    expect(chunker).toBe(chunkDocument);
  });

  it('should be case-insensitive', () => {
    const chunker1 = getChunkerForType('SPECIFICATION');
    const chunker2 = getChunkerForType('Specification');
    const chunker3 = getChunkerForType('specification');

    expect(chunker1).toBe(chunker2);
    expect(chunker2).toBe(chunker3);
  });
});

// ============================================================================
// analyzeChunks Tests
// ============================================================================

describe('analyzeChunks', () => {
  it('should return zero values for empty array', () => {
    const analysis = analyzeChunks([]);

    expect(analysis.totalChunks).toBe(0);
    expect(analysis.totalTokens).toBe(0);
    expect(analysis.averageTokens).toBe(0);
    expect(analysis.minTokens).toBe(0);
    expect(analysis.maxTokens).toBe(0);
  });

  it('should calculate correct statistics', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(longContent, metadata);
    const analysis = analyzeChunks(chunks);

    expect(analysis.totalChunks).toBe(chunks.length);
    expect(analysis.totalTokens).toBeGreaterThan(0);
    expect(analysis.averageTokens).toBeGreaterThan(0);
    expect(analysis.minTokens).toBeLessThanOrEqual(analysis.averageTokens);
    expect(analysis.maxTokens).toBeGreaterThanOrEqual(analysis.averageTokens);
  });

  it('should group chunks by document', () => {
    const documents = [
      { content: longContent, metadata: createTestMetadata({ documentId: 'doc-1' }) },
      { content: longContent, metadata: createTestMetadata({ documentId: 'doc-2' }) },
    ];
    const chunks = chunkDocuments(documents);
    const analysis = analyzeChunks(chunks);

    expect(analysis.byDocument.has('doc-1')).toBe(true);
    expect(analysis.byDocument.has('doc-2')).toBe(true);
    expect(analysis.byDocument.get('doc-1')).toBeGreaterThan(0);
  });
});

// ============================================================================
// getChunkContext Tests
// ============================================================================

describe('getChunkContext', () => {
  it('should return before, current, and after chunks', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(longContent, metadata);

    if (chunks.length >= 3) {
      const context = getChunkContext(chunks, 1);

      expect(context).toHaveProperty('before');
      expect(context).toHaveProperty('current');
      expect(context).toHaveProperty('after');
    }
  });

  it('should have empty before for first chunk', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(longContent, metadata);

    if (chunks.length > 0) {
      const context = getChunkContext(chunks, 0);
      expect(context.before).toHaveLength(0);
      expect(context.current).toBe(chunks[0]);
    }
  });

  it('should have empty after for last chunk', () => {
    const metadata = createTestMetadata();
    const chunks = chunkDocument(longContent, metadata);

    if (chunks.length > 0) {
      const lastIndex = chunks.length - 1;
      const context = getChunkContext(chunks, lastIndex);
      expect(context.after).toHaveLength(0);
      expect(context.current).toBe(chunks[lastIndex]);
    }
  });

  it('should respect context size parameter', () => {
    const metadata = createTestMetadata();
    // Create content that will produce many chunks
    const veryLongContent = longContent.repeat(5);
    const chunks = chunkDocument(veryLongContent, metadata);

    if (chunks.length >= 5) {
      const context = getChunkContext(chunks, 2, 2);
      expect(context.before.length).toBeLessThanOrEqual(2);
      expect(context.after.length).toBeLessThanOrEqual(2);
    }
  });
});
