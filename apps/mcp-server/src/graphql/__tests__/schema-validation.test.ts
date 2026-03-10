/**
 * GraphQL Schema Validation Tests
 *
 * Enterprise tests to ensure GraphQL schema stays in sync with JSON data.
 * Prevents schema/data mismatches that cause runtime errors.
 *
 * @group integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { DATA_FILES } from '../../config/data-paths.config.js';
import { createApolloServer } from '../index.js';
import type { ApolloServer } from '@apollo/server';

describe('GraphQL Schema Validation', () => {
  let apolloServer: ApolloServer;
  let decisionLog: any;
  let infrastructureCatalog: any;
  let currentTruth: any;

  beforeAll(async () => {
    // Load JSON data files from canonical .roadmap/ paths
    decisionLog = JSON.parse(readFileSync(DATA_FILES.decisionLog, 'utf-8'));
    const rawInfra = JSON.parse(
      readFileSync(DATA_FILES.infrastructureCatalog, 'utf-8')
    );
    // infrastructure-catalog.json uses nested V2 structure: catalog.services, catalog.environments[].servers
    const catalog = rawInfra.catalog || rawInfra;
    const servers: any[] = [];
    if (catalog.environments) {
      for (const env of catalog.environments) {
        if (env.servers) servers.push(...env.servers);
      }
    }
    infrastructureCatalog = {
      services: catalog.services || [],
      servers,
      ports: catalog.ports || {},
    };
    currentTruth = JSON.parse(readFileSync(DATA_FILES.currentTruth, 'utf-8'));

    // Start Apollo Server
    apolloServer = createApolloServer();
    await apolloServer.start();
  });

  describe('Decision Category Enum', () => {
    it('should include all categories from decision-log.json', async () => {
      // Get all unique categories from data
      const categoriesInData = new Set(
        decisionLog.decisions.map((d: any) => d.category)
      );

      // Query GraphQL schema for enum values
      const result = await apolloServer.executeOperation({
        query: `
          {
            __type(name: "DecisionCategory") {
              enumValues {
                name
              }
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      const enumValues = result.body.singleResult.data?.__type.enumValues.map(
        (v: any) => v.name
      );

      // Verify all data categories are in schema
      // Data uses hyphens (api-design) but GraphQL enums require underscores (api_design)
      // The Decision.category resolver normalizes at query time; mirror that here
      categoriesInData.forEach((category: any) => {
        const normalized = category.replace(/-/g, '_');
        expect(enumValues).toContain(normalized);
      });
    });

    it('should accept all categories in actual queries', async () => {
      // Test query with all categories from data
      const result = await apolloServer.executeOperation({
        query: `
          {
            decisions {
              decisionId
              category
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.errors).toBeUndefined();
      expect(result.body.singleResult.data?.decisions).toBeDefined();
      expect(result.body.singleResult.data?.decisions.length).toBeGreaterThan(
        0
      );
    });
  });

  describe('Service Schema', () => {
    it('should handle nullable status fields', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            services {
              serviceId
              name
              status
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.errors).toBeUndefined();
      expect(result.body.singleResult.data?.services).toBeDefined();
      expect(result.body.singleResult.data?.services.length).toBe(
        infrastructureCatalog.services.length
      );
    });
  });

  describe('Server Schema', () => {
    it('should use "name" field instead of "hostname"', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            servers {
              serverId
              name
              ipAddress
              environment
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.errors).toBeUndefined();
      expect(result.body.singleResult.data?.servers).toBeDefined();
      expect(result.body.singleResult.data?.servers.length).toBe(
        infrastructureCatalog.servers.length
      );

      // Verify name field exists and matches data
      const servers = result.body.singleResult.data?.servers;
      servers.forEach((server: any, index: number) => {
        expect(server.name).toBe(infrastructureCatalog.servers[index].name);
      });
    });

    it('should handle nullable ipAddress fields', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            servers {
              serverId
              ipAddress
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.errors).toBeUndefined();
    });
  });

  describe('Node Schema', () => {
    it('should handle nullable author fields', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            nodes {
              nodeId
              title
              metadata {
                author
                tags
              }
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.errors).toBeUndefined();
      expect(result.body.singleResult.data?.nodes).toBeDefined();
      expect(result.body.singleResult.data?.nodes.length).toBe(
        currentTruth.nodes.length
      );

      // Verify some nodes have null authors (based on analysis)
      const nodes = result.body.singleResult.data?.nodes;
      const nodesWithNullAuthor = nodes.filter(
        (n: any) => n.metadata.author === null
      );
      expect(nodesWithNullAuthor.length).toBeGreaterThan(0);
    });
  });

  describe('GraphQL Enum Syntax', () => {
    it('should not use hyphens in enum values', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            __type(name: "DecisionCategory") {
              enumValues {
                name
              }
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      const enumValues = result.body.singleResult.data?.__type.enumValues.map(
        (v: any) => v.name
      );

      // Verify no enum values contain hyphens
      enumValues.forEach((value: string) => {
        expect(value).not.toMatch(/-/);
        expect(value).toMatch(/^[_A-Za-z][_0-9A-Za-z]*$/);
      });
    });
  });

  describe('Data Consistency', () => {
    it('should return consistent decision counts', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            decisions {
              decisionId
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.data?.decisions.length).toBe(
        decisionLog.decisions.length
      );
    });

    it('should return consistent service counts', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            services {
              serviceId
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.data?.services.length).toBe(
        infrastructureCatalog.services.length
      );
    });

    it('should return consistent node counts', async () => {
      const result = await apolloServer.executeOperation({
        query: `
          {
            nodes {
              nodeId
            }
          }
        `,
      });

      if (result.body.kind !== 'single') {
        throw new Error('Unexpected GraphQL response format');
      }

      expect(result.body.singleResult.data?.nodes.length).toBe(
        currentTruth.nodes.length
      );
    });
  });
});
