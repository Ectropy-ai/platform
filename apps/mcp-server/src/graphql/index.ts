/**
 * Apollo Server Setup for Ectropy GraphQL Layer
 *
 * Provides graph query interface for JSON-first documentation with:
 * - Decision log traversal
 * - Infrastructure dependency mapping
 * - Current truth node relationships
 * - Decision Lifecycle (DL-M4) full CRUD operations
 *
 * Enables 97% token reduction by allowing precise, structured queries.
 */

import { ApolloServer } from '@apollo/server';
import type { Express, Request, Response } from 'express';
import { typeDefs } from './schema.js';
import { resolvers, setSharedDataSource } from './resolvers.js';
import type { GraphQLContext } from './resolvers.js'; // eslint-disable-line no-duplicate-imports
import type { DataSource } from '../services/data-source.interface.js';
import { roadmapMutationTypeDefs } from './roadmap-mutations.schema.js';
import { roadmapMutationResolvers } from './roadmap-mutations.resolvers.js';

// Decision Lifecycle GraphQL exports (DL-M4)
export { decisionLifecycleTypeDefs } from './decision-lifecycle.schema.js';
export { decisionLifecycleResolvers } from './decision-lifecycle.resolvers.js';

// Individual Decision Lifecycle schema exports
export { decisionTypeDefs } from './decision/decision.schema.js';
export { voxelTypeDefs } from './voxel/voxel.schema.js';
export { inspectionTypeDefs } from './inspection/inspection.schema.js';
export { consequenceTypeDefs } from './consequence/consequence.schema.js';
export { scheduleTypeDefs } from './schedule/schedule.schema.js';
export { authorityTypeDefs } from './authority/authority.schema.js';

// Individual Decision Lifecycle resolver exports
export { decisionResolvers } from './decision/decision.resolvers.js';
export { voxelResolvers } from './voxel/voxel.resolvers.js';

/**
 * Create and configure Apollo Server instance
 */
export function createApolloServer() {
  // Merge mutation resolvers into main resolvers
  const mergedResolvers = {
    ...resolvers,
    Mutation: {
      ...(roadmapMutationResolvers.Mutation || {}),
    },
  };

  return new ApolloServer({
    typeDefs: [typeDefs, roadmapMutationTypeDefs],
    resolvers: mergedResolvers,
    introspection: true,
    // Custom formatting for better error messages
    formatError: (formattedError, error) => {
      // Log full error server-side for debugging
      console.error('GraphQL Error:', error);

      // Return simplified error to client
      return {
        message: formattedError.message,
        locations: formattedError.locations,
        path: formattedError.path,
        extensions: {
          code: formattedError.extensions?.code || 'INTERNAL_SERVER_ERROR',
        },
      };
    },
  });
}

/**
 * Integrate Apollo Server into Express app using manual endpoint
 *
 * @param app - Express application instance
 * @param path - GraphQL endpoint path (default: /graphql)
 * @param dataSource - Optional DataSource to inject into resolver context
 */
export async function setupGraphQL(app: Express, path = '/graphql', dataSource?: DataSource) {
  const server = createApolloServer();

  // If a DataSource is provided, set it as the shared source for resolvers
  if (dataSource) {
    setSharedDataSource(dataSource);
  }

  // Start Apollo Server
  await server.start();

  // Build context for resolvers
  const contextValue: GraphQLContext = dataSource ? { dataSource } : {};

  // Create manual Express endpoint for GraphQL
  app.post(path, async (req: Request, res: Response) => {
    try {
      const { query, variables, operationName } = req.body;

      const result = await server.executeOperation(
        {
          query,
          variables,
          operationName,
        },
        { contextValue }
      );

      // Handle errors in result
      if (result.body.kind === 'single') {
        res.json(result.body.singleResult);
      } else {
        res.status(400).json({ error: 'Incremental delivery not supported' });
      }
    } catch (error) {
      console.error('GraphQL execution error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET endpoint for GraphQL Playground (introspection)
  app.get(path, (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GraphQL Playground</title>
          <style>
            body {
              margin: 0;
              font-family: Arial, sans-serif;
              background: #1a1a1a;
              color: #fff;
              padding: 40px;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
            }
            h1 {
              color: #e535ab;
            }
            code {
              background: #2a2a2a;
              padding: 2px 6px;
              border-radius: 3px;
            }
            pre {
              background: #2a2a2a;
              padding: 20px;
              border-radius: 5px;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Ectropy GraphQL API</h1>
            <p>GraphQL endpoint for JSON-first documentation queries</p>

            <h2>Example Query:</h2>
            <pre>
curl -X POST ${path} \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "{ decisions { decisionId title status } }"
  }'
            </pre>

            <h2>Available Queries:</h2>
            <ul>
              <li><code>decisions</code> - Get all decisions</li>
              <li><code>decision(decisionId: ID!)</code> - Get specific decision</li>
              <li><code>services</code> - Get all services</li>
              <li><code>nodes</code> - Get all current truth nodes</li>
            </ul>

            <p>See <code>/apps/mcp-server/src/graphql/README.md</code> for full documentation</p>
          </div>
        </body>
      </html>
    `);
  });

  console.log(`🚀 GraphQL endpoint ready at ${path}`);
  console.log(`📊 GraphQL Playground: http://localhost:3001${path}`);

  return server;
}
