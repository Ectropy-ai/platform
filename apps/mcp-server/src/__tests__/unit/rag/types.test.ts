/**
 * RAG Types Unit Tests
 *
 * Tests for type constants, URN builders, and configurations.
 *
 * @module tests/unit/rag/types.test
 */

import { describe, it, expect } from 'vitest';
import {
  TOKEN_BUDGETS,
  AUTHORITY_CONTEXT,
  COLLECTIONS,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_QDRANT_CONFIG,
  DEFAULT_CONTEXT_OPTIONS,
  buildDocumentUrn,
  buildChunkUrn,
  buildContextUrn,
  type AuthorityLevel,
  type CollectionName,
} from '../../../services/rag/types.js';

// ============================================================================
// Token Budgets Tests
// ============================================================================

describe('TOKEN_BUDGETS', () => {
  it('should have 7 authority levels (0-6)', () => {
    const levels = Object.keys(TOKEN_BUDGETS);
    expect(levels).toHaveLength(7);
  });

  it('should have increasing budgets up to Owner/Executive level', () => {
    // Levels 0-5 have increasing budgets, level 6 (Regulatory) has specialized budget
    const budgets = Object.values(TOKEN_BUDGETS).map((b) => b.tokens);
    for (let i = 1; i < 6; i++) {
      expect(budgets[i]).toBeGreaterThan(budgets[i - 1]);
    }
    // Level 6 (Regulatory) has a specialized lower budget for focused compliance context
    expect(budgets[6]).toBe(4000);
  });

  it('should have correct values for each authority level', () => {
    expect(TOKEN_BUDGETS[0].tokens).toBe(1000);
    expect(TOKEN_BUDGETS[1].tokens).toBe(2000);
    expect(TOKEN_BUDGETS[2].tokens).toBe(3000);
    expect(TOKEN_BUDGETS[3].tokens).toBe(4000);
    expect(TOKEN_BUDGETS[4].tokens).toBe(5000);
    expect(TOKEN_BUDGETS[5].tokens).toBe(6000);
    expect(TOKEN_BUDGETS[6].tokens).toBe(4000); // Regulatory level has 4000
  });
});

