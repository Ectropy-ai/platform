#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const apiPkg = JSON.parse(fs.readFileSync('apps/api-gateway/package.json', 'utf8'));

const distPkg = {
  name: 'api-gateway',
  version: rootPkg.version,
  main: './main.js',
  dependencies: {
    ...apiPkg.dependencies,
    'prom-client': rootPkg.dependencies['prom-client'],
    'connect-redis': rootPkg.dependencies['connect-redis'],
    'graphql': rootPkg.dependencies['graphql'] || apiPkg.dependencies['graphql'],
    'graphql-tag': rootPkg.dependencies['graphql-tag'] || apiPkg.dependencies['graphql-tag'],
    express: rootPkg.dependencies['express'] || apiPkg.dependencies['express'],
    'express-validator': rootPkg.dependencies['express-validator'] || apiPkg.dependencies['express-validator'],
    compression: rootPkg.dependencies['compression'] || apiPkg.dependencies['compression'],
    cors: rootPkg.dependencies['cors'] || apiPkg.dependencies['cors'],
    helmet: rootPkg.dependencies['helmet'] || apiPkg.dependencies['helmet'],
    ioredis: rootPkg.dependencies['ioredis'] || apiPkg.dependencies['ioredis'],
    pg: rootPkg.dependencies['pg'] || apiPkg.dependencies['pg'],
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

const distPath = path.join('dist/apps/api-gateway');
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

fs.writeFileSync(
  path.join(distPath, 'package.json'),
  JSON.stringify(distPkg, null, 2)
);

console.log('✅ Created deployment package.json');
