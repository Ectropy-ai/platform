#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const mcpPkg = JSON.parse(fs.readFileSync('apps/mcp-server/package.json', 'utf8'));

const distPkg = {
  name: 'mcp-server',
  version: rootPkg.version,
  main: './main.js',
  dependencies: {
    // Start with all dependencies from MCP package.json (single source of truth)
    ...mcpPkg.dependencies,
    // Override with root versions for monorepo consistency where available
    // This ensures all services use the same versions of shared dependencies
    openai: rootPkg.dependencies['openai'] || mcpPkg.dependencies['openai'],
    '@modelcontextprotocol/sdk': rootPkg.dependencies['@modelcontextprotocol/sdk'] || mcpPkg.dependencies['@modelcontextprotocol/sdk'],
    dotenv: rootPkg.dependencies['dotenv'] || mcpPkg.dependencies['dotenv'],
    express: rootPkg.dependencies['express'] || mcpPkg.dependencies['express'],
    'express-rate-limit': rootPkg.dependencies['express-rate-limit'] || mcpPkg.dependencies['express-rate-limit'],
    'express-validator': rootPkg.dependencies['express-validator'] || mcpPkg.dependencies['express-validator'],
    ioredis: rootPkg.dependencies['ioredis'] || mcpPkg.dependencies['ioredis'],
    'prom-client': rootPkg.dependencies['prom-client'] || mcpPkg.dependencies['prom-client'],
    pg: rootPkg.dependencies['pg'] || mcpPkg.dependencies['pg'],
    helmet: rootPkg.dependencies['helmet'] || mcpPkg.dependencies['helmet'],
    cors: rootPkg.dependencies['cors'] || mcpPkg.dependencies['cors'],
    compression: rootPkg.dependencies['compression'] || mcpPkg.dependencies['compression'],
    'node-fetch': rootPkg.dependencies['node-fetch'] || mcpPkg.dependencies['node-fetch'],
    'pdf-parse': rootPkg.dependencies['pdf-parse'] || mcpPkg.dependencies['pdf-parse'],
    'dxf-parser': rootPkg.dependencies['dxf-parser'] || mcpPkg.dependencies['dxf-parser'],
    '@qdrant/js-client-rest': rootPkg.dependencies['@qdrant/js-client-rest'] || mcpPkg.dependencies['@qdrant/js-client-rest'],
    '@tensorflow/tfjs': rootPkg.dependencies['@tensorflow/tfjs'] || mcpPkg.dependencies['@tensorflow/tfjs'],
    'tiktoken': rootPkg.dependencies['tiktoken'] || mcpPkg.dependencies['tiktoken'],
    'glob': rootPkg.dependencies['glob'] || mcpPkg.dependencies['glob'],
    winston: rootPkg.dependencies['winston'] || mcpPkg.dependencies['winston'],
  },
  // CRITICAL: Include Prisma as dependencies (not devDependencies)
  // Production containers need both CLI and client for runtime generation
  devDependencies: {
    '@prisma/client': rootPkg.devDependencies['@prisma/client'],
    'prisma': rootPkg.devDependencies['prisma'],
  },
};

Object.keys(distPkg.dependencies).forEach((key) => {
  if (!distPkg.dependencies[key]) {
    delete distPkg.dependencies[key];
  }
});

const distPath = path.join('dist/apps/mcp-server');
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

fs.writeFileSync(
  path.join(distPath, 'package.json'),
  JSON.stringify(distPkg, null, 2)
);

console.log('✅ Created deployment package.json');
