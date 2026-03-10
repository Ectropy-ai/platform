/**
 * Context Registry Tests
 *
 * Tests the multi-adapter management layer that enables
 * the decision engine to operate across multiple domains.
 *
 * @module adapters/__tests__
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextRegistry } from '../context-registry.js';
import type {
  IContextAdapter,
  AdapterHealthStatus,
} from '../universal/context-adapter.interface.js';
import type {
  DomainContext,
  IWorkUnit,
  IDecision,
  IDependency,
  IStateNode,
  IContainer,
  IAuthorityCascade,
  IHealthAssessment,
  IHealthMetric,
  IWorkRecommendation,
  WorkUnitFilter,
  DecisionFilter,
  StateNodeFilter,
} from '../universal/universal.types.js';
import type { EigenmodeVector } from '../../types/dual-process.types.js';

// ============================================================================
// Mock Adapter
// ============================================================================

function createMockAdapter(domainId: string): IContextAdapter {
  const domain: DomainContext = {
    domainId,
    domainName: `${domainId} Domain`,
    domainVersion: '1.0.0',
  };

  return {
    getDomainContext: vi.fn(() => domain),
    getWorkUnits: vi.fn(async () => []),
    getWorkUnit: vi.fn(async () => null),
    getDecisions: vi.fn(async () => []),
    getDecision: vi.fn(async () => null),
    getDependencies: vi.fn(async () => []),
    getStateNodes: vi.fn(async () => []),
    getStateNode: vi.fn(async () => null),
    getContainers: vi.fn(async () => []),
    getActiveContainer: vi.fn(async () => null),
    getAuthorityCascade: vi.fn(async () => ({
      domain,
      levels: [],
      escalationTimeouts: {},
    })),
    computeHealthAssessment: vi.fn(async () => ({
      domain,
      overallHealth: 'healthy' as const,
      score: 85,
      metrics: [],
      eigenmodeVector: new Array(12).fill(0.7) as EigenmodeVector,
      assessedAt: new Date().toISOString(),
    })),
    computeEigenmodeVector: vi.fn(
      async () => new Array(12).fill(0.7) as EigenmodeVector
    ),
    computeMetric: vi.fn(async () => null),
    getWorkRecommendations: vi.fn(async () => []),
    initialize: vi.fn(async () => {}),
    healthCheck: vi.fn(
      async (): Promise<AdapterHealthStatus> => ({
        healthy: true,
        source: domainId,
        lastDataRead: new Date().toISOString(),
        latencyMs: 5,
        entityCounts: {
          workUnits: 10,
          decisions: 5,
          stateNodes: 20,
          containers: 3,
        },
      })
    ),
    clearCache: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ContextRegistry', () => {
  beforeEach(() => {
    ContextRegistry.resetInstance();
  });

  afterEach(() => {
    ContextRegistry.resetInstance();
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = ContextRegistry.getInstance();
      const b = ContextRegistry.getInstance();
      expect(a).toBe(b);
    });

    it('should return a new instance after reset', () => {
      const a = ContextRegistry.getInstance();
      ContextRegistry.resetInstance();
      const b = ContextRegistry.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('register', () => {
    it('should register an adapter successfully', async () => {
      const registry = ContextRegistry.getInstance();
      const adapter = createMockAdapter('platform');

      await registry.register(adapter);

      expect(registry.hasAdapter('platform')).toBe(true);
      expect(adapter.initialize).toHaveBeenCalledOnce();
      expect(adapter.healthCheck).toHaveBeenCalledOnce();
    });

    it('should throw on duplicate registration', async () => {
      const registry = ContextRegistry.getInstance();
      const adapter1 = createMockAdapter('platform');
      const adapter2 = createMockAdapter('platform');

      await registry.register(adapter1);

      await expect(registry.register(adapter2)).rejects.toThrow(
        /already registered/
      );
    });

    it('should register multiple adapters for different domains', async () => {
      const registry = ContextRegistry.getInstance();
      const platform = createMockAdapter('platform');
      const construction = createMockAdapter('construction');

      await registry.register(platform);
      await registry.register(construction);

      expect(registry.getDomainIds()).toHaveLength(2);
      expect(registry.hasAdapter('platform')).toBe(true);
      expect(registry.hasAdapter('construction')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should unregister an existing adapter', async () => {
      const registry = ContextRegistry.getInstance();
      const adapter = createMockAdapter('platform');

      await registry.register(adapter);
      const result = registry.unregister('platform');

      expect(result).toBe(true);
      expect(registry.hasAdapter('platform')).toBe(false);
    });

    it('should return false for non-existent domain', () => {
      const registry = ContextRegistry.getInstance();
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getAdapter', () => {
    it('should return the registered adapter', async () => {
      const registry = ContextRegistry.getInstance();
      const adapter = createMockAdapter('platform');

      await registry.register(adapter);
      const retrieved = registry.getAdapter('platform');

      expect(retrieved).toBe(adapter);
    });

    it('should throw for non-existent domain with helpful message', () => {
      const registry = ContextRegistry.getInstance();

      expect(() => registry.getAdapter('nonexistent')).toThrow(
        /No adapter registered for domain 'nonexistent'/
      );
    });

    it('should list available domains in error message', async () => {
      const registry = ContextRegistry.getInstance();
      await registry.register(createMockAdapter('platform'));
      await registry.register(createMockAdapter('construction'));

      try {
        registry.getAdapter('healthcare');
        expect.fail('Should have thrown');
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).toContain('platform');
        expect(msg).toContain('construction');
      }
    });
  });

  describe('getDomainIds', () => {
    it('should return empty array when no adapters registered', () => {
      const registry = ContextRegistry.getInstance();
      expect(registry.getDomainIds()).toEqual([]);
    });

    it('should return all registered domain IDs', async () => {
      const registry = ContextRegistry.getInstance();
      await registry.register(createMockAdapter('platform'));
      await registry.register(createMockAdapter('construction'));

      const ids = registry.getDomainIds();
      expect(ids).toContain('platform');
      expect(ids).toContain('construction');
    });
  });

  describe('getAllAdapters', () => {
    it('should return all registered adapters', async () => {
      const registry = ContextRegistry.getInstance();
      const platform = createMockAdapter('platform');
      const construction = createMockAdapter('construction');

      await registry.register(platform);
      await registry.register(construction);

      const all = registry.getAllAdapters();
      expect(all).toHaveLength(2);
      expect(all).toContain(platform);
      expect(all).toContain(construction);
    });
  });

  describe('healthCheckAll', () => {
    it('should check all adapters', async () => {
      const registry = ContextRegistry.getInstance();
      await registry.register(createMockAdapter('platform'));
      await registry.register(createMockAdapter('construction'));

      const results = await registry.healthCheckAll();

      expect(results.size).toBe(2);
      expect(results.get('platform')?.healthy).toBe(true);
      expect(results.get('construction')?.healthy).toBe(true);
    });

    it('should handle adapter health check failures gracefully', async () => {
      const registry = ContextRegistry.getInstance();
      const failingAdapter = createMockAdapter('failing');
      (failingAdapter.healthCheck as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ healthy: true, source: 'failing' })
        .mockRejectedValueOnce(new Error('Data source unavailable'));

      await registry.register(failingAdapter);

      const results = await registry.healthCheckAll();

      expect(results.get('failing')?.healthy).toBe(false);
      expect(results.get('failing')?.error).toContain(
        'Data source unavailable'
      );
    });
  });

  describe('clearAllCaches', () => {
    it('should call clearCache on all adapters', async () => {
      const registry = ContextRegistry.getInstance();
      const platform = createMockAdapter('platform');
      const construction = createMockAdapter('construction');

      await registry.register(platform);
      await registry.register(construction);

      registry.clearAllCaches();

      expect(platform.clearCache).toHaveBeenCalledOnce();
      expect(construction.clearCache).toHaveBeenCalledOnce();
    });
  });

  describe('getSummary', () => {
    it('should return empty summary when no adapters', () => {
      const registry = ContextRegistry.getInstance();
      const summary = registry.getSummary();

      expect(summary.adapterCount).toBe(0);
      expect(summary.domainIds).toEqual([]);
      expect(summary.adapters).toEqual([]);
    });

    it('should return complete summary with adapters', async () => {
      const registry = ContextRegistry.getInstance();
      await registry.register(createMockAdapter('platform'));
      await registry.register(createMockAdapter('construction'));

      const summary = registry.getSummary();

      expect(summary.adapterCount).toBe(2);
      expect(summary.domainIds).toContain('platform');
      expect(summary.domainIds).toContain('construction');

      const platformEntry = summary.adapters.find(
        (a) => a.domainId === 'platform'
      );
      expect(platformEntry).toBeDefined();
      expect(platformEntry?.initialized).toBe(true);
      expect(platformEntry?.healthy).toBe(true);
      expect(platformEntry?.registeredAt).toBeDefined();
    });
  });
});
