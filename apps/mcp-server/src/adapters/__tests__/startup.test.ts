/**
 * Adapter Startup Tests
 *
 * Tests for the adapter initialization module.
 *
 * @module adapters/__tests__/startup.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { initializeAdapters } from '../startup.js';
import { ContextRegistry } from '../context-registry.js';
import { DATA_FILES } from '../../config/data-paths.config.js';

const hasDataFiles =
  existsSync(DATA_FILES.currentTruth) &&
  existsSync(DATA_FILES.roadmap) &&
  existsSync(DATA_FILES.decisionLog);

describe('initializeAdapters', () => {
  beforeEach(() => {
    ContextRegistry.resetInstance();
  });

  it.skipIf(!hasDataFiles)(
    'registers the platform adapter successfully',
    async () => {
      const result = await initializeAdapters();

      expect(result.registered).toContain('platform');
      expect(result.failed).toHaveLength(0);

      // Verify registry has the adapter
      const registry = ContextRegistry.getInstance();
      expect(registry.hasAdapter('platform')).toBe(true);
    }
  );

  it.skipIf(!hasDataFiles)(
    'platform adapter is functional after initialization',
    async () => {
      await initializeAdapters();

      const registry = ContextRegistry.getInstance();
      const adapter = registry.getAdapter('platform');

      // Adapter should respond to queries
      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
    }
  );

  it.skipIf(!hasDataFiles)(
    'idempotent — second call does not crash',
    async () => {
      // First initialization
      const result1 = await initializeAdapters();
      expect(result1.registered).toContain('platform');

      // Second initialization — adapter already registered
      // Should fail gracefully (ContextRegistry throws on duplicate)
      const result2 = await initializeAdapters();
      expect(result2.failed).toContain('platform');
    }
  );
});
