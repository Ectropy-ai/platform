#!/usr/bin/env npx tsx
/**
 * extract-routes.ts
 * Enterprise Route Extraction for MCP Server
 *
 * Scans all Express route files and generates updated mcp-routes.json
 * with accurate route definitions extracted from source code.
 *
 * ENTERPRISE PATTERN: Code-as-documentation - ensure MCP data stays in sync with actual code
 *
 * Usage: npx tsx scripts/mcp/extract-routes.ts
 * Output: apps/mcp-server/data/mcp-routes.json (updated)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROUTES_DIR = 'apps/mcp-server/src/routes';
const OUTPUT_FILE = 'apps/mcp-server/data/mcp-routes.json';
const INDEX_FILE = path.join(ROUTES_DIR, 'index.ts');

interface RouteInfo {
  path: string;
  method: string;
  description: string;
  access: string;
  rateLimit?: string;
  validation?: string[];
  sourceFile: string;
  sourceLine: number;
}

interface RouterMount {
  mountPath: string;
  routerName: string;
  sourceFile: string;
}

interface ExtractedRoutes {
  documentId: string;
  version: string;
  lastUpdated: string;
  metadata: {
    purpose: string;
    source: string;
    generatedBy: string;
    totalRoutes: number;
    baseUrl: string;
    nginxProxyPath: string;
    maintainer: string;
    extractionTimestamp: string;
  };
  routes: Record<string, {
    category: string;
    sourceFile: string;
    endpoints: Array<{
      path: string;
      method: string;
      nginxPath: string;
      auth: string;
      purpose: string;
      responseType: string;
      validated: boolean;
      rateLimit?: string;
      validation?: string[];
      sourceLine: number;
    }>;
  }>;
}

/**
 * Extract router mounts from index.ts
 */
