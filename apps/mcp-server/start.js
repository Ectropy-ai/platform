/**
 * MCP Server Starter Script (ESM)
 * Fixes module system conflicts between ESM and CommonJS
 */

import { register } from 'ts-node';

register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'ES2020',
    moduleResolution: 'node',
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
  },
});

await import('./src/server.ts');
