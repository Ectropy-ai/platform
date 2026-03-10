/**
 * Qdrant Client Unit Tests
 *
 * Tests for Qdrant client utility functions and collection naming.
 * Note: Network-dependent functions are tested in integration tests.
 *
 * @module tests/unit/rag/qdrant-client.test
 */

import { describe, it, expect } from 'vitest';
import { buildCollectionName } from '../../../services/rag/qdrant-client.js';
import type { CollectionName } from '../../../services/rag/types.js';

// ============================================================================
// buildCollectionName Tests
// ============================================================================

describe('buildCollectionName', () => {
  it('should build collection name with tenant prefix', () => {
    const name = buildCollectionName('tenant-123', 'project_documents');
    expect(name).toBe('tenant-123_project_documents');
  });

  it('should handle all standard collection types', () => {
    const collections: CollectionName[] = [
      'project_documents',
      'decision_history',
      'voxel_metadata',
      'conversation_logs',
      'safety_protocols',
    ];

    for (const collection of collections) {
      const name = buildCollectionName('tenant', collection);
      expect(name).toBe(`tenant_${collection}`);
    }
  });

  it('should handle tenant IDs with special characters', () => {
    const name = buildCollectionName('tenant_with_underscore', 'project_documents');
    expect(name).toBe('tenant_with_underscore_project_documents');
  });

  it('should handle UUID tenant IDs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const name = buildCollectionName(uuid, 'project_documents');
    expect(name).toBe(`${uuid}_project_documents`);
  });

  it('should produce unique names for different tenants', () => {
    const name1 = buildCollectionName('tenant-1', 'project_documents');
    const name2 = buildCollectionName('tenant-2', 'project_documents');

    expect(name1).not.toBe(name2);
  });

  it('should produce unique names for different collections', () => {
    const name1 = buildCollectionName('tenant', 'project_documents');
    const name2 = buildCollectionName('tenant', 'decision_history');

    expect(name1).not.toBe(name2);
  });

  it('should handle short tenant IDs', () => {
    const name = buildCollectionName('t1', 'project_documents');
    expect(name).toBe('t1_project_documents');
  });

  it('should handle long tenant IDs', () => {
    const longId = 'tenant-with-a-very-long-identifier-string-here';
    const name = buildCollectionName(longId, 'project_documents');
    expect(name).toBe(`${longId}_project_documents`);
  });

  it('should be consistent across multiple calls', () => {
    const name1 = buildCollectionName('tenant', 'project_documents');
    const name2 = buildCollectionName('tenant', 'project_documents');

    expect(name1).toBe(name2);
  });

  it('should use underscore as separator', () => {
    const name = buildCollectionName('tenant', 'project_documents');
    const parts = name.split('_');

    expect(parts[0]).toBe('tenant');
    // Collection name itself has underscores, so we check it ends correctly
    expect(name.endsWith('_project_documents')).toBe(true);
  });
});

// ============================================================================
// Collection Name Pattern Tests
// ============================================================================

describe('Collection Name Patterns', () => {
  it('should produce names valid for Qdrant', () => {
    const name = buildCollectionName('tenant-123', 'project_documents');

    // Qdrant collection names should be alphanumeric with underscores/hyphens
    expect(/^[a-zA-Z0-9_-]+$/.test(name)).toBe(true);
  });

  it('should produce extractable tenant ID', () => {
    const tenantId = 'tenant-123';
    const collection = 'project_documents';
    const name = buildCollectionName(tenantId, collection);

    // Should be able to extract tenant ID from the beginning
    expect(name.startsWith(tenantId)).toBe(true);
  });

  it('should produce names that can identify the collection type', () => {
    const collections: CollectionName[] = [
      'project_documents',
      'decision_history',
      'voxel_metadata',
      'conversation_logs',
      'safety_protocols',
    ];

    for (const collection of collections) {
      const name = buildCollectionName('tenant', collection);
      expect(name.endsWith(collection)).toBe(true);
    }
  });
});

// ============================================================================
// Multi-Tenant Isolation Tests
// ============================================================================

describe('Multi-Tenant Collection Isolation', () => {
  it('should ensure tenant isolation through naming', () => {
    const tenant1Collections = [
      buildCollectionName('tenant-1', 'project_documents'),
      buildCollectionName('tenant-1', 'decision_history'),
    ];

    const tenant2Collections = [
      buildCollectionName('tenant-2', 'project_documents'),
      buildCollectionName('tenant-2', 'decision_history'),
    ];

    // No overlap between tenant collections
    for (const t1col of tenant1Collections) {
      for (const t2col of tenant2Collections) {
        expect(t1col).not.toBe(t2col);
      }
    }
  });

  it('should allow listing tenant collections by prefix', () => {
    const tenantId = 'tenant-abc';
    const collections: CollectionName[] = [
      'project_documents',
      'decision_history',
      'voxel_metadata',
    ];

    const collectionNames = collections.map((c) => buildCollectionName(tenantId, c));
    const prefix = `${tenantId}_`;

    for (const name of collectionNames) {
      expect(name.startsWith(prefix)).toBe(true);
    }
  });

  it('should handle tenant IDs that look similar', () => {
    const name1 = buildCollectionName('tenant-1', 'project_documents');
    const name2 = buildCollectionName('tenant-2', 'project_documents');

    // Different tenant IDs should produce different collection names
    expect(name1).not.toBe(name2);
    expect(name1).toBe('tenant-1_project_documents');
    expect(name2).toBe('tenant-2_project_documents');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle numeric tenant IDs', () => {
    const name = buildCollectionName('12345', 'project_documents');
    expect(name).toBe('12345_project_documents');
  });

  it('should handle mixed case tenant IDs', () => {
    const name = buildCollectionName('TenantABC', 'project_documents');
    expect(name).toBe('TenantABC_project_documents');
  });

  it('should handle tenant IDs with hyphens', () => {
    const name = buildCollectionName('tenant-with-hyphens', 'project_documents');
    expect(name).toBe('tenant-with-hyphens_project_documents');
  });

  it('should produce non-empty names', () => {
    const collections: CollectionName[] = [
      'project_documents',
      'decision_history',
      'voxel_metadata',
      'conversation_logs',
      'safety_protocols',
    ];

    for (const collection of collections) {
      const name = buildCollectionName('t', collection);
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
