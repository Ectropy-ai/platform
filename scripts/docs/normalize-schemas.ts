#!/usr/bin/env tsx
/**
 * Schema Normalization Script
 * Applies unified schema patterns from schema-standard.json to all JSON files
 * Part of enterprise JSON-first documentation pattern
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface NormalizationResult {
  file: string;
  changes: string[];
  warnings: string[];
}

/**
 * Normalize environment enum values
 */
function normalizeEnvironment(value: string): string {
  const normalized: Record<string, string> = {
    'dev': 'development',
    'prod': 'production',
    'stg': 'staging',
    'stage': 'staging',
    'test': 'test',
    'development': 'development',
    'staging': 'staging',
    'production': 'production'
  };

  const lower = value.toLowerCase();
  return normalized[lower] || value;
}

/**
 * Normalize priority enum values
 */
function normalizePriority(value: string): string {
  const normalized: Record<string, string> = {
    'P0': 'critical',
    'P1': 'high',
    'P2': 'medium',
    'P3': 'low',
    'p0': 'critical',
    'p1': 'high',
    'p2': 'medium',
    'p3': 'low',
    'critical': 'critical',
    'high': 'high',
    'medium': 'medium',
    'low': 'low'
  };

  return normalized[value] || value;
}

/**
 * Normalize status based on context
 */
function normalizeStatus(value: string, context: 'deliverable' | 'deployment' | 'workflow' | 'phase' | 'general'): string {
  const contextMaps = {
    deliverable: {
      'pending': 'pending',
      'in-progress': 'in_progress',
      'in_progress': 'in_progress',
      'complete': 'completed',
      'completed': 'completed',
      'blocked': 'blocked',
      'not-started': 'pending'
    },
    deployment: {
      'planned': 'planned',
      'in-progress': 'in-progress',
      'deployed': 'deployed',
      'verified': 'verified',
      'failed': 'failed',
      'rolled-back': 'rolled-back'
    },
    workflow: {
      'queued': 'queued',
      'running': 'running',
      'success': 'success',
      'failure': 'failure',
      'cancelled': 'cancelled'
    },
    phase: {
      'not-started': 'not-started',
      'active': 'active',
      'completed': 'completed',
      'on-hold': 'on-hold'
    },
    general: {
      'draft': 'draft',
      'in-review': 'in-review',
      'approved': 'approved',
      'active': 'active',
      'production-ready': 'production-ready',
      'deprecated': 'deprecated',
      'archived': 'archived'
    }
  };

  const map = contextMaps[context];
  const lower = value.toLowerCase().replace(/_/g, '-');

  return map[lower] || map[value] || value;
}

/**
 * Determine status context from field path
 */
function getStatusContext(path: string): 'deliverable' | 'deployment' | 'workflow' | 'phase' | 'general' {
  if (path.includes('deliverable')) return 'deliverable';
  if (path.includes('deployment')) return 'deployment';
  if (path.includes('workflow')) return 'workflow';
  if (path.includes('phase')) return 'phase';
  return 'general';
}

/**
 * Add relatedDocuments section if missing
 */
function addRelatedDocuments(data: any, fileName: string): string[] {
  const changes: string[] = [];

  if (!data.relatedDocuments && shouldHaveRelatedDocuments(fileName)) {
    data.relatedDocuments = generateRelatedDocuments(fileName);
    changes.push('Added relatedDocuments section');
  }

  return changes;
}

/**
 * Check if document should have relatedDocuments
 */
function shouldHaveRelatedDocuments(fileName: string): boolean {
  const shouldHave = [
    'api-specification.json',
    'architecture-specification.json',
    'infrastructure-catalog.json',
    'routing-architecture.json',
    'deployment-runbook'
  ];

  return shouldHave.some(pattern => fileName.includes(pattern));
}

/**
 * Generate appropriate relatedDocuments based on file type
 */
function generateRelatedDocuments(fileName: string): Record<string, string> {
  const base = {
    roadmap: 'apps/mcp-server/data/roadmap-platform.json',
    decisionLog: 'apps/mcp-server/data/decision-log.json',
    infrastructureCatalog: 'apps/mcp-server/data/infrastructure-catalog.json'
  };

  if (fileName.includes('api-specification')) {
    return {
      ...base,
      architecture: 'apps/mcp-server/data/architecture-specification.json',
      routing: 'apps/mcp-server/data/routing-architecture.json'
    };
  }

  if (fileName.includes('architecture')) {
    return {
      ...base,
      apiSpecification: 'apps/mcp-server/data/api-specification.json',
      routing: 'apps/mcp-server/data/routing-architecture.json'
    };
  }

  if (fileName.includes('infrastructure') || fileName.includes('routing')) {
    return {
      ...base,
      apiSpecification: 'apps/mcp-server/data/api-specification.json',
      architecture: 'apps/mcp-server/data/architecture-specification.json'
    };
  }

  if (fileName.includes('deployment')) {
    return {
      ...base,
      apiSpecification: 'apps/mcp-server/data/api-specification.json',
      architecture: 'apps/mcp-server/data/architecture-specification.json',
      routing: 'apps/mcp-server/data/routing-architecture.json'
    };
  }

  return base;
}

