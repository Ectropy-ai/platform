#!/usr/bin/env tsx
/**
 * Test Runbook GraphQL Queries End-to-End
 *
 * Verifies that all runbook GraphQL queries work correctly
 */

import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../../apps/mcp-server/src/graphql/schema.js';
import { resolvers } from '../../apps/mcp-server/src/graphql/resolvers.js';

// Create test Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

console.log('🧪 Testing Runbook GraphQL Queries\n');

// Test queries
const testQueries = [
  {
    name: 'Get all runbooks',
    query: `
      query {
        runbooks {
          catalogId
          metadata {
            name
            version
          }
        }
      }
    `,
  },
  {
    name: 'Get runbooks by type (deployment)',
    query: `
      query {
        runbooksByType(type: deployment) {
          catalogId
          metadata {
            name
          }
        }
      }
    `,
  },
  {
    name: 'Get runbooks by environment (production)',
    query: `
      query {
        runbooksByEnvironment(environment: production) {
          catalogId
          metadata {
            name
          }
        }
      }
    `,
  },
  {
    name: 'Get specific runbook',
    query: `
      query {
        runbook(catalogId: "deployment-runbook-v2-1-1") {
          catalogId
          metadata {
            name
            purpose
          }
          executiveSummary {
            description
          }
        }
      }
    `,
  },
  {
    name: 'Get deployment phases',
    query: `
      query {
        deploymentPhases(runbookId: "deployment-runbook-v2-1-1") {
          phase
          name
          estimatedDuration
        }
      }
    `,
  },
  {
    name: 'Get pre-flight checks',
    query: `
      query {
        preFlightChecks(runbookId: "deployment-runbook-v2-1-1") {
          id
          name
          severity
        }
      }
    `,
  },
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const test of testQueries) {
    try {
      console.log(`\n📋 ${test.name}`);
      console.log('─'.repeat(60));

      const response = await server.executeOperation({
        query: test.query,
      });

      if (response.body.kind === 'single') {
        if (response.body.singleResult.errors) {
          console.log('❌ FAILED');
          console.log('Errors:', JSON.stringify(response.body.singleResult.errors, null, 2));
          failed++;
        } else {
          console.log('✅ PASSED');
          const data = response.body.singleResult.data;
          if (data) {
            const keys = Object.keys(data);
            const firstKey = keys[0];
            const result = data[firstKey];
            if (Array.isArray(result)) {
              console.log(`   Returned ${result.length} result(s)`);
              if (result.length > 0) {
                console.log(`   First result:`, JSON.stringify(result[0], null, 2).split('\n').slice(0, 10).join('\n'));
              }
            } else if (result) {
              console.log(`   Result:`, JSON.stringify(result, null, 2).split('\n').slice(0, 10).join('\n'));
            }
          }
          passed++;
        }
      }
    } catch (error) {
      console.log('❌ FAILED');
      console.log('Error:', error);
      failed++;
    }
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('📊 Test Results');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}/${testQueries.length}`);
  console.log(`❌ Failed: ${failed}/${testQueries.length}`);
  console.log(`📈 Success Rate: ${Math.round((passed / testQueries.length) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
