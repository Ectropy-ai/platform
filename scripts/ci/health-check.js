#!/usr/bin/env node
/**
 * Health Check Script for Embeddings Pipeline
 * Validates environment and dependencies for Node.js v20 compatibility
 */

const checks = [
  {
    name: 'Node Version',
    test: () => {
      const version = process.version;
      if (!version.startsWith('v20')) {
        throw new Error(`Expected Node.js v20.x, got ${version}`);
      }
      return version;
    },
  },
  {
    name: 'TypeScript',
    test: async () => {
      try {
        const ts = await import('typescript');
        return ts.version;
      } catch (e) {
        return 'not installed';
      }
    },
  },
  {
    name: 'Transformers',
    test: async () => {
      try {
        await import('@xenova/transformers');
        return 'available';
      } catch (e) {
        return 'not available';
      }
    },
  },
  {
    name: 'Sharp',
    test: async () => {
      try {
        await import('sharp');
        return 'available';
      } catch (e) {
        return 'not available';
      }
    },
  },
];

async function runHealthChecks() {
  console.log('=== Embeddings Pipeline Health Check ===');

  let criticalFailures = 0;

  for (const check of checks) {
    try {
      const result = await check.test();
      if (result === 'not available' || result === 'not installed') {
        console.log(`⚠️ ${check.name}: ${result}`);
      } else {
        console.log(`✅ ${check.name}: ${result}`);
      }
    } catch (e) {
      console.error(`❌ ${check.name}: ${e.message}`);
      if (check.name === 'Node Version') {
        criticalFailures++;
      }
    }
  }

  if (criticalFailures === 0) {
    console.log('\n✅ Core requirements met (Node.js v20)');
    console.log(
      '💡 Missing dependencies will be installed during build process'
    );
    process.exit(0);
  } else {
    console.log('\n❌ Critical health check failures');
    process.exit(1);
  }
}

runHealthChecks().catch((error) => {
  console.error('❌ Health check script failed:', error);
  process.exit(1);
});
