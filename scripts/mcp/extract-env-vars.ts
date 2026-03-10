#!/usr/bin/env npx tsx
/**
 * extract-env-vars.ts
 * Enterprise Environment Variable Extraction for MCP Server
 *
 * Scans all TypeScript files and extracts environment variable usage,
 * generating a comprehensive inventory for MCP data synchronization.
 *
 * ENTERPRISE PATTERN: Document all env vars used across the codebase
 *
 * Usage: npx tsx scripts/mcp/extract-env-vars.ts
 * Output: apps/mcp-server/data/environment-variables.json
 */

import * as fs from 'fs';
import * as path from 'path';

const SCAN_DIRS = [
  'apps/mcp-server/src',
  'apps/api-gateway/src',
  'apps/web-dashboard/src',
  'libs/shared',
  'libs/auth',
];

const OUTPUT_FILE = 'apps/mcp-server/data/environment-variables.json';

interface EnvVarUsage {
  variable: string;
  defaultValue?: string;
  sourceFile: string;
  sourceLine: number;
  context: string;
}

interface EnvVarInfo {
  name: string;
  usageCount: number;
  defaultValues: string[];
  category: string;
  sources: Array<{
    file: string;
    line: number;
    context: string;
  }>;
  required: boolean;
  description?: string;
}

interface ExtractedEnvVars {
  documentId: string;
  version: string;
  lastUpdated: string;
  metadata: {
    purpose: string;
    source: string;
    generatedBy: string;
    totalVariables: number;
    totalUsages: number;
    extractionTimestamp: string;
  };
  categories: Record<string, EnvVarInfo[]>;
  summary: {
    byCategory: Record<string, number>;
    required: string[];
    optional: string[];
    withDefaults: string[];
  };
}

/**
 * Get all TypeScript files recursively
 */
function getTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, dist, and test directories
      if (!['node_modules', 'dist', '__tests__', 'tests'].includes(entry.name)) {
        files.push(...getTypeScriptFiles(fullPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      // Skip test files
      if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Extract environment variable usages from a file
 */
function extractEnvVarsFromFile(filePath: string): EnvVarUsage[] {
  const usages: EnvVarUsage[] = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Pattern 1: process.env.VAR_NAME
    const processEnvMatches = line.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
    for (const match of processEnvMatches) {
      const variable = match[1];

      // Try to extract default value: process.env.VAR || 'default'
      const defaultMatch = line.match(new RegExp(`process\\.env\\.${variable}\\s*\\|\\|\\s*['"]([^'"]+)['"]`));
      const defaultValue = defaultMatch ? defaultMatch[1] : undefined;

      // Also check for: process.env.VAR ?? 'default'
      const nullishMatch = line.match(new RegExp(`process\\.env\\.${variable}\\s*\\?\\?\\s*['"]([^'"]+)['"]`));
      const nullishDefault = nullishMatch ? nullishMatch[1] : undefined;

      usages.push({
        variable,
        defaultValue: defaultValue || nullishDefault,
        sourceFile: filePath,
        sourceLine: lineNum,
        context: line.trim().substring(0, 100),
      });
    }

    // Pattern 2: process.env['VAR_NAME']
    const bracketMatches = line.matchAll(/process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g);
    for (const match of bracketMatches) {
      usages.push({
        variable: match[1],
        sourceFile: filePath,
        sourceLine: lineNum,
        context: line.trim().substring(0, 100),
      });
    }

    // Pattern 3: import.meta.env.VITE_VAR_NAME (for Vite apps)
    const viteMatches = line.matchAll(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g);
    for (const match of viteMatches) {
      usages.push({
        variable: match[1],
        sourceFile: filePath,
        sourceLine: lineNum,
        context: line.trim().substring(0, 100),
      });
    }
  }

  return usages;
}

/**
 * Categorize environment variable based on name
 */
function categorizeEnvVar(name: string): string {
  // Database
  if (name.includes('DATABASE') || name.includes('DB_') || name.includes('POSTGRES') || name.includes('PG_')) {
    return 'Database';
  }
  // Redis/Cache
  if (name.includes('REDIS') || name.includes('CACHE')) {
    return 'Cache';
  }
  // Authentication
  if (name.includes('AUTH') || name.includes('JWT') || name.includes('SESSION') ||
      name.includes('OAUTH') || name.includes('GOOGLE_') || name.includes('GITHUB_')) {
    return 'Authentication';
  }
  // API Keys
  if (name.includes('API_KEY') || name.includes('SECRET') || name.includes('TOKEN')) {
    return 'Secrets';
  }
  // Server
  if (name.includes('PORT') || name.includes('HOST') || name.includes('URL') || name.includes('SERVER')) {
    return 'Server';
  }
  // Node/Environment
  if (name === 'NODE_ENV' || name.includes('ENV') || name.includes('MODE')) {
    return 'Environment';
  }
  // MCP
  if (name.includes('MCP')) {
    return 'MCP';
  }
  // Speckle
  if (name.includes('SPECKLE')) {
    return 'Speckle';
  }
  // React/Frontend
  if (name.startsWith('REACT_APP_') || name.startsWith('VITE_')) {
    return 'Frontend';
  }
  // Logging
  if (name.includes('LOG')) {
    return 'Logging';
  }
  // Feature flags
  if (name.includes('ENABLE') || name.includes('DISABLE') || name.includes('FEATURE')) {
    return 'Feature Flags';
  }

  return 'Other';
}

/**
 * Generate description based on variable name
 */
function generateDescription(name: string): string {
  const descriptions: Record<string, string> = {
    NODE_ENV: 'Node.js environment (development, production, test)',
    PORT: 'Server port number',
    DATABASE_URL: 'PostgreSQL connection URL',
    REDIS_HOST: 'Redis server hostname',
    REDIS_PORT: 'Redis server port',
    JWT_SECRET: 'Secret key for JWT token signing',
    MCP_API_KEY: 'API key for MCP server authentication',
    MCP_PORT: 'MCP server port',
    VALIDATION_ONLY: 'Run in validation-only mode (no database)',
  };

  return descriptions[name] || '';
}

/**
 * Main extraction function
 */
async function extractEnvVars(): Promise<void> {
  console.log('\n🔍 Extracting environment variables from codebase...\n');

  const allUsages: EnvVarUsage[] = [];

  // Scan each directory
  for (const dir of SCAN_DIRS) {
    const files = getTypeScriptFiles(dir);
    console.log(`   📁 ${dir}: ${files.length} TypeScript files`);

    for (const file of files) {
      const usages = extractEnvVarsFromFile(file);
      allUsages.push(...usages);
    }
  }

  console.log(`\n   Total usages found: ${allUsages.length}`);

  // Aggregate by variable name
  const envVarMap = new Map<string, EnvVarInfo>();

  for (const usage of allUsages) {
    const existing = envVarMap.get(usage.variable);

    if (existing) {
      existing.usageCount++;
      if (usage.defaultValue && !existing.defaultValues.includes(usage.defaultValue)) {
        existing.defaultValues.push(usage.defaultValue);
      }
      existing.sources.push({
        file: path.relative('.', usage.sourceFile).replace(/\\/g, '/'),
        line: usage.sourceLine,
        context: usage.context,
      });
    } else {
      envVarMap.set(usage.variable, {
        name: usage.variable,
        usageCount: 1,
        defaultValues: usage.defaultValue ? [usage.defaultValue] : [],
        category: categorizeEnvVar(usage.variable),
        sources: [{
          file: path.relative('.', usage.sourceFile).replace(/\\/g, '/'),
          line: usage.sourceLine,
          context: usage.context,
        }],
        required: !usage.defaultValue,
        description: generateDescription(usage.variable),
      });
    }
  }

  // Group by category
  const categorized: Record<string, EnvVarInfo[]> = {};

  for (const envVar of envVarMap.values()) {
    if (!categorized[envVar.category]) {
      categorized[envVar.category] = [];
    }
    categorized[envVar.category].push(envVar);
  }

  // Sort each category by usage count
  for (const category of Object.keys(categorized)) {
    categorized[category].sort((a, b) => b.usageCount - a.usageCount);
  }

  // Build summary
  const allVars = Array.from(envVarMap.values());
  const summary = {
    byCategory: Object.fromEntries(
      Object.entries(categorized).map(([cat, vars]) => [cat, vars.length])
    ),
    required: allVars.filter(v => v.required).map(v => v.name).sort(),
    optional: allVars.filter(v => !v.required).map(v => v.name).sort(),
    withDefaults: allVars.filter(v => v.defaultValues.length > 0).map(v => v.name).sort(),
  };

  // Build output
  const output: ExtractedEnvVars = {
    documentId: 'environment-variables-catalog',
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    metadata: {
      purpose: 'Complete inventory of environment variables used across the codebase - AUTO-GENERATED',
      source: 'Extracted from apps/*/src/**/*.ts and libs/**/*.ts',
      generatedBy: 'scripts/mcp/extract-env-vars.ts',
      totalVariables: envVarMap.size,
      totalUsages: allUsages.length,
      extractionTimestamp: new Date().toISOString(),
    },
    categories: categorized,
    summary,
  };

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n✅ Environment variables extracted successfully!`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log(`   Total unique variables: ${envVarMap.size}`);
  console.log(`   Total usages: ${allUsages.length}`);

  // Print summary by category
  console.log('\n📊 Variables by category:');
  for (const [category, vars] of Object.entries(categorized).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${category}: ${vars.length} variables`);
  }

  // Print required variables
  console.log('\n⚠️  Variables without defaults (potentially required):');
  const required = allVars.filter(v => v.required).slice(0, 10);
  for (const v of required) {
    console.log(`   - ${v.name} (${v.usageCount} usages)`);
  }
  if (summary.required.length > 10) {
    console.log(`   ... and ${summary.required.length - 10} more`);
  }
}

// Run if executed directly
extractEnvVars().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