function extractRouterMounts(indexContent: string): RouterMount[] {
  const mounts: RouterMount[] = [];

  // Match apiRouter.use('/path', routerName)
  const useRegex = /apiRouter\.use\(['"]([^'"]+)['"],\s*(\w+)/g;
  let match;

  while ((match = useRegex.exec(indexContent)) !== null) {
    mounts.push({
      mountPath: match[1],
      routerName: match[2],
      sourceFile: 'index.ts',
    });
  }

  return mounts;
}

/**
 * Extract routes from a single route file
 * Handles both single-line and multi-line route definitions
 */
function extractRoutesFromFile(filePath: string, basePath: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Track current JSDoc comment
  let currentJsDoc: {
    route?: string;
    description?: string;
    access?: string;
    rateLimit?: string;
    startLine: number;
  } | null = null;

  let inJsDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Start of JSDoc
    if (line.includes('/**')) {
      inJsDoc = true;
      currentJsDoc = { startLine: lineNum };
      continue;
    }

    // Inside JSDoc - extract tags
    if (inJsDoc) {
      const routeMatch = line.match(/@route\s+(GET|POST|PUT|DELETE|PATCH)\s+(.+)/);
      if (routeMatch) {
        currentJsDoc!.route = `${routeMatch[1]} ${routeMatch[2].trim()}`;
      }

      const descMatch = line.match(/@description\s+(.+)/);
      if (descMatch) {
        currentJsDoc!.description = descMatch[1].trim();
      }

      const accessMatch = line.match(/@access\s+(.+)/);
      if (accessMatch) {
        currentJsDoc!.access = accessMatch[1].trim();
      }

      const rateLimitMatch = line.match(/@rateLimit\s+(.+)/);
      if (rateLimitMatch) {
        currentJsDoc!.rateLimit = rateLimitMatch[1].trim();
      }

      // End of JSDoc
      if (line.includes('*/')) {
        inJsDoc = false;
      }
      continue;
    }

    // Match router method calls - single line: router.get('/path', ...)
    let routerMethodMatch = line.match(/router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i);

    // Multi-line pattern: router.post(\n  '/path',
    if (!routerMethodMatch) {
      const multiLineStart = line.match(/router\.(get|post|put|delete|patch)\(\s*$/i);
      if (multiLineStart && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const pathMatch = nextLine.match(/^\s*['"]([^'"]+)['"]/);
        if (pathMatch) {
          routerMethodMatch = [line, multiLineStart[1], pathMatch[1]] as RegExpMatchArray;
        }
      }
    }

    if (routerMethodMatch) {
      const method = routerMethodMatch[1].toUpperCase();
      const routePath = routerMethodMatch[2];
      const fullPath = basePath + routePath;

      routes.push({
        path: fullPath,
        method,
        description: currentJsDoc?.description || 'No description',
        access: currentJsDoc?.access || 'Unknown',
        rateLimit: currentJsDoc?.rateLimit,
        sourceFile: path.basename(filePath),
        sourceLine: lineNum,
      });

      // Reset current JSDoc after using it
      currentJsDoc = null;
    }
  }

  return routes;
}

/**
 * Map router name to source file
 */
function getRouterSourceFile(routerName: string): string {
  const mapping: Record<string, string> = {
    semanticSearchRouter: 'semantic-search.ts',
    documentAnalysisRouter: 'document-analysis.ts',
    codeGenerationRouter: 'code-generation.ts',
    toolsRouter: 'tools.ts',
    agentsRouter: 'agents.routes.ts',
    buildAnalysisRouter: 'build-analysis.routes.ts',
    patternDetectionRouter: 'pattern-detection.routes.ts',
    agentGuidanceRouter: 'agent-guidance.routes.ts',
    roadmapRouter: 'roadmap.routes.ts',
    graphRouter: 'graph.ts',
    votesRouter: 'votes.ts',
    deliverablesRouter: 'deliverables.routes.ts',
  };

  return mapping[routerName] || `${routerName}.ts`;
}

/**
 * Categorize routes based on path
 */
function categorizeRoute(path: string): string {
  if (path.includes('/agents') || path.includes('/analyze') || path.includes('/issues') || path.includes('/solutions')) {
    return 'AI Agents';
  }
  if (path.includes('/roadmap')) {
    return 'Business Planning';
  }
  if (path.includes('/deliverables')) {
    return 'Deliverables';
  }
  if (path.includes('/graph') || path.includes('/nodes')) {
    return 'Knowledge Graph';
  }
  if (path.includes('/votes')) {
    return 'Voting';
  }
  if (path.includes('/semantic') || path.includes('/search')) {
    return 'Search';
  }
  if (path.includes('/document') || path.includes('/analysis')) {
    return 'Document Analysis';
  }
  if (path.includes('/code') || path.includes('/generation')) {
    return 'Code Generation';
  }
  if (path.includes('/tools')) {
    return 'MCP Tools';
  }
  if (path.includes('/build') || path.includes('/pattern')) {
    return 'Build Analysis';
  }
  if (path.includes('/guidance')) {
    return 'Agent Guidance';
  }
  if (path.includes('/health') || path.includes('/status')) {
    return 'System';
  }
  return 'Other';
}

/**
 * Main extraction function
 */
async function extractRoutes(): Promise<void> {
  console.log('\n🔍 Extracting routes from MCP server...\n');

  // Read index.ts to get router mounts
  const indexContent = fs.readFileSync(INDEX_FILE, 'utf8');
  const mounts = extractRouterMounts(indexContent);

  console.log(`   Found ${mounts.length} router mounts in index.ts`);

  // Extract routes from each mounted router
  const allRoutes: RouteInfo[] = [];

  // Add the /status route from index.ts itself
  allRoutes.push({
    path: '/api/status',
    method: 'GET',
    description: 'MCP Server Operational status',
    access: 'Public',
    sourceFile: 'index.ts',
    sourceLine: 17,
  });

  for (const mount of mounts) {
    const sourceFile = getRouterSourceFile(mount.routerName);
    const filePath = path.join(ROUTES_DIR, sourceFile);

    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  File not found: ${sourceFile}`);
      continue;
    }

    // Determine the base path for this router
    let basePath = '/api' + mount.mountPath;
    if (mount.mountPath === '/mcp') {
      basePath = '/api/mcp';
    }

    const routes = extractRoutesFromFile(filePath, basePath);
    console.log(`   📄 ${sourceFile}: ${routes.length} routes`);

    allRoutes.push(...routes);
  }

  console.log(`\n   Total routes extracted: ${allRoutes.length}`);

  // Group routes by category
  const groupedRoutes: Record<string, RouteInfo[]> = {};

  for (const route of allRoutes) {
    const category = categorizeRoute(route.path);
    if (!groupedRoutes[category]) {
      groupedRoutes[category] = [];
    }
    groupedRoutes[category].push(route);
  }

  // Build output structure
  const output: ExtractedRoutes = {
    documentId: 'mcp-routes-catalog',
    version: '2.0.0',
    lastUpdated: new Date().toISOString(),
    metadata: {
      purpose: 'Complete inventory of all MCP Express HTTP API endpoints - AUTO-GENERATED',
      source: 'Extracted from apps/mcp-server/src/routes/**/*.ts',
      generatedBy: 'scripts/mcp/extract-routes.ts',
      totalRoutes: allRoutes.length,
      baseUrl: 'http://localhost:3002',
      nginxProxyPath: '/api/mcp/*',
      maintainer: 'ai-agents',
      extractionTimestamp: new Date().toISOString(),
    },
    routes: {},
  };

  // Convert grouped routes to output format
  for (const [category, routes] of Object.entries(groupedRoutes)) {
    const categoryKey = category.toLowerCase().replace(/\s+/g, '-');

    output.routes[categoryKey] = {
      category,
      sourceFile: routes[0]?.sourceFile || 'unknown',
      endpoints: routes.map(route => ({
        path: route.path,
        method: route.method,
        nginxPath: route.path.replace('/api/', '/api/mcp/').replace('/api/mcp/mcp/', '/api/mcp/'),
        auth: route.access.toLowerCase().includes('private') ? 'jwt' : 'none',
        purpose: route.description,
        responseType: 'application/json',
        validated: true, // Since we extracted from source
        rateLimit: route.rateLimit,
        validation: route.validation,
        sourceLine: route.sourceLine,
      })),
    };
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n✅ Routes extracted successfully!`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log(`   Total routes: ${allRoutes.length}`);
  console.log(`   Categories: ${Object.keys(groupedRoutes).length}`);

  // Print summary by category
  console.log('\n📊 Routes by category:');
  for (const [category, routes] of Object.entries(groupedRoutes)) {
    console.log(`   ${category}: ${routes.length} endpoints`);
  }
}

// Run if executed directly
extractRoutes().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