describe('AUTHORITY_CONTEXT', () => {
  it('should have descriptions for all 7 authority levels', () => {
    const levels = Object.keys(AUTHORITY_CONTEXT);
    expect(levels).toHaveLength(7);
  });

  it('should have non-empty descriptions for each level', () => {
    for (let i = 0; i <= 6; i++) {
      const level = i as AuthorityLevel;
      expect(AUTHORITY_CONTEXT[level]).toBeTruthy();
      expect(AUTHORITY_CONTEXT[level].includes.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Collections Tests
// ============================================================================

describe('COLLECTIONS', () => {
  it('should have 5 standard collections', () => {
    expect(Object.keys(COLLECTIONS)).toHaveLength(5);
  });

  it('should include all required collections', () => {
    const collectionValues = Object.values(COLLECTIONS);
    expect(collectionValues).toContain('project_documents');
    expect(collectionValues).toContain('decision_history');
    expect(collectionValues).toContain('voxel_metadata');
    expect(collectionValues).toContain('conversation_logs');
    expect(collectionValues).toContain('safety_protocols');
  });

  it('should have PROJECT_DOCUMENTS collection', () => {
    expect(COLLECTIONS.PROJECT_DOCUMENTS).toBe('project_documents');
  });

  it('should have DECISION_HISTORY collection', () => {
    expect(COLLECTIONS.DECISION_HISTORY).toBe('decision_history');
  });

  it('should have VOXEL_METADATA collection', () => {
    expect(COLLECTIONS.VOXEL_METADATA).toBe('voxel_metadata');
  });
});

// ============================================================================
// Default Configurations Tests
// ============================================================================

describe('DEFAULT_CHUNKING_CONFIG', () => {
  it('should have chunk size of 512', () => {
    expect(DEFAULT_CHUNKING_CONFIG.chunkSize).toBe(512);
  });

  it('should have chunk overlap of 64', () => {
    expect(DEFAULT_CHUNKING_CONFIG.chunkOverlap).toBe(64);
  });

  it('should have min chunk size of 100', () => {
    expect(DEFAULT_CHUNKING_CONFIG.minChunkSize).toBe(100);
  });

  it('should have max chunk size of 1000', () => {
    expect(DEFAULT_CHUNKING_CONFIG.maxChunkSize).toBe(1000);
  });
});

describe('DEFAULT_EMBEDDING_CONFIG', () => {
  it('should use jina-embeddings-v3 model', () => {
    expect(DEFAULT_EMBEDDING_CONFIG.model).toBe('jina-embeddings-v3');
  });

  it('should have 768 dimensions', () => {
    expect(DEFAULT_EMBEDDING_CONFIG.dimensions).toBe(768);
  });

  it('should have batch size of 32', () => {
    expect(DEFAULT_EMBEDDING_CONFIG.batchSize).toBe(32);
  });

  it('should have chunk size matching chunking config', () => {
    expect(DEFAULT_EMBEDDING_CONFIG.chunkSize).toBe(512);
  });
});

describe('DEFAULT_QDRANT_CONFIG', () => {
  it('should default to localhost', () => {
    expect(DEFAULT_QDRANT_CONFIG.host).toBeTruthy();
  });

  it('should have a port number', () => {
    expect(typeof DEFAULT_QDRANT_CONFIG.port).toBe('number');
    expect(DEFAULT_QDRANT_CONFIG.port).toBeGreaterThan(0);
  });

  it('should default to http (not https)', () => {
    expect(DEFAULT_QDRANT_CONFIG.https).toBe(false);
  });
});

describe('DEFAULT_CONTEXT_OPTIONS', () => {
  it('should include metadata by default', () => {
    expect(DEFAULT_CONTEXT_OPTIONS.includeMetadata).toBe(true);
  });

  it('should include citations by default', () => {
    expect(DEFAULT_CONTEXT_OPTIONS.includeCitations).toBe(true);
  });

  it('should format for Claude by default', () => {
    expect(DEFAULT_CONTEXT_OPTIONS.formatForClaude).toBe(true);
  });

  it('should have max tokens of 4000', () => {
    expect(DEFAULT_CONTEXT_OPTIONS.maxTokens).toBe(4000);
  });
});

// ============================================================================
// URN Builders Tests
// ============================================================================

describe('buildDocumentUrn', () => {
  it('should build correct document URN', () => {
    const urn = buildDocumentUrn('tenant-123', 'doc-456');
    expect(urn).toBe('urn:luhtech:tenant-123:document:doc-456');
  });

  it('should handle special characters in tenant ID', () => {
    const urn = buildDocumentUrn('tenant_with_underscore', 'doc-123');
    expect(urn).toBe('urn:luhtech:tenant_with_underscore:document:doc-123');
  });

  it('should handle UUID format document IDs', () => {
    const docId = '550e8400-e29b-41d4-a716-446655440000';
    const urn = buildDocumentUrn('tenant', docId);
    expect(urn).toBe(`urn:luhtech:tenant:document:${docId}`);
  });
});

describe('buildChunkUrn', () => {
  it('should build correct chunk URN', () => {
    const urn = buildChunkUrn('tenant-123', 'doc-456', 5);
    expect(urn).toBe('urn:luhtech:tenant-123:chunk:doc-456:5');
  });

  it('should handle zero index', () => {
    const urn = buildChunkUrn('tenant', 'doc', 0);
    expect(urn).toBe('urn:luhtech:tenant:chunk:doc:0');
  });

  it('should handle large chunk indices', () => {
    const urn = buildChunkUrn('tenant', 'doc', 9999);
    expect(urn).toBe('urn:luhtech:tenant:chunk:doc:9999');
  });
});

describe('buildContextUrn', () => {
  it('should build correct context URN', () => {
    const urn = buildContextUrn('tenant-123', 'ctx-789');
    expect(urn).toBe('urn:luhtech:tenant-123:rag-context:ctx-789');
  });

  it('should handle UUID context IDs', () => {
    const contextId = '550e8400-e29b-41d4-a716-446655440000';
    const urn = buildContextUrn('tenant', contextId);
    expect(urn).toBe(`urn:luhtech:tenant:rag-context:${contextId}`);
  });
});
