/**
 * Roadmap Resolver Tests
 *
 * Integration tests for GraphQL roadmap queries (phases, currentPhase,
 * deliverable). Validates that resolvers correctly transform the
 * quarters-based .roadmap/roadmap.json into Phase/Deliverable types.
 *
 * @group integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'fs';
import { DATA_FILES } from '../../config/data-paths.config.js';
import { createApolloServer } from '../index.js';
import type { ApolloServer } from '@apollo/server';

const hasRoadmapFile = existsSync(DATA_FILES.roadmap);

describe('Roadmap Resolvers', () => {
  let apolloServer: ApolloServer;

  beforeAll(async () => {
    if (!hasRoadmapFile) {
      return;
    }
    apolloServer = createApolloServer();
    await apolloServer.start();
  });

  // ==========================================================================
  // phases query
  // ==========================================================================

  describe('phases', () => {
    it.skipIf(!hasRoadmapFile)(
      'returns all phases from roadmap quarters',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          {
            phases {
              phaseId
              name
              status
              startDate
              targetDate
              completionDate
            }
          }
        `,
        });

        expect(result.body.kind).toBe('single');
        if (result.body.kind !== 'single') return;

        const data = result.body.singleResult.data;
        expect(data?.phases).toBeInstanceOf(Array);
        expect(data?.phases.length).toBeGreaterThan(0);

        // Every phase has required fields
        for (const phase of data?.phases ?? []) {
          expect(phase.phaseId).toBeTruthy();
          expect(phase.name).toBeTruthy();
          expect(phase.status).toBeTruthy();
        }
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'includes q4_2025 as a complete phase',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          {
            phases {
              phaseId
              status
            }
          }
        `,
        });

        if (result.body.kind !== 'single') return;
        const phases = result.body.singleResult.data?.phases ?? [];
        const q4 = phases.find((p: any) => p.phaseId === 'q4_2025');
        expect(q4).toBeDefined();
        expect(q4.status).toBe('complete');
      }
    );
  });

  // ==========================================================================
  // phase(phaseId) query
  // ==========================================================================

  describe('phase', () => {
    it.skipIf(!hasRoadmapFile)('returns a specific phase by ID', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          query GetPhase($phaseId: ID!) {
            phase(phaseId: $phaseId) {
              phaseId
              name
              status
            }
          }
        `,
        variables: { phaseId: 'q1_2026' },
      });

      if (result.body.kind !== 'single') return;
      const phase = result.body.singleResult.data?.phase;
      expect(phase).toBeDefined();
      expect(phase.phaseId).toBe('q1_2026');
      expect(phase.name).toBeTruthy();
    });

    it.skipIf(!hasRoadmapFile)(
      'returns null for nonexistent phase',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          query GetPhase($phaseId: ID!) {
            phase(phaseId: $phaseId) {
              phaseId
            }
          }
        `,
          variables: { phaseId: 'nonexistent_quarter' },
        });

        if (result.body.kind !== 'single') return;
        expect(result.body.singleResult.data?.phase).toBeNull();
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'resolves nested deliverables for a phase',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          query GetPhase($phaseId: ID!) {
            phase(phaseId: $phaseId) {
              phaseId
              deliverables {
                deliverableId
                title
                status
              }
            }
          }
        `,
          variables: { phaseId: 'q4_2025' },
        });

        if (result.body.kind !== 'single') return;
        const phase = result.body.singleResult.data?.phase;
        expect(phase).toBeDefined();
        expect(phase.deliverables).toBeInstanceOf(Array);
        expect(phase.deliverables.length).toBeGreaterThan(0);

        for (const d of phase.deliverables) {
          expect(d.deliverableId).toBeTruthy();
          expect(d.title).toBeTruthy();
          expect(d.status).toBeTruthy();
        }
      }
    );
  });

  // ==========================================================================
  // currentPhase query
  // ==========================================================================

  describe('currentPhase', () => {
    it.skipIf(!hasRoadmapFile)('returns the active phase', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            currentPhase {
              phaseId
              name
              status
            }
          }
        `,
      });

      if (result.body.kind !== 'single') return;
      const phase = result.body.singleResult.data?.currentPhase;
      // May be null if no active quarter, but we know q1_2026 is active
      expect(phase).toBeDefined();
      expect(phase.status).toBe('active');
    });

    it.skipIf(!hasRoadmapFile)(
      'returns deliverables for the current phase',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          {
            currentPhase {
              phaseId
              deliverables {
                deliverableId
                title
                description
                status
                assignedTo
              }
            }
          }
        `,
        });

        if (result.body.kind !== 'single') return;
        const phase = result.body.singleResult.data?.currentPhase;
        expect(phase).toBeDefined();
        expect(phase.deliverables).toBeInstanceOf(Array);
        expect(phase.deliverables.length).toBeGreaterThan(0);
      }
    );
  });

  // ==========================================================================
  // deliverable(deliverableId) query
  // ==========================================================================

  describe('deliverable', () => {
    it.skipIf(!hasRoadmapFile)(
      'returns a specific deliverable by ID',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          query GetDeliverable($deliverableId: ID!) {
            deliverable(deliverableId: $deliverableId) {
              deliverableId
              title
              description
              status
              assignedTo
            }
          }
        `,
          variables: { deliverableId: 'p5a-d1' },
        });

        if (result.body.kind !== 'single') return;
        const deliverable = result.body.singleResult.data?.deliverable;
        expect(deliverable).toBeDefined();
        expect(deliverable.deliverableId).toBe('p5a-d1');
        expect(deliverable.title).toContain('Speckle');
        expect(deliverable.status).toBe('complete');
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'returns null for nonexistent deliverable',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          query GetDeliverable($deliverableId: ID!) {
            deliverable(deliverableId: $deliverableId) {
              deliverableId
            }
          }
        `,
          variables: { deliverableId: 'nonexistent-deliverable-xyz' },
        });

        if (result.body.kind !== 'single') return;
        expect(result.body.singleResult.data?.deliverable).toBeNull();
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'resolves parent phase for a deliverable',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          query GetDeliverable($deliverableId: ID!) {
            deliverable(deliverableId: $deliverableId) {
              deliverableId
              phase {
                phaseId
                name
              }
            }
          }
        `,
          variables: { deliverableId: 'p5a-d1' },
        });

        if (result.body.kind !== 'single') return;
        const deliverable = result.body.singleResult.data?.deliverable;
        expect(deliverable).toBeDefined();
        expect(deliverable.phase).toBeDefined();
        expect(deliverable.phase.phaseId).toBe('q4_2025');
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'resolves empty dependencies array',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          query GetDeliverable($deliverableId: ID!) {
            deliverable(deliverableId: $deliverableId) {
              deliverableId
              dependencies {
                deliverableId
              }
            }
          }
        `,
          variables: { deliverableId: 'p5a-d1' },
        });

        if (result.body.kind !== 'single') return;
        const deliverable = result.body.singleResult.data?.deliverable;
        expect(deliverable.dependencies).toBeInstanceOf(Array);
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'resolves related decisions for a deliverable',
      async () => {
        const result = await apolloServer.executeOperation({
          query: `
          query GetDeliverable($deliverableId: ID!) {
            deliverable(deliverableId: $deliverableId) {
              deliverableId
              decisions {
                decisionId
                title
              }
            }
          }
        `,
          variables: { deliverableId: 'p5a-d1' },
        });

        if (result.body.kind !== 'single') return;
        const deliverable = result.body.singleResult.data?.deliverable;
        expect(deliverable.decisions).toBeInstanceOf(Array);
      }
    );
  });

  // ==========================================================================
  // DataSource direct tests
  // ==========================================================================

  describe('FileDataSource roadmap methods', () => {
    it.skipIf(!hasRoadmapFile)(
      'getPhases returns transformed quarters',
      async () => {
        const { createFileDataSource } =
          await import('../../services/file-data-source.service.js');
        const ds = createFileDataSource();
        const phases = await ds.getPhases();

        expect(phases.length).toBeGreaterThan(0);
        // Should have q4_2025, q1_2026, q2_2026, q3_2026 at minimum
        const ids = phases.map((p: any) => p.phaseId);
        expect(ids).toContain('q4_2025');
        expect(ids).toContain('q1_2026');
      }
    );

    it.skipIf(!hasRoadmapFile)('getPhases filters by status', async () => {
      const { createFileDataSource } =
        await import('../../services/file-data-source.service.js');
      const ds = createFileDataSource();
      const active = await ds.getPhases({ status: 'active' });

      expect(active.length).toBeGreaterThan(0);
      for (const p of active) {
        expect(p.status).toBe('active');
      }
    });

    it.skipIf(!hasRoadmapFile)(
      'getCurrentPhase returns the active quarter',
      async () => {
        const { createFileDataSource } =
          await import('../../services/file-data-source.service.js');
        const ds = createFileDataSource();
        const current = await ds.getCurrentPhase();

        expect(current).toBeDefined();
        expect(current?.status).toBe('active');
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'getDeliverables returns all deliverables',
      async () => {
        const { createFileDataSource } =
          await import('../../services/file-data-source.service.js');
        const ds = createFileDataSource();
        const deliverables = await ds.getDeliverables();

        expect(deliverables.length).toBeGreaterThan(0);
        for (const d of deliverables) {
          expect(d.deliverableId).toBeTruthy();
          expect(d.title).toBeTruthy();
          expect(d.phaseId).toBeTruthy();
        }
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'getDeliverables filters by phaseId',
      async () => {
        const { createFileDataSource } =
          await import('../../services/file-data-source.service.js');
        const ds = createFileDataSource();
        const deliverables = await ds.getDeliverables({ phaseId: 'q4_2025' });

        expect(deliverables.length).toBeGreaterThan(0);
        for (const d of deliverables) {
          expect(d.phaseId).toBe('q4_2025');
        }
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'getDeliverable returns a specific deliverable',
      async () => {
        const { createFileDataSource } =
          await import('../../services/file-data-source.service.js');
        const ds = createFileDataSource();
        const d = await ds.getDeliverable('p5a-d1');

        expect(d).toBeDefined();
        expect(d?.deliverableId).toBe('p5a-d1');
        expect(d?.phaseId).toBe('q4_2025');
      }
    );

    it.skipIf(!hasRoadmapFile)(
      'getDeliverable returns null for nonexistent ID',
      async () => {
        const { createFileDataSource } =
          await import('../../services/file-data-source.service.js');
        const ds = createFileDataSource();
        const d = await ds.getDeliverable('nonexistent-xyz');

        expect(d).toBeNull();
      }
    );
  });
});