/**
 * Normalize a JSON object recursively
 */
function normalizeObject(obj: any, path: string = '', changes: string[]): any {
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => normalizeObject(item, `${path}[${idx}]`, changes));
  }

  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const normalized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = path ? `${path}.${key}` : key;

    // Normalize enum values
    if (key === 'environment' && typeof value === 'string') {
      const standard = ['development', 'staging', 'production', 'test'];
      if (!standard.includes(value)) {
        const newValue = normalizeEnvironment(value);
        if (newValue !== value) {
          changes.push(`${fieldPath}: "${value}" → "${newValue}"`);
          normalized[key] = newValue;
          continue;
        }
      }
    }

    if (key === 'priority' && typeof value === 'string') {
      const standard = ['critical', 'high', 'medium', 'low'];
      if (!standard.includes(value)) {
        const newValue = normalizePriority(value);
        if (newValue !== value) {
          changes.push(`${fieldPath}: "${value}" → "${newValue}"`);
          normalized[key] = newValue;
          continue;
        }
      }
    }

    if (key === 'status' && typeof value === 'string') {
      const context = getStatusContext(fieldPath);
      const newValue = normalizeStatus(value, context);
      if (newValue !== value) {
        changes.push(`${fieldPath}: "${value}" → "${newValue}" (${context} context)`);
        normalized[key] = newValue;
        continue;
      }
    }

    // Recursively normalize nested objects
    normalized[key] = normalizeObject(value, fieldPath, changes);
  }

  return normalized;
}

/**
 * Normalize a single JSON file
 */
async function normalizeFile(filePath: string): Promise<NormalizationResult> {
  const fileName = path.basename(filePath);
  const result: NormalizationResult = {
    file: fileName,
    changes: [],
    warnings: []
  };

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Normalize enums throughout the document
    const normalized = normalizeObject(data, '', result.changes);

    // Add relatedDocuments if appropriate
    const relatedChanges = addRelatedDocuments(normalized, fileName);
    result.changes.push(...relatedChanges);

    // Write back if changes were made
    if (result.changes.length > 0) {
      await fs.writeFile(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf-8');
    }

  } catch (error) {
    result.warnings.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

/**
 * Main normalization function
 */
async function normalizeAllSchemas(): Promise<void> {
  const dataDir = path.resolve(__dirname, '../../apps/mcp-server/data');

  console.log('🔧 Normalizing JSON schemas...');
  console.log(`📁 Directory: ${dataDir}\n`);

  try {
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'schema-standard.json');

    if (jsonFiles.length === 0) {
      console.log('⚠️  No JSON files found');
      return;
    }

    console.log(`Found ${jsonFiles.length} JSON file(s)\n`);

    const results: NormalizationResult[] = [];
    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      const result = await normalizeFile(filePath);
      results.push(result);

      if (result.changes.length > 0) {
        console.log(`✏️  ${result.file}`);
        result.changes.forEach(change => {
          console.log(`   ✅ ${change}`);
        });
        console.log('');
      } else if (result.warnings.length > 0) {
        console.log(`⚠️  ${result.file}`);
        result.warnings.forEach(warning => {
          console.log(`   ⚠️  ${warning}`);
        });
        console.log('');
      } else {
        console.log(`✅ ${result.file} (no changes needed)`);
      }
    }

    // Summary
    const changedFiles = results.filter(r => r.changes.length > 0).length;
    const totalChanges = results.reduce((sum, r) => sum + r.changes.length, 0);
    const filesWithWarnings = results.filter(r => r.warnings.length > 0).length;

    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Normalization Summary:`);
    console.log(`   Total files: ${results.length}`);
    console.log(`   Files modified: ${changedFiles}`);
    console.log(`   Total changes: ${totalChanges}`);
    console.log(`   Files with warnings: ${filesWithWarnings}`);

    if (totalChanges > 0) {
      console.log('\n✅ Schema normalization complete!');
      console.log('\n📝 Next steps:');
      console.log('   1. Run: pnpm docs:validate');
      console.log('   2. Run: pnpm docs:generate');
      console.log('   3. Review changes with: git diff apps/mcp-server/data');
      console.log('   4. Commit normalized schemas');
    } else {
      console.log('\n✅ All schemas already normalized!');
    }

  } catch (error) {
    console.error('❌ Error during normalization:', error);
    process.exit(1);
  }
}

// Run normalization
normalizeAllSchemas();
